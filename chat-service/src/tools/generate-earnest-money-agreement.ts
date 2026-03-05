import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Offer, UserDocument } from '../types'
import { generateEarnestMoneyAgreement } from '../forms/templates/earnest-money-agreement'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_earnest_money_agreement',
  description:
    'Generate an earnest money deposit (EMD) agreement PDF for an offer and send it to the buyer(s) ' +
    'for e-signature via Dropbox Sign. The offer must have status "ready" with offer price, ' +
    'earnest money amount, and closing date filled in. Call this after the purchase agreement ' +
    'has been signed, or in parallel if the buyer is ready to submit the deposit.',
  input_schema: {
    type: 'object',
    properties: {
      offerId: {
        type: 'string',
        description: 'The offer ID to generate the earnest money agreement for.',
      },
      depositDueDate: {
        type: 'string',
        description: 'ISO 8601 date (YYYY-MM-DD) by which the deposit must be submitted. Defaults to 3 business days if omitted.',
      },
      escrowHolderName: {
        type: 'string',
        description: 'Name of the escrow/title company holding the deposit. Ask the buyer if unknown.',
      },
    },
    required: ['offerId'],
  },
}

export async function execute(
  userId: string,
  input: { offerId: string; depositDueDate?: string; escrowHolderName?: string },
): Promise<{ documentId?: string; message: string }> {
  // Fetch offer
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Key: marshall({ userId, offerId: input.offerId }),
    }),
  )
  if (!result.Item) return { message: `Offer ${input.offerId} not found.` }
  const offer = unmarshall(result.Item) as Offer

  // Validate required fields
  const missing: string[] = []
  if (!offer.buyers?.length)                      missing.push('buyers')
  if (offer.buyers?.some((b) => !b.fullLegalName)) missing.push('buyer full legal name(s)')
  if (!offer.terms?.earnestMoneyAmount)            missing.push('earnest money amount')
  if (!offer.terms?.closingDate)                   missing.push('closing date')
  if (missing.length) {
    return { message: `Cannot generate earnest money agreement. Missing: ${missing.join(', ')}. Use update_offer to complete these fields first.` }
  }

  // Build template data
  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    propertyState: offer.propertyState ?? 'CO',
    listingAddress: offer.listingAddress,
    buyers: offer.buyers.map((b) => ({
      fullLegalName: b.fullLegalName,
      isPrimaryBuyer: b.isPrimaryBuyer,
    })),
    earnestMoneyAmount: offer.terms!.earnestMoneyAmount!,
    depositDueDate: input.depositDueDate,
    escrowHolderName: input.escrowHolderName,
    closingDate: offer.terms!.closingDate!,
  }

  // Generate PDF
  const pdfBuffer = await generateEarnestMoneyAgreement(data)

  // Upload to S3 and create Documents table entry
  const documentId = randomUUID()
  const fileName = `earnest-money-agreement-${offer.offerId}.pdf`
  const s3Key = `${userId}/${documentId}`

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET_NAME!,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }),
  )

  const now = new Date().toISOString()
  const doc: UserDocument = {
    userId,
    documentId,
    fileName,
    contentType: 'application/pdf',
    sizeBytes: pdfBuffer.length,
    s3Key,
    uploadedAt: now,
    documentType: 'earnest_money_agreement',
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Item: marshall(doc),
    }),
  )

  // Send for signing via Dropbox Sign
  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `Earnest Money Deposit Agreement — ${offer.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your earnest money deposit agreement is ready for review and signature. ' +
      'Please sign at your earliest convenience.',
    signers,
    metadata: { userId, offerId: offer.offerId, formType: 'earnest_money_agreement' },
  })

  // Update offer
  const updatedOffer: Offer = {
    ...offer,
    earnestMoneyAgreementDocumentId: documentId,
    signingRequests: { ...offer.signingRequests, earnest_money_agreement: signatureRequestId },
    updatedAt: now,
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Item: marshall(updatedOffer, { removeUndefinedValues: true }),
    }),
  )

  const buyerEmails = offer.buyers.map((b) => b.email).join(', ')
  return {
    documentId,
    message:
      `Earnest money deposit agreement generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      `Once signed, initiate the actual deposit transfer by asking me to send the earnest money via Earnnest.`,
  }
}
