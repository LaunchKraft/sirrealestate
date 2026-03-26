import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Offer, UserDocument, FinancedFinancing } from '../types'
import { generateUtPurchaseAgreement } from '../forms/templates/ut-purchase-agreement'
import { DropboxSignProvider } from '../forms/signing-provider'
import type { UtPurchaseAgreementData } from '../forms/templates/ut-purchase-agreement'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_ut_repc',
  description:
    'Generate a Utah Real Estate Purchase Contract (REPC) PDF for a completed offer draft and send it ' +
    'to the buyer(s) for e-signature via Dropbox Sign. The offer must have status "ready" with all required ' +
    'fields filled before calling this tool. Use this tool for properties located in Utah.',
  input_schema: {
    type: 'object',
    properties: {
      offerId: {
        type: 'string',
        description: 'The offer ID to generate the Utah REPC for.',
      },
      dueDiligenceDays: {
        type: 'number',
        description: 'Due Diligence period in calendar days (default 14). During this period the buyer may cancel for any reason.',
      },
    },
    required: ['offerId'],
  },
}

export async function execute(
  userId: string,
  input: { offerId: string; dueDiligenceDays?: number },
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
  if (!offer.buyers?.length)                       missing.push('buyers')
  if (offer.buyers?.some((b) => !b.fullLegalName)) missing.push('buyer full legal name(s)')
  if (offer.buyers?.some((b) => !b.street))        missing.push('buyer address(es)')
  if (!offer.financing)                            missing.push('financing type')
  if (!offer.terms?.offerPrice)                    missing.push('offer price')
  if (!offer.terms?.earnestMoneyAmount)            missing.push('earnest money amount')
  if (!offer.terms?.closingDate)                   missing.push('settlement deadline')
  if (missing.length) {
    return { message: `Cannot generate Utah REPC. Missing: ${missing.join(', ')}. Use update_offer to complete these fields first.` }
  }

  const financing = offer.financing!
  const terms = offer.terms!

  // Build template data
  const data: UtPurchaseAgreementData = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: offer.listingAddress,
    buyers: offer.buyers.map((b) => ({
      fullLegalName: b.fullLegalName,
      street: b.street,
      unit: b.unit,
      city: b.city,
      state: b.state,
      zipCode: b.zipCode,
      phone: b.phone,
      email: b.email,
      isPrimaryBuyer: b.isPrimaryBuyer,
    })),
    offerPrice: terms.offerPrice!,
    earnestMoneyAmount: terms.earnestMoneyAmount!,
    settlementDeadline: terms.closingDate!,
    possessionDate: terms.possessionDate,
    financingType: financing.type as 'cash' | 'financed',
    ...(financing.type === 'financed' && {
      loanAmount: (financing as FinancedFinancing).loanAmount,
      loanType: (financing as FinancedFinancing).loanType,
      downPaymentAmount: (financing as FinancedFinancing).downPaymentAmount,
      lenderName: (financing as FinancedFinancing).lenderName,
    }),
    dueDiligenceDays: input.dueDiligenceDays ?? terms.contingencies?.inspectionPeriodDays ?? 14,
    appraisalContingency: terms.contingencies?.appraisal ?? true,
    financingContingency: terms.contingencies?.financing ?? (financing.type === 'financed'),
    financingDeadlineDays: terms.contingencies?.financingDeadlineDays,
    saleOfExistingHomeContingency: terms.contingencies?.saleOfExistingHome,
    sellerConcessions: terms.sellerConcessions,
    inclusions: terms.inclusions,
    exclusions: terms.exclusions,
  }

  // Generate PDF
  const pdfBuffer = await generateUtPurchaseAgreement(data)

  // Upload to S3 and create Documents table entry
  const documentId = randomUUID()
  const fileName = `ut-repc-${offer.offerId}.pdf`
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
    documentType: 'purchase_agreement',
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Item: marshall(doc),
    }),
  )

  // Send for signing via Dropbox Sign
  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `Utah REPC — ${offer.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your Utah Real Estate Purchase Contract is ready for review and signature. ' +
      'Please sign at your earliest convenience.',
    signers,
    metadata: { userId, offerId: offer.offerId, formType: 'ut_repc' },
  })

  // Update offer with document ID and signature request ID
  const updatedOffer: Offer = {
    ...offer,
    purchaseAgreementDocumentId: documentId,
    signingRequests: { ...offer.signingRequests, purchase_agreement: signatureRequestId },
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
      `Utah REPC generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      `The buyer(s) will receive a signing email shortly. ` +
      `Reminder: earnest money must be deposited within 3 business days of acceptance.`,
  }
}
