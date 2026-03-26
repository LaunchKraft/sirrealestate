import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateFlPurchaseAgreement } from '../forms/templates/fl-purchase-agreement'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_fl_purchase_agreement',
  description:
    'Generate the Florida Contract for Residential Sale and Purchase (CRSP) or AS IS variant for a Florida property purchase. ' +
    'All Florida deadlines run from the "Effective Date" — when the last party signs. ' +
    'EMD is due within 3 days of the Effective Date. ' +
    'Ask the buyer whether they want the standard CRSP or the AS IS variant (common for cash/investor deals or properties needing work). ' +
    'Always confirm inspectionDays (default 15 calendar days) and loanApprovalDays (default 30) before generating.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      inspectionDays: {
        type: 'number',
        description: 'Inspection period in calendar days from Effective Date (default 15).',
      },
      loanApprovalDays: {
        type: 'number',
        description: 'Loan approval deadline in days from Effective Date (default 30). Only applies to financed offers.',
      },
      asIs: {
        type: 'boolean',
        description: 'Use the AS IS Contract variant (buyer accepts property as-is, seller not obligated to repair). Default false.',
      },
    },
    required: ['closingId'],
  },
}

interface GenerateFlPurchaseAgreementInput {
  closingId: string
  inspectionDays?: number
  loanApprovalDays?: number
  asIs?: boolean
}

export async function execute(
  userId: string,
  input: GenerateFlPurchaseAgreementInput,
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
    inspectionDays: input.inspectionDays ?? 15,
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
      loanApprovalDays: input.loanApprovalDays ?? 30,
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
    asIs: input.asIs ?? false,
  }

  const pdfBuffer = await generateFlPurchaseAgreement(data)

  const contractType = input.asIs ? 'as-is' : 'crsp'
  const documentId = randomUUID()
  const fileName = `fl-purchase-agreement-${contractType}-${closing.closingId}.pdf`
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

  const contractName = input.asIs ? 'Florida AS IS Contract' : 'Florida CRSP'
  const signers = offer.buyers.map((b) => ({ name: b.fullLegalName, email: b.email }))
  const title = `${contractName} — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message: `Your ${contractName} is ready for review and signature. Please sign before submitting your offer to the seller's agent.`,
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
  const asIsNote = input.asIs
    ? 'AS IS contract: seller is NOT obligated to make repairs; buyer may cancel during the inspection period and receive full EMD refund. '
    : ''
  return {
    documentId,
    message:
      `${contractName} generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      asIsNote +
      'Earnest money is due within 3 days of the Effective Date (when both parties have signed). ' +
      'Please sign before submitting the offer to the seller\'s agent.',
  }
}
