import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateTxOneToFour } from '../forms/templates/tx-one-to-four'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_tx_purchase_agreement',
  description:
    'Generate the TREC One to Four Family Residential Contract for a Texas property purchase. ' +
    'Call this after offer terms (including option fee and option period days) are finalized for TX properties. ' +
    'TREC forms are legally required in Texas.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      optionPeriodDays: {
        type: 'number',
        description: 'Number of days for the option period (default 7). Typically 5–10 days.',
      },
      optionFee: {
        type: 'number',
        description: 'Option fee amount in dollars (default 0). Typically $100–$500, negotiable.',
      },
    },
    required: ['closingId'],
  },
}

interface GenerateTxPurchaseAgreementInput {
  closingId: string
  optionPeriodDays?: number
  optionFee?: number
}

export async function execute(
  userId: string,
  input: GenerateTxPurchaseAgreementInput,
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

  // Fetch linked offer for buyer details and terms
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

  // Prefer values from offer terms, fall back to tool input params
  const optionFee = offer.terms.optionFee ?? input.optionFee ?? 0
  const optionPeriodDays = offer.terms.optionPeriodDays ?? input.optionPeriodDays ?? 7

  const data = {
    generatedDate: new Date().toISOString().split('T')[0],
    listingAddress: closing.listingAddress,
    purchasePrice: offer.terms.offerPrice,
    earnestMoneyAmount: offer.terms.earnestMoneyAmount ?? 0,
    optionFee,
    optionPeriodDays,
    closingDate: offer.terms.closingDate,
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
    titleCompany: closing.titleCompany,
  }

  const pdfBuffer = await generateTxOneToFour(data)

  const documentId = randomUUID()
  const fileName = `tx-purchase-agreement-${closing.closingId}.pdf`
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
  const title = `TREC One to Four Contract — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your TREC One to Four Family Residential Contract is ready for review and signature. ' +
      'Please sign before submitting your offer. TREC forms are legally required in Texas.',
    signers,
    metadata: { userId, closingId: closing.closingId, formType: 'purchase_agreement' },
  })

  // Update closing with document + signing request IDs (fetch + merge + put to handle missing nested maps)
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
      `TREC One to Four Family Residential Contract generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      'Please sign before submitting the offer to the seller\'s agent.',
  }
}
