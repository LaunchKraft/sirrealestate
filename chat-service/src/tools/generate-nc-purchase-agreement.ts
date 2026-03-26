import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateNcPurchaseAgreement } from '../forms/templates/nc-purchase-agreement'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_nc_purchase_agreement',
  description:
    'Generate the North Carolina Offer to Purchase and Contract (NC Realtors / NC Bar Form 2-T) for a North Carolina property purchase. ' +
    'NC is unique: the buyer pays a non-refundable Due Diligence Fee directly to the seller at acceptance. ' +
    'Always confirm both the dueDiligenceFee amount and dueDiligenceDays (typically 14–21 calendar days) with the buyer before generating. ' +
    'The Due Diligence Fee is credited toward the purchase price at closing but is forfeited if the buyer terminates early.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      dueDiligenceFee: {
        type: 'number',
        description: 'Non-refundable due diligence fee paid directly to seller at acceptance (NC-specific). Required.',
      },
      dueDiligenceDays: {
        type: 'number',
        description: 'Length of the due diligence period in calendar days (typically 14–21). Default 14.',
      },
    },
    required: ['closingId', 'dueDiligenceFee'],
  },
}

interface GenerateNcPurchaseAgreementInput {
  closingId: string
  dueDiligenceFee: number
  dueDiligenceDays?: number
}

export async function execute(
  userId: string,
  input: GenerateNcPurchaseAgreementInput,
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
  if (!offer.terms?.offerPrice) return { message: 'Cannot generate: offer price is not set.' }
  if (!offer.terms?.closingDate) return { message: 'Cannot generate: closing date is not set.' }

  const financing = offer.financing
  const financed = financing?.type === 'financed' ? financing : null

  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: closing.listingAddress,
    purchasePrice: offer.terms.offerPrice,
    earnestMoneyAmount: offer.terms.earnestMoneyAmount ?? 0,
    dueDiligenceFee: input.dueDiligenceFee,
    closingDate: offer.terms.closingDate,
    dueDiligenceDays: input.dueDiligenceDays ?? 14,
    possessionDate: offer.terms.possessionDate,
    buyers: offer.buyers.map((b) => ({
      fullLegalName: b.fullLegalName,
      street: b.street,
      city: b.city,
      state: b.state,
      zipCode: b.zipCode,
      phone: b.phone,
      email: b.email,
    })),
    financing: {
      type: (financing?.type ?? 'cash') as 'cash' | 'financed',
      loanType: financed?.loanType,
      loanAmount: financed?.loanAmount,
      downPaymentAmount: financed?.downPaymentAmount,
    },
    inclusions: offer.terms.inclusions,
    exclusions: offer.terms.exclusions,
    sellerConcessions: offer.terms.sellerConcessions,
    hasHoa: closing.hasHoa,
    contingencies: {
      appraisal: offer.terms.contingencies?.appraisal ?? true,
      financing: offer.terms.contingencies?.financing ?? (financing?.type === 'financed'),
    },
    titleCompany: closing.titleCompany,
  }

  const pdfBuffer = await generateNcPurchaseAgreement(data)

  const documentId = randomUUID()
  const fileName = `nc-purchase-agreement-${closing.closingId}.pdf`
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
    documentType: 'purchase_agreement',
  }
  await dynamo.send(
    new PutItemCommand({ TableName: process.env.DOCUMENTS_TABLE!, Item: marshall(doc) }),
  )

  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `NC Offer to Purchase and Contract — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your North Carolina Offer to Purchase and Contract is ready for review and signature. ' +
      'Please review carefully — the Due Diligence Fee is paid directly to the seller at acceptance and is non-refundable.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'purchase_agreement' },
  })

  const updatedClosing: Closing = {
    ...closing,
    documents: { ...(closing.documents ?? {}), purchase_agreement: documentId },
    signingRequests: { ...(closing.signingRequests ?? {}), purchase_agreement: signatureRequestId },
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
      `NC Offer to Purchase and Contract generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      `Due Diligence Fee of $${input.dueDiligenceFee.toLocaleString()} is due directly to the seller at acceptance — this fee is NON-REFUNDABLE. ` +
      'Earnest money is held in escrow and also becomes at risk after the Due Diligence Period ends. ' +
      'North Carolina closings must be conducted by a licensed NC attorney.',
  }
}
