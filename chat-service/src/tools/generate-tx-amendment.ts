import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateTxAmendment } from '../forms/templates/tx-amendment'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_tx_amendment',
  description:
    'Generate a TREC Amendment to Contract for a Texas closing. ' +
    'Use this during the option period to document agreed repairs, seller credits, or other contract modifications after the inspection. ' +
    'Both buyer and seller must sign amendments.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      amendments: {
        type: 'array',
        description: 'List of agreed amendments to the contract (minimum 1 item).',
        items: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Description of the amendment, e.g. "Seller to repair roof by closing" or "Seller to provide $2,500 credit at closing".',
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

interface AmendmentItem {
  description: string
}

interface GenerateTxAmendmentInput {
  closingId: string
  amendments: AmendmentItem[]
  sellerCredit?: number
  newClosingDate?: string
}

export async function execute(
  userId: string,
  input: GenerateTxAmendmentInput,
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

  // Fetch linked offer for buyer details and original contract date
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

  // Use submittedAt or acceptedAt as the original contract date; fall back to offer createdAt
  const originalContractDate =
    (offer.submittedAt ?? offer.createdAt).split('T')[0]

  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: closing.listingAddress,
    originalContractDate,
    buyers: offer.buyers.map((b) => ({ fullLegalName: b.fullLegalName })),
    amendments: input.amendments,
    sellerCredit: input.sellerCredit,
    newClosingDate: input.newClosingDate,
  }

  const pdfBuffer = await generateTxAmendment(data)

  const documentId = randomUUID()
  const fileName = `tx-amendment-${closing.closingId}.pdf`
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
    documentType: 'amendment',
  }
  await dynamo.send(
    new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }),
  )

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `TREC Amendment to Contract — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your TREC Amendment to Contract is ready for review and signature. ' +
      'After you sign, this amendment will need to be countersigned by the seller before it is binding.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'amendment' },
  })

  // Update closing with document + signing request IDs (fetch + merge + put to handle missing nested maps)
  const updatedClosing: Closing = {
    ...closing,
    documents: { ...(closing.documents ?? {}), amendment: documentId },
    signingRequests: { ...(closing.signingRequests ?? {}), amendment: signatureRequestId },
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
      `TREC Amendment to Contract generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      'After buyer signs, the seller must also countersign the amendment for it to be binding.',
  }
}
