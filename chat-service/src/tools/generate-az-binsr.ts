import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateAzBinsr } from '../forms/templates/az-binsr'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_az_binsr',
  description:
    "Generate the Arizona BINSR (Buyer's Inspection Notice and Seller's Response) form after the inspection is complete. " +
    'Lists inspection findings and requests repair, replacement, or credit from the seller. ' +
    'Call this during the inspection phase of an AZ closing.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      inspectionDate: { type: 'string', description: 'Date the inspection was performed (ISO date, YYYY-MM-DD).' },
      inspectionItems: {
        type: 'array',
        description: 'List of inspection findings and requested actions (minimum 1 item).',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'What the buyer found or requests.' },
            requestedAction: { type: 'string', description: 'e.g. "Repair", "Credit", "Replace".' },
          },
          required: ['description', 'requestedAction'],
        },
        minItems: 1,
      },
      requestedCreditTotal: {
        type: 'number',
        description: 'Total dollar credit requested from seller, if applicable.',
      },
    },
    required: ['closingId', 'inspectionDate', 'inspectionItems'],
  },
}

interface InspectionItem {
  description: string
  requestedAction: string
}

interface GenerateAzBinsrInput {
  closingId: string
  inspectionDate: string
  inspectionItems: InspectionItem[]
  requestedCreditTotal?: number
}

export async function execute(
  userId: string,
  input: GenerateAzBinsrInput,
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

  const binsrDeadline = closing.deadlines?.binsrResponseDeadline ?? 'see contract'

  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: closing.listingAddress,
    buyers: offer.buyers.map((b) => ({ fullLegalName: b.fullLegalName })),
    inspectionDate: input.inspectionDate,
    inspectionItems: input.inspectionItems,
    requestedCreditTotal: input.requestedCreditTotal,
    binsrDeadline,
  }

  const pdfBuffer = await generateAzBinsr(data)

  const documentId = randomUUID()
  const fileName = `az-binsr-${closing.closingId}.pdf`
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
    documentType: 'binsr',
  }
  await dynamo.send(
    new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }),
  )

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `BINSR — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message: "Your Buyer's Inspection Notice and Seller's Response (BINSR) is ready for review and signature. Please sign and deliver to the seller's agent before the BINSR deadline.",
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'binsr' },
  })

  // Update closing with document + signing request IDs (fetch + merge + put to handle missing nested maps)
  const updatedClosing: Closing = {
    ...closing,
    documents: { ...(closing.documents ?? {}), binsr: documentId },
    signingRequests: { ...(closing.signingRequests ?? {}), binsr: signatureRequestId },
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
    message: `BINSR generated and sent to ${buyerEmails} for signing via Dropbox Sign. After signing, deliver the notice to the seller's agent. The seller has 5 days to respond (deadline: ${binsrDeadline}).`,
  }
}
