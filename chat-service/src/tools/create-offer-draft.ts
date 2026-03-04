import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { randomUUID } from 'crypto'
import type { Offer, OfferBuyer, UserProfile } from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'create_offer_draft',
  description:
    'Create a new offer draft for a property the user wants to make an offer on. Call this as soon as the user expresses intent to offer on a listing — do not wait until all details are collected. The primary buyer is pre-populated from the user\'s profile. Returns an offerId to reference in subsequent update_offer and get_offers calls.',
  input_schema: {
    type: 'object',
    properties: {
      listingId: {
        type: 'string',
        description: 'The listing ID from search results.',
      },
      listingAddress: {
        type: 'string',
        description: 'The full property address.',
      },
      viewingId: {
        type: 'string',
        description: 'The viewingId that led to this offer, if applicable.',
      },
      profileId: {
        type: 'string',
        description: 'The search profile ID that found this listing.',
      },
      propertyState: {
        type: 'string',
        description: '2-letter state code for the property location. Defaults to CO.',
      },
    },
    required: ['listingId', 'listingAddress'],
  },
}

interface CreateOfferDraftInput {
  listingId: string
  listingAddress: string
  viewingId?: string
  profileId?: string
  propertyState?: string
}

export async function execute(
  userId: string,
  input: CreateOfferDraftInput,
  userEmail: string,
): Promise<{ offerId: string; message: string }> {
  const now = new Date().toISOString()

  // Pre-populate the primary buyer from the user's profile where available
  const profileResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: userId } },
    }),
  )
  const userProfile = profileResult.Item ? (unmarshall(profileResult.Item) as UserProfile) : null

  const primaryBuyer: OfferBuyer = {
    buyerId: randomUUID(),
    fullLegalName:
      userProfile?.firstName && userProfile?.lastName
        ? `${userProfile.firstName} ${userProfile.lastName}`
        : '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    phone: userProfile?.phone ?? '',
    email: userEmail,
    isPrimaryBuyer: true,
  }

  const offerId = randomUUID()
  const offer: Offer = {
    userId,
    offerId,
    listingId: input.listingId,
    listingAddress: input.listingAddress,
    viewingId: input.viewingId,
    profileId: input.profileId,
    status: 'draft',
    propertyState: input.propertyState ?? 'CO',
    buyers: [primaryBuyer],
    sellerResponseToken: randomUUID(),
    createdAt: now,
    updatedAt: now,
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Item: marshall(offer, { removeUndefinedValues: true }),
    }),
  )

  return {
    offerId,
    message: `Offer draft created for ${input.listingAddress} (offerId: ${offerId}). Primary buyer pre-populated from profile. Call update_offer to fill in remaining details.`,
  }
}
