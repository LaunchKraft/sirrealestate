import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { randomUUID } from 'crypto'
import type { Closing, ClosingDeadlines, Offer } from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'create_closing',
  description:
    'Create a closing record once an offer has been accepted and the purchase agreement is signed. ' +
    'This initializes the closing workflow with known deadlines and property details. ' +
    'Call this proactively when you detect that an offer status is "accepted" and signedForms.purchase_agreement is set. ' +
    'Returns a closingId to reference in subsequent update_closing_milestone calls.',
  input_schema: {
    type: 'object',
    properties: {
      offerId: {
        type: 'string',
        description: 'The offerId of the accepted offer.',
      },
      financingType: {
        type: 'string',
        enum: ['cash', 'financed'],
        description: 'Whether the buyer is paying cash or financing.',
      },
      hasHoa: {
        type: 'boolean',
        description: 'Whether the property has a homeowners association.',
      },
      deadlines: {
        type: 'object',
        description: 'Named contract deadlines as ISO date strings (YYYY-MM-DD). Seed closingDate from the offer terms.',
        properties: {
          inspectionObjectionDeadline: { type: 'string' },
          inspectionResolutionDeadline: { type: 'string' },
          titleObjectionDeadline: { type: 'string' },
          appraisalDeadline: { type: 'string' },
          appraisalObjectionDeadline: { type: 'string' },
          appraisalResolutionDeadline: { type: 'string' },
          loanConditionsDeadline: { type: 'string' },
          newLoanAvailabilityDeadline: { type: 'string' },
          closingDate: { type: 'string' },
          inspectionPeriodDeadline: { type: 'string', description: 'AZ: 10-day inspection period deadline (acceptance + 10 days).' },
          binsrResponseDeadline: { type: 'string', description: 'AZ: seller BINSR response deadline (inspectionPeriodDeadline + 5 days).' },
          optionPeriodDeadline: { type: 'string', description: 'TX: option period expiration date (acceptance date + optionPeriodDays).' },
          surveyDeadline: { type: 'string', description: 'TX: survey or T-47 affidavit due date (typically 5 days before closing).' },
          dueDiligenceDeadline: { type: 'string', description: 'NV: due diligence period expiration date (acceptance date + dueDiligenceDays).' },
        },
      },
      titleCompany: {
        type: 'string',
        description: 'Title company name, if known.',
      },
      titleContactEmail: {
        type: 'string',
        description: 'Title company contact email, if known.',
      },
    },
    required: ['offerId', 'financingType', 'hasHoa'],
  },
}

interface CreateClosingInput {
  offerId: string
  financingType: 'cash' | 'financed'
  hasHoa: boolean
  deadlines?: ClosingDeadlines
  titleCompany?: string
  titleContactEmail?: string
}

export async function execute(
  userId: string,
  input: CreateClosingInput,
): Promise<{ closingId: string; message: string } | { error: string }> {
  // Look up the offer to get listing details
  const offerResult = await dynamo.send(
    new QueryCommand({
      TableName: process.env.OFFERS_TABLE!,
      KeyConditionExpression: 'userId = :uid AND offerId = :oid',
      ExpressionAttributeValues: marshall({ ':uid': userId, ':oid': input.offerId }),
      Limit: 1,
    }),
  )
  const offer = offerResult.Items?.[0] ? (unmarshall(offerResult.Items[0]) as Offer) : null
  if (!offer) return { error: `Offer ${input.offerId} not found.` }

  // Guard: only create once
  const existingResult = await dynamo.send(
    new QueryCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      IndexName: 'offerId-index',
      KeyConditionExpression: 'userId = :uid AND offerId = :oid',
      ExpressionAttributeValues: marshall({ ':uid': userId, ':oid': input.offerId }),
      Limit: 1,
    }),
  )
  if (existingResult.Items && existingResult.Items.length > 0) {
    const existing = unmarshall(existingResult.Items[0]) as Closing
    return { closingId: existing.closingId, message: `Closing already exists for this offer (closingId: ${existing.closingId}).` }
  }

  // Seed closingDate from offer terms if not explicitly provided
  const deadlines: ClosingDeadlines = {
    closingDate: offer.terms?.closingDate,
    ...input.deadlines,
  }

  const closingId = randomUUID()
  const now = new Date().toISOString()

  const closing: Closing = {
    userId,
    closingId,
    offerId: input.offerId,
    listingId: offer.listingId,
    listingAddress: offer.listingAddress,
    propertyState: offer.propertyState,
    financingType: input.financingType,
    hasHoa: input.hasHoa,
    deadlines,
    milestones: {},
    titleCompany: input.titleCompany,
    titleContactEmail: input.titleContactEmail,
    createdAt: now,
    updatedAt: now,
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      Item: marshall(closing, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(closingId)',
    }),
  )

  return {
    closingId,
    message: `Closing created for ${offer.listingAddress} (closingId: ${closingId}). Use update_closing_milestone to track progress.`,
  }
}
