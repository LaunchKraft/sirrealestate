import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { Closing, Offer, UserDocument } from '../types'
import { generateIdPurchaseAgreement } from '../forms/templates/id-purchase-agreement'
import { DropboxSignProvider } from '../forms/signing-provider'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const signer = new DropboxSignProvider()

export const definition = {
  name: 'generate_id_purchase_agreement',
  description:
    'Generate the Idaho Real Estate Purchase and Sale Agreement (IREC form) for an Idaho property purchase. ' +
    'Call this after offer terms are finalized for ID properties. ' +
    'Always confirm inspectionDays (default 10 business days) with the buyer before generating.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: { type: 'string', description: 'The closing ID.' },
      inspectionDays: {
        type: 'number',
        description: 'Number of business days for the inspection period (default 10).',
      },
    },
    required: ['closingId'],
  },
}

interface GenerateIdPurchaseAgreementInput {
  closingId: string
  inspectionDays?: number
}

export async function execute(
  userId: string,
  input: GenerateIdPurchaseAgreementInput,
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
    titleCompany: closing.titleCompany,
  }

  const pdfBuffer = await generateIdPurchaseAgreement(data)

  const documentId = randomUUID()
  const fileName = `id-purchase-agreement-${closing.closingId}.pdf`
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
  const title = `Idaho Purchase and Sale Agreement — ${closing.listingAddress}`

  const { signatureRequestId } = await signer.createSignatureRequest({
    pdfBuffer,
    fileName,
    title,
    subject: title,
    message:
      'Your Idaho Real Estate Purchase and Sale Agreement is ready for review and signature. ' +
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
  return {
    documentId,
    message:
      `Idaho Purchase and Sale Agreement generated and sent to ${buyerEmails} for signing via Dropbox Sign. ` +
      'Please sign before submitting the offer to the seller\'s agent. ' +
      'Reminder: earnest money must be deposited within 3 business days of acceptance.',
  }
}
