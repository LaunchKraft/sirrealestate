import { DynamoDBClient, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import type { Offer, OfferBuyer, CashFinancing, FinancedFinancing } from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'get_offers',
  description:
    'Retrieve the user\'s offer drafts and their completion status. Call this at the start of conversations once the user has booked viewings, and whenever you need to see what offer information is still missing. Returns a missingFields list for each offer so you know exactly what to ask for next.',
  input_schema: {
    type: 'object',
    properties: {
      offerId: {
        type: 'string',
        description: 'Fetch a specific offer by ID. Omit to return all offers.',
      },
    },
    required: [],
  },
}

function computeMissingFields(offer: Offer): string[] {
  const missing: string[] = []

  // Buyers
  for (const buyer of offer.buyers) {
    const label = buyer.isPrimaryBuyer ? 'Primary buyer' : `Co-buyer (${buyer.fullLegalName || 'unnamed'})`
    if (!buyer.fullLegalName) missing.push(`${label}: fullLegalName`)
    if (!buyer.street)        missing.push(`${label}: street address`)
    if (!buyer.city)          missing.push(`${label}: city`)
    if (!buyer.state)         missing.push(`${label}: state`)
    if (!buyer.zipCode)       missing.push(`${label}: zipCode`)
    if (!buyer.phone)         missing.push(`${label}: phone`)
    if (!buyer.email)         missing.push(`${label}: email`)
  }

  // Financing
  if (!offer.financing) {
    missing.push('Financing type (cash or financed)')
  } else if (offer.financing.type === 'cash') {
    const f = offer.financing as CashFinancing
    if (!f.proofOfFundsDocumentIds || f.proofOfFundsDocumentIds.length === 0) {
      missing.push('Proof of funds document(s)')
    }
  } else if (offer.financing.type === 'financed') {
    const f = offer.financing as FinancedFinancing
    if (!f.preApprovalLetterDocumentId) missing.push('Pre-approval letter document')
    if (!f.lenderName)                  missing.push('Lender name')
    if (!f.loanType)                    missing.push('Loan type')
  }

  // Terms
  if (!offer.terms?.offerPrice)         missing.push('Offer price')
  if (!offer.terms?.earnestMoneyAmount) missing.push('Earnest money amount')
  if (!offer.terms?.closingDate)        missing.push('Closing date')

  return missing
}

function summariseOffer(offer: Offer) {
  const missing = computeMissingFields(offer)
  return {
    offerId: offer.offerId,
    listingAddress: offer.listingAddress,
    status: offer.status,
    propertyState: offer.propertyState,
    buyerCount: offer.buyers.length,
    buyers: offer.buyers.map((b: OfferBuyer) => ({
      fullLegalName: b.fullLegalName,
      isPrimaryBuyer: b.isPrimaryBuyer,
      hasAddress: !!(b.street && b.city && b.state && b.zipCode),
      phone: b.phone,
      email: b.email,
    })),
    financingType: offer.financing?.type ?? null,
    terms: offer.terms
      ? {
          offerPrice: offer.terms.offerPrice,
          earnestMoneyAmount: offer.terms.earnestMoneyAmount,
          closingDate: offer.terms.closingDate,
          contingencies: offer.terms.contingencies,
        }
      : null,
    missingFields: missing,
    isReadyToSubmit: missing.length === 0,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  }
}

export async function execute(
  userId: string,
  input: { offerId?: string },
): Promise<{ offers: ReturnType<typeof summariseOffer>[] }> {
  if (input.offerId) {
    const result = await dynamo.send(
      new GetItemCommand({
        TableName: process.env.OFFERS_TABLE!,
        Key: marshall({ userId, offerId: input.offerId }),
      }),
    )
    if (!result.Item) return { offers: [] }
    return { offers: [summariseOffer(unmarshall(result.Item) as Offer)] }
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.OFFERS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ScanIndexForward: false,
    }),
  )
  const offers = (result.Items ?? []).map(
    (item: Record<string, AttributeValue>) => summariseOffer(unmarshall(item) as Offer),
  )
  return { offers }
}
