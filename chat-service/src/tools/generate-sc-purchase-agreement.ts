import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateScPurchaseAgreement } from '../forms/templates/sc-purchase-agreement'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_sc_purchase_agreement',
  description:
    'Generate the South Carolina Offer to Purchase and Contract of Sale (SCR Form 400) for a South Carolina property purchase. ' +
    'South Carolina requires all residential closings to be conducted by a licensed SC attorney — always ask the buyer if they have a closing attorney. ' +
    'EMD is due within 5 days of acceptance and is typically held by the closing attorney. ' +
    'Always confirm inspectionDays (default 10 business days) with the buyer before generating.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      inspectionDays: {
        type: 'number',
        description: 'Number of business days for the inspection period (default 10).',
      },
      closingAttorney: {
        type: 'string',
        description: 'Name/firm of the SC closing attorney (required by SC law). Ask the buyer if not provided.',
      },
    },
    required: ['closingId'],
  },
}

interface GenerateScPurchaseAgreementInput {
  closingId: string
  inspectionDays?: number
  closingAttorney?: string
}

export async function execute(
  userId: string,
  input: GenerateScPurchaseAgreementInput,
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
    closingDate: offer.terms.closingDate,
    inspectionDays: input.inspectionDays ?? 10,
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
      inspection: offer.terms.contingencies?.inspection ?? true,
      appraisal: offer.terms.contingencies?.appraisal ?? true,
      financing: offer.terms.contingencies?.financing ?? (financing?.type === 'financed'),
    },
    closingAttorney: input.closingAttorney ?? closing.titleCompany,
  }

  const pdfBuffer = await generateScPurchaseAgreement(data)

  const documentId = randomUUID()
  const fileName = `sc-purchase-agreement-${closing.closingId}.pdf`
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
  const title = `SC Offer to Purchase and Contract of Sale — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your South Carolina Offer to Purchase and Contract of Sale is ready for review and signature. ' +
      'Please sign before submitting your offer to the seller\'s agent.',
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
  const attorneyNote = input.closingAttorney
    ? `Closing attorney: ${input.closingAttorney}. `
    : 'Reminder: SC law requires a licensed SC attorney to conduct the closing — please designate a closing attorney. '
  return {
    documentId,
    message:
      `South Carolina Offer to Purchase and Contract of Sale generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      attorneyNote +
      'Earnest money is due within 5 days of acceptance.',
  }
}
