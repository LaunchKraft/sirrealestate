import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateCoInspectionResolution } from '../forms/templates/co-inspection-resolution'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_inspection_resolution',
  description:
    'Generate a Colorado Inspection Resolution document (CBS2 Section 10.3) and send it to the buyer(s) ' +
    'for e-signature via Dropbox Sign. Call this after an inspection objection has been negotiated — either ' +
    'the parties have agreed on remedies/credits, or the buyer is waiving all objections.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      resolutionType: {
        type: 'string',
        enum: ['agreement', 'waiver'],
        description: '"agreement" = parties agreed on remedies or credits. "waiver" = buyer withdraws all objections.',
      },
      agreedRemedies: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of agreed repair items or concessions (required when resolutionType is "agreement").',
      },
      sellerCredit: {
        type: 'number',
        description: 'Dollar amount the seller will credit at closing in lieu of repairs (optional).',
      },
      waivedItems: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific items being waived even if resolutionType is "agreement".',
      },
    },
    required: ['closingId', 'resolutionType'],
  },
}

interface GenerateInspectionResolutionInput {
  closingId: string
  resolutionType: 'agreement' | 'waiver'
  agreedRemedies?: string[]
  sellerCredit?: number
  waivedItems?: string[]
}

export async function execute(
  userId: string,
  input: GenerateInspectionResolutionInput,
): Promise<{ documentId?: string; message: string }> {
  // Fetch closing
  const closingResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      Key: marshall({ userId, closingId: input.closingId }),
    }),
  )
  if (!closingResult.Item) return { message: `Closing ${input.closingId} not found.` }
  const closing = unmarshall(closingResult.Item) as Closing

  // Fetch linked offer for buyer details
  const offerResult = await dynamo.send(
    new QueryCommand({
      TableName: process.env.OFFERS_TABLE!,
      KeyConditionExpression: 'userId = :uid AND offerId = :oid',
      ExpressionAttributeValues: marshall({ ':uid': userId, ':oid': closing.offerId }),
      Limit: 1,
    }),
  )
  if (!offerResult.Items?.length) return { message: `Offer ${closing.offerId} not found.` }
  const offer = unmarshall(offerResult.Items[0]) as Offer

  if (!offer.buyers?.length) return { message: 'Cannot generate: no buyers on the linked offer.' }

  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: closing.listingAddress,
    buyers: offer.buyers.map((b) => ({ fullLegalName: b.fullLegalName, email: b.email })),
    resolutionType: input.resolutionType,
    agreedRemedies: input.agreedRemedies,
    sellerCredit: input.sellerCredit,
    waivedItems: input.waivedItems,
  }

  const pdfBuffer = await generateCoInspectionResolution(data)

  const documentId = randomUUID()
  const fileName = `inspection-resolution-${closing.closingId}.pdf`
  const s3Key = `${userId}/${documentId}`
  const now = new Date().toISOString()

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET_NAME!,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }),
  )

  const doc: UserDocument = {
    userId,
    documentId,
    fileName,
    contentType: 'application/pdf',
    sizeBytes: pdfBuffer.length,
    s3Key,
    uploadedAt: now,
    documentType: 'inspection_resolution',
  }
  await dynamo.send(
    new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }),
  )

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `Inspection Resolution — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message: 'Your inspection resolution is ready for review and signature. After all parties sign, this resolves the outstanding inspection objection.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'inspection_resolution' },
  })

  // Update closing with document + signing request IDs (fetch + merge + put to handle missing nested maps)
  const updatedClosing: Closing = {
    ...closing,
    documents: { ...(closing.documents ?? {}), inspection_resolution: documentId },
    signingRequests: { ...(closing.signingRequests ?? {}), inspection_resolution: signatureRequestId },
    updatedAt: now,
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      Item: marshall(updatedClosing, { removeUndefinedValues: true }),
    }),
  )

  const buyerEmails = offer.buyers.map((b) => b.email).join(', ')
  return {
    documentId,
    message: `Inspection Resolution generated and sent to ${buyerEmails} for signing via Dropbox Sign. After signing, this resolves the outstanding inspection objection.`,
  }
}
