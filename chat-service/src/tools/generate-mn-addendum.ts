import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateMnAddendum } from '../forms/templates/mn-addendum'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_mn_addendum',
  description:
    'Generate a Minnesota Addendum to Purchase Agreement to document agreed repairs, credits, or contract modifications. ' +
    'Use this during or after the inspection period. Both buyer and seller must sign.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      amendments: {
        type: 'array',
        description: 'List of agreed modifications (minimum 1 item).',
        items: {
          type: 'object',
          properties: { description: { type: 'string', description: 'Description of the modification.' } },
          required: ['description'],
        },
        minItems: 1,
      },
      sellerCredit: { type: 'number', description: 'Total seller credit in dollars, if applicable.' },
      newClosingDate: { type: 'string', description: 'New date of closing in ISO format (YYYY-MM-DD) if being amended.' },
    },
    required: ['closingId', 'amendments'],
  },
}

interface AmendmentItem { description: string }

interface GenerateMnAddendumInput {
  closingId: string
  amendments: AmendmentItem[]
  sellerCredit?: number
  newClosingDate?: string
}

export async function execute(
  userId: string,
  input: GenerateMnAddendumInput,
): Promise<{ documentId?: string; message: string }> {
  const closingResult = await dynamo.send(new GetItemCommand({ TableName: process.env.CLOSINGS_TABLE!, Key: marshall({ userId, closingId: input.closingId }) }))
  if (!closingResult.Item) return { message: `Closing ${input.closingId} not found.` }
  const closing = unmarshall(closingResult.Item) as Closing

  const offerResult = await dynamo.send(new QueryCommand({ TableName: process.env.OFFERS_TABLE!, KeyConditionExpression: 'userId = :uid AND offerId = :oid', ExpressionAttributeValues: marshall({ ':uid': userId, ':oid': closing.offerId }), Limit: 1 }))
  if (!offerResult.Items?.length) return { message: `Offer ${closing.offerId} not found.` }
  const offer = unmarshall(offerResult.Items[0]) as Offer
  if (!offer.buyers?.length) return { message: 'Cannot generate: no buyers on the linked offer.' }

  const originalContractDate = (offer.submittedAt ?? offer.createdAt).split('T')[0]
  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: closing.listingAddress,
    originalContractDate,
    buyers: offer.buyers.map((b) => ({ fullLegalName: b.fullLegalName })),
    amendments: input.amendments,
    sellerCredit: input.sellerCredit,
    newClosingDate: input.newClosingDate,
  }

  const pdfBuffer = await generateMnAddendum(data)
  const documentId = randomUUID()
  const fileName = `mn-addendum-${closing.closingId}.pdf`
  const s3Key = `${userId}/${documentId}`
  const now = new Date().toISOString()

  await s3.send(new PutObjectCommand({ Bucket: process.env.DOCUMENT_BUCKET_NAME!, Key: s3Key, Body: pdfBuffer, ContentType: 'application/pdf' }))

  const doc: UserDocument = { userId, documentId, fileName, contentType: 'application/pdf', sizeBytes: pdfBuffer.length, s3Key, uploadedAt: now, documentType: 'addendum' }
  await dynamo.send(new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }))

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `Minnesota Addendum to Purchase Agreement — ${closing.listingAddress}`
  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer, fileName, title, subject: title,
    message: 'Your Minnesota Addendum to Purchase Agreement is ready for review and signature. After you sign, the seller must countersign.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'addendum' },
  })

  const updatedClosing: Closing = { ...closing, documents: { ...(closing.documents ?? {}), addendum: documentId }, signingRequests: { ...(closing.signingRequests ?? {}), addendum: signatureRequestId }, updatedAt: now }
  await dynamo.send(new PutItemCommand({ TableName: process.env.CLOSINGS_TABLE!, Item: marshall(updatedClosing, { removeUndefinedValues: true }) }))

  return {
    documentId,
    message: `Minnesota Addendum to Purchase Agreement generated and sent to ${offer.buyers.map((b) => b.email).join(', ')} for signing. After buyer signs, seller must countersign.`,
  }
}
