import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateMtAddendum } from '../forms/templates/mt-addendum'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_mt_addendum',
  description:
    'Generate an Addendum to the Montana Buy-Sell Agreement. ' +
    'Use this during or after the inspection period to document agreed repairs, seller credits, or other contract modifications. ' +
    'Both buyer and seller must sign the addendum.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      amendments: {
        type: 'array',
        description: 'List of agreed modifications (minimum 1 item).',
        items: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Description of the modification, e.g. "Seller to repair roof by closing" or "Seller to provide $3,000 credit at closing".',
            },
          },
          required: ['description'],
        },
        minItems: 1,
      },
      sellerCredit: {
        type: 'number',
        description: 'Total seller credit amount in dollars, if applicable.',
      },
      newClosingDate: {
        type: 'string',
        description: 'New closing date in ISO format (YYYY-MM-DD) if the closing date is being amended.',
      },
    },
    required: ['closingId', 'amendments'],
  },
}

interface AmendmentItem { description: string }

interface GenerateMtAddendumInput {
  closingId: string
  amendments: AmendmentItem[]
  sellerCredit?: number
  newClosingDate?: string
}

export async function execute(
  userId: string,
  input: GenerateMtAddendumInput,
): Promise<{ documentId?: string; message: string }> {
  const closingResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      Key: marshall({ userId, closingId: input.closingId }),
    }),
  )
  if (!closingResult.Item) return { message: `Closing ${input.closingId} not found.` }
  const closing = unmarshall(closingResult.Item) as Closing

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

  const pdfBuffer = await generateMtAddendum(data)

  const documentId = randomUUID()
  const fileName = `mt-addendum-${closing.closingId}.pdf`
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
    documentType: 'addendum',
  }
  await dynamo.send(
    new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }),
  )

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `Montana Addendum to Buy-Sell Agreement — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your Montana Addendum to Buy-Sell Agreement is ready for review and signature. ' +
      'After you sign, this addendum will need to be countersigned by the seller before it is binding.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'addendum' },
  })

  const updatedClosing: Closing = {
    ...closing,
    documents: { ...(closing.documents ?? {}), addendum: documentId },
    signingRequests: { ...(closing.signingRequests ?? {}), addendum: signatureRequestId },
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
    message:
      `Montana Addendum to Buy-Sell Agreement generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      'After buyer signs, the seller must also countersign the addendum for it to be binding.',
  }
}
