import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateTxFinancingAddendum } from '../forms/templates/tx-financing-addendum'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_tx_financing_addendum',
  description:
    'Generate the TREC Third Party Financing Addendum for a financed Texas purchase. ' +
    'This is a separate required document that must accompany the One to Four contract for all financed offers. ' +
    'Only call this for financed Texas purchases.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      financingDeadlineDays: {
        type: 'number',
        description: 'Days from contract execution for buyer to obtain financing commitment (default 21).',
      },
      appraisalDeadlineDays: {
        type: 'number',
        description: 'Days from contract execution for appraisal (default 21).',
      },
    },
    required: ['closingId'],
  },
}

interface GenerateTxFinancingAddendumInput {
  closingId: string
  financingDeadlineDays?: number
  appraisalDeadlineDays?: number
}

export async function execute(
  userId: string,
  input: GenerateTxFinancingAddendumInput,
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

  // Fetch linked offer for buyer details and financing terms
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
  if (!offer.terms?.offerPrice) return { message: 'Cannot generate: offer price is not set.' }

  const financing = offer.financing
  if (financing?.type !== 'financed') {
    return { message: 'Cannot generate financing addendum: this is a cash purchase.' }
  }

  if (!financing.loanAmount) return { message: 'Cannot generate: loan amount is not set on the offer.' }
  if (!financing.downPaymentAmount) return { message: 'Cannot generate: down payment amount is not set on the offer.' }

  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: closing.listingAddress,
    purchasePrice: offer.terms.offerPrice,
    buyers: offer.buyers.map((b) => ({ fullLegalName: b.fullLegalName })),
    loanType: financing.loanType ?? 'conventional',
    loanAmount: financing.loanAmount,
    downPaymentAmount: financing.downPaymentAmount,
    lenderName: financing.lenderName,
    financingDeadlineDays: input.financingDeadlineDays ?? 21,
    appraisalDeadlineDays: input.appraisalDeadlineDays ?? 21,
  }

  const pdfBuffer = await generateTxFinancingAddendum(data)

  const documentId = randomUUID()
  const fileName = `tx-financing-addendum-${closing.closingId}.pdf`
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
    documentType: 'financing_addendum',
  }
  await dynamo.send(
    new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }),
  )

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `TREC Financing Addendum — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your TREC Third Party Financing Addendum is ready for review and signature. ' +
      'This document must accompany your One to Four contract for your financed Texas purchase.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'financing_addendum' },
  })

  // Update closing with document + signing request IDs (fetch + merge + put to handle missing nested maps)
  const updatedClosing: Closing = {
    ...closing,
    documents: { ...(closing.documents ?? {}), financing_addendum: documentId },
    signingRequests: { ...(closing.signingRequests ?? {}), financing_addendum: signatureRequestId },
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
      `TREC Third Party Financing Addendum generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      'This must be signed alongside the One to Four contract before submitting the offer.',
  }
}
