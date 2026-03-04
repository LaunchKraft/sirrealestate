import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type {
  Offer,
  OfferBuyer,
  OfferStatus,
  CashFinancing,
  FinancedFinancing,
  PurchaseAgreementTerms,
  OfferContingencies,
} from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'update_offer',
  description:
    'Update an existing offer draft with buyer details, financing information, or purchase terms. ' +
    'Call this progressively as the user provides information — you do not need all fields at once. ' +
    'All fields are optional except offerId. Fetch the current state first with get_offers to avoid overwriting existing data.',
  input_schema: {
    type: 'object',
    properties: {
      offerId: {
        type: 'string',
        description: 'The offer to update.',
      },
      status: {
        type: 'string',
        enum: ['draft', 'ready', 'submitted', 'accepted', 'countered', 'rejected', 'withdrawn'],
        description: 'Set to "ready" once all required fields are complete.',
      },
      buyers: {
        type: 'array',
        description: 'Full replacement of the buyers list. Include all buyers (primary + co-buyers). Each buyer needs fullLegalName, street, city, state, zipCode, phone, email.',
        items: {
          type: 'object',
          properties: {
            buyerId: { type: 'string', description: 'Existing buyerId to update, or omit to generate a new one.' },
            fullLegalName: { type: 'string', description: 'Full legal name as it will appear on the offer.' },
            street: { type: 'string' },
            unit: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string', description: '2-letter state code.' },
            zipCode: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            isPrimaryBuyer: { type: 'boolean' },
          },
        },
      },
      financingType: {
        type: 'string',
        enum: ['cash', 'financed'],
        description: 'Whether this is a cash offer or a financed offer.',
      },
      proofOfFundsDocumentIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'For cash offers: document IDs of uploaded proof-of-funds documents.',
      },
      preApprovalLetterDocumentId: {
        type: 'string',
        description: 'For financed offers: document ID of the uploaded pre-approval letter.',
      },
      lenderName: { type: 'string', description: 'For financed offers: name of the lending institution.' },
      loanType: {
        type: 'string',
        description: 'For financed offers: loan program — conventional, fha, va, usda, or jumbo.',
      },
      downPaymentAmount: { type: 'number', description: 'For financed offers: down payment in dollars.' },
      loanAmount: { type: 'number', description: 'For financed offers: loan amount in dollars.' },
      offerPrice: { type: 'number', description: 'Purchase price in dollars.' },
      earnestMoneyAmount: { type: 'number', description: 'Earnest money deposit in dollars.' },
      closingDate: { type: 'string', description: 'Desired closing date, ISO 8601 (YYYY-MM-DD).' },
      possessionDate: { type: 'string', description: 'Desired possession date, ISO 8601. Often same as closing date.' },
      sellerConcessions: { type: 'number', description: 'Seller-paid closing cost contribution in dollars.' },
      inclusions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Items included in the sale (appliances, fixtures, etc.).',
      },
      exclusions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Items the seller is keeping.',
      },
      inspectionContingency: { type: 'boolean', description: 'Include an inspection contingency.' },
      inspectionPeriodDays: { type: 'number', description: 'Inspection period in days. Colorado default: 10.' },
      appraisalContingency: { type: 'boolean', description: 'Include an appraisal contingency.' },
      financingContingency: { type: 'boolean', description: 'Include a financing contingency.' },
      financingDeadlineDays: { type: 'number', description: 'Days to secure financing. Colorado default: 21.' },
      saleOfExistingHomeContingency: {
        type: 'boolean',
        description: 'Offer is contingent on the buyer selling their current home.',
      },
    },
    required: ['offerId'],
  },
}

interface UpdateOfferInput {
  offerId: string
  status?: OfferStatus
  buyers?: Partial<OfferBuyer>[]
  financingType?: 'cash' | 'financed'
  proofOfFundsDocumentIds?: string[]
  preApprovalLetterDocumentId?: string
  lenderName?: string
  loanType?: string
  downPaymentAmount?: number
  loanAmount?: number
  offerPrice?: number
  earnestMoneyAmount?: number
  closingDate?: string
  possessionDate?: string
  sellerConcessions?: number
  inclusions?: string[]
  exclusions?: string[]
  inspectionContingency?: boolean
  inspectionPeriodDays?: number
  appraisalContingency?: boolean
  financingContingency?: boolean
  financingDeadlineDays?: number
  saleOfExistingHomeContingency?: boolean
}

export async function execute(
  userId: string,
  input: UpdateOfferInput,
): Promise<{ message: string }> {
  const now = new Date().toISOString()

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Key: marshall({ userId, offerId: input.offerId }),
    }),
  )
  if (!result.Item) return { message: `Offer ${input.offerId} not found.` }

  const offer = unmarshall(result.Item) as Offer

  // Status
  if (input.status !== undefined) offer.status = input.status

  // Buyers — full replacement; generate missing buyerIds
  if (input.buyers !== undefined) {
    const { randomUUID } = await import('crypto')
    offer.buyers = input.buyers.map((b, i) => ({
      buyerId: b.buyerId ?? randomUUID(),
      fullLegalName: b.fullLegalName ?? '',
      street: b.street ?? '',
      unit: b.unit,
      city: b.city ?? '',
      state: b.state ?? '',
      zipCode: b.zipCode ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
      isPrimaryBuyer: b.isPrimaryBuyer ?? i === 0,
    }))
  }

  // Financing
  if (input.financingType === 'cash') {
    const existing = offer.financing?.type === 'cash' ? (offer.financing as CashFinancing) : undefined
    offer.financing = {
      type: 'cash',
      proofOfFundsDocumentIds: input.proofOfFundsDocumentIds ?? existing?.proofOfFundsDocumentIds ?? [],
    }
  } else if (input.financingType === 'financed') {
    const existing = offer.financing?.type === 'financed' ? (offer.financing as FinancedFinancing) : undefined
    offer.financing = {
      type: 'financed',
      preApprovalLetterDocumentId: input.preApprovalLetterDocumentId ?? existing?.preApprovalLetterDocumentId,
      lenderName: input.lenderName ?? existing?.lenderName,
      loanType: input.loanType ?? existing?.loanType,
      downPaymentAmount: input.downPaymentAmount ?? existing?.downPaymentAmount,
      loanAmount: input.loanAmount ?? existing?.loanAmount,
    }
  } else if (offer.financing) {
    // Patch financing sub-fields without changing type
    if (offer.financing.type === 'cash' && input.proofOfFundsDocumentIds !== undefined) {
      (offer.financing as CashFinancing).proofOfFundsDocumentIds = input.proofOfFundsDocumentIds
    } else if (offer.financing.type === 'financed') {
      const f = offer.financing as FinancedFinancing
      if (input.preApprovalLetterDocumentId !== undefined) f.preApprovalLetterDocumentId = input.preApprovalLetterDocumentId
      if (input.lenderName !== undefined) f.lenderName = input.lenderName
      if (input.loanType !== undefined) f.loanType = input.loanType
      if (input.downPaymentAmount !== undefined) f.downPaymentAmount = input.downPaymentAmount
      if (input.loanAmount !== undefined) f.loanAmount = input.loanAmount
    }
  }

  // Terms — merge into existing
  const existingTerms = offer.terms
  const existingContingencies = existingTerms?.contingencies ?? {
    inspection: true,
    appraisal: true,
    financing: offer.financing?.type === 'financed',
  }

  const contingencies: OfferContingencies = {
    inspection: input.inspectionContingency ?? existingContingencies.inspection,
    inspectionPeriodDays: input.inspectionPeriodDays ?? existingContingencies.inspectionPeriodDays,
    appraisal: input.appraisalContingency ?? existingContingencies.appraisal,
    financing: input.financingContingency ?? existingContingencies.financing,
    financingDeadlineDays: input.financingDeadlineDays ?? existingContingencies.financingDeadlineDays,
    saleOfExistingHome: input.saleOfExistingHomeContingency ?? existingContingencies.saleOfExistingHome,
  }

  const terms: PurchaseAgreementTerms = {
    offerPrice: input.offerPrice ?? existingTerms?.offerPrice,
    earnestMoneyAmount: input.earnestMoneyAmount ?? existingTerms?.earnestMoneyAmount,
    closingDate: input.closingDate ?? existingTerms?.closingDate,
    possessionDate: input.possessionDate ?? existingTerms?.possessionDate,
    sellerConcessions: input.sellerConcessions ?? existingTerms?.sellerConcessions,
    inclusions: input.inclusions ?? existingTerms?.inclusions,
    exclusions: input.exclusions ?? existingTerms?.exclusions,
    contingencies,
  }
  offer.terms = terms
  offer.updatedAt = now

  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Item: marshall(offer, { removeUndefinedValues: true }),
    }),
  )

  return { message: `Offer ${input.offerId} updated successfully.` }
}
