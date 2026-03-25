import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateCoInspectionObjection } from '../forms/templates/co-inspection-objection'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_inspection_objection',
  description:
    'Generate a Colorado Inspection Objection notice (CBS2 Section 10) and send it to the buyer(s) ' +
    'for e-signature via Dropbox Sign. Call this when the buyer wants to object to one or more inspection items. ' +
    'After signing, the buyer delivers this document to the seller\'s agent before the Inspection Objection Deadline.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      inspectionDate: { type: 'string', description: 'Date the inspection was performed (YYYY-MM-DD).' },
      objections: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of inspection items being objected to. Each item is a brief description.',
      },
      requestedRemedies: {
        type: 'string',
        description: 'What the buyer is requesting (repairs, credits, price reduction, etc.).',
      },
    },
    required: ['closingId', 'inspectionDate', 'objections'],
  },
}

interface GenerateInspectionObjectionInput {
  closingId: string
  inspectionDate: string
  objections: string[]
  requestedRemedies?: string
}

export async function execute(
  userId: string,
  input: GenerateInspectionObjectionInput,
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
    inspectionDate: input.inspectionDate,
    objections: input.objections,
    requestedRemedies: input.requestedRemedies,
    inspectionObjectionDeadline: closing.deadlines?.inspectionObjectionDeadline,
  }

  const pdfBuffer = await generateCoInspectionObjection(data)

  const documentId = randomUUID()
  const fileName = `inspection-objection-${closing.closingId}.pdf`
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
    documentType: 'inspection_objection',
  }
  await dynamo.send(
    new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }),
  )

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `Inspection Objection — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message: 'Your inspection objection notice is ready for review and signature. Please sign before the Inspection Objection Deadline.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'inspection_objection' },
  })

  // Update closing with document + signing request IDs (fetch + merge + put to handle missing nested maps)
  const updatedClosing: Closing = {
    ...closing,
    documents: { ...(closing.documents ?? {}), inspection_objection: documentId },
    signingRequests: { ...(closing.signingRequests ?? {}), inspection_objection: signatureRequestId },
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
    message: `Inspection Objection generated and sent to ${buyerEmails} for signing via Dropbox Sign. After signing, deliver the signed notice to the seller's agent before the Inspection Objection Deadline.`,
  }
}
