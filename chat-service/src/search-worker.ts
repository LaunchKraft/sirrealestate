import {
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
  QueryCommand,
  BatchWriteItemCommand,
  UpdateItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { randomUUID } from 'crypto'
import type { UserProfile, SearchProfile, SearchResult, Notification, Viewing } from './types'
import type { Listing } from './mls/mls-provider'
import { RentcastProvider } from './mls/rentcast-provider'
import { buildListingUrl } from './mls/listing-url'
import {
  newListingsDigestEmail,
  viewingFeedbackRequestEmail,
} from './email-templates'

const dynamo = new DynamoDBClient({})
const ses = new SESClient({})
const secrets = new SecretsManagerClient({})

// Notification channel dispatcher — stub for SMS/push
async function sendNotification(
  channel: 'email' | 'sms' | 'push',
  opts: { to: string; subject: string; html: string },
): Promise<void> {
  if (channel === 'email') {
    await ses.send(
      new SendEmailCommand({
        Source: 'Sir Realtor <noreply@sirrealtor.com>',
        Destination: { ToAddresses: [opts.to] },
        Message: {
          Subject: { Data: opts.subject },
          Body: { Html: { Data: opts.html } },
        },
      }),
    )
  } else if (channel === 'sms') {
    // TODO: SNS/Pinpoint SMS
    console.log('SMS not yet implemented', opts.to)
  } else if (channel === 'push') {
    // TODO: Pinpoint push
    console.log('Push not yet implemented', opts.to)
  }
}

let mlsProvider: RentcastProvider | null = null

async function getMlsProvider(): Promise<RentcastProvider> {
  if (mlsProvider) return mlsProvider

  const secret = await secrets.send(
    new GetSecretValueCommand({ SecretId: process.env.RENTCAST_SECRET_ARN! }),
  )
  const apiKey = secret.SecretString ?? ''
  mlsProvider = new RentcastProvider(apiKey)
  return mlsProvider
}

async function processUserProfile(profile: UserProfile, mls: RentcastProvider): Promise<void> {
  const monitoredProfiles = profile.searchProfiles.filter((p) => p.monitoring)
  if (monitoredProfiles.length === 0) return

  for (const searchProfile of monitoredProfiles) {
    await processSearchProfile(profile, searchProfile, mls)
  }
}

async function processSearchProfile(
  user: UserProfile,
  searchProfile: SearchProfile,
  mls: RentcastProvider,
): Promise<void> {
  const { criteria, profileId } = searchProfile

  // Fetch current listings from MLS
  let listings: Listing[]
  try {
    listings = await mls.searchListings(criteria)
  } catch (err) {
    console.error(`MLS search failed for user=${user.userId} profile=${profileId}`, err)
    return
  }

  // Query existing results for this user
  const existingResult = await dynamo.send(
    new QueryCommand({
      TableName: process.env.SEARCH_RESULTS_TABLE!,
      KeyConditionExpression: 'userId = :uid AND begins_with(profileIdListingId, :prefix)',
      ExpressionAttributeValues: {
        ':uid': { S: user.userId },
        ':prefix': { S: `${profileId}#` },
      },
      ProjectionExpression: 'profileIdListingId',
    }),
  )

  const existingKeys = new Set(
    (existingResult.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item).profileIdListingId as string),
  )

  // Find new listings
  const newListings = listings.filter(
    (l) => !existingKeys.has(`${profileId}#${l.listingId}`),
  )

  if (newListings.length === 0) {
    console.log(`No new listings for user=${user.userId} profile=${profileId}`)
    return
  }

  console.log(`Found ${newListings.length} new listings for user=${user.userId} profile=${profileId}`)

  const now = new Date().toISOString()

  // Enrich listings with platform URL based on user's preference
  const enrichedListings = newListings.map((listing) => ({
    ...listing,
    listingUrl: buildListingUrl(listing.address, user.listingViewingPreference),
  }))

  // BatchWrite new SearchResult records
  const BATCH_SIZE = 25
  for (let i = 0; i < enrichedListings.length; i += BATCH_SIZE) {
    const batch = enrichedListings.slice(i, i + BATCH_SIZE)
    const putRequests = batch.map((listing) => {
      const searchResult: SearchResult = {
        userId: user.userId,
        profileIdListingId: `${profileId}#${listing.listingId}`,
        profileId,
        listingId: listing.listingId,
        listingData: listing,
        matchedAt: now,
        notified: false,
      }
      return { PutRequest: { Item: marshall(searchResult, { removeUndefinedValues: true }) } }
    })

    await dynamo.send(
      new BatchWriteItemCommand({
        RequestItems: { [process.env.SEARCH_RESULTS_TABLE!]: putRequests },
      }),
    )
  }

  // Send a single consolidated digest email for all new listings
  const notificationChannel = searchProfile.notificationPreferences.email ? 'email' : null
  if (notificationChannel && user.email) {
    const listingsUrl = `https://app.sirrealtor.com/listings/${profileId}`
    const { subject, html } = newListingsDigestEmail(
      enrichedListings as import('./types').Listing[],
      searchProfile.name,
      listingsUrl,
      enrichedListings.length,
    )
    let sendStatus: 'sent' | 'failed' = 'failed'
    try {
      await sendNotification('email', { to: user.email, subject, html })
      sendStatus = 'sent'

      // Mark all new listings as notified
      await Promise.all(
        enrichedListings.map((listing) =>
          dynamo.send(
            new UpdateItemCommand({
              TableName: process.env.SEARCH_RESULTS_TABLE!,
              Key: marshall({ userId: user.userId, profileIdListingId: `${profileId}#${listing.listingId}` }),
              UpdateExpression: 'SET notified = :true',
              ExpressionAttributeValues: { ':true': { BOOL: true } },
            }),
          ),
        ),
      )
    } catch (err) {
      console.error(`Failed to send digest notification for profile ${profileId}`, err)
    }

    // Record one notification for the digest
    try {
      const notification: Notification = {
        userId: user.userId,
        notificationId: randomUUID(),
        type: 'new_listing',
        channel: 'email',
        direction: 'to_user',
        recipientAddress: user.email,
        subject,
        body: html,
        sentAt: now,
        status: sendStatus,
      }
      await dynamo.send(
        new PutItemCommand({
          TableName: process.env.NOTIFICATIONS_TABLE!,
          Item: marshall(notification, { removeUndefinedValues: true }),
        }),
      )
    } catch (err) {
      console.error(`Failed to record digest notification for profile ${profileId}`, err)
    }
  }
}

async function sendFeedbackRequests(): Promise<void> {
  const now = new Date().toISOString()
  const chatUrl = 'https://app.sirrealtor.com/chat'

  // Scan viewings that have passed with no feedbackRequestedAt
  const result = await dynamo.send(
    new ScanCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      FilterExpression:
        'attribute_not_exists(feedbackRequestedAt) AND attribute_not_exists(feedback) AND proposedDateTime < :now',
      ExpressionAttributeValues: {
        ':now': { S: now },
      },
    }),
  )

  const viewings = (result.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item) as Viewing)

  for (const viewing of viewings) {
    // Get user email
    const profileResult = await dynamo.send(
      new QueryCommand({
        TableName: process.env.USER_PROFILE_TABLE!,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': { S: viewing.userId } },
        ProjectionExpression: 'email',
      }),
    )
    const userEmail = profileResult.Items?.[0]
      ? (unmarshall(profileResult.Items[0]).email as string | undefined)
      : undefined

    if (!userEmail) continue

    try {
      const feedbackUrl = `${chatUrl}?feedback=${viewing.viewingId}`
      const { subject, html } = viewingFeedbackRequestEmail(viewing, feedbackUrl)
      await sendNotification('email', { to: userEmail, subject, html })

      // Mark feedbackRequestedAt
      await dynamo.send(
        new UpdateItemCommand({
          TableName: process.env.VIEWINGS_TABLE!,
          Key: marshall({ userId: viewing.userId, viewingId: viewing.viewingId }),
          UpdateExpression: 'SET feedbackRequestedAt = :now',
          ExpressionAttributeValues: { ':now': { S: now } },
        }),
      )
    } catch (err) {
      console.error(`Failed to send feedback request for viewing ${viewing.viewingId}`, err)
    }
  }
}

export async function handler(event?: { userId?: string; profileId?: string }): Promise<void> {
  console.log('Search worker started', event ?? 'cron')

  const mls = await getMlsProvider()

  // Targeted invocation: only process a specific user (and optionally a specific profile)
  if (event?.userId) {
    const item = await dynamo.send(
      new GetItemCommand({
        TableName: process.env.USER_PROFILE_TABLE!,
        Key: { userId: { S: event.userId } },
      }),
    )
    if (item.Item) {
      const user = unmarshall(item.Item) as UserProfile
      if (event.profileId) {
        const profile = user.searchProfiles.find((p) => p.profileId === event.profileId)
        if (profile?.monitoring) {
          await processSearchProfile(user, profile, mls)
        }
      } else {
        await processUserProfile(user, mls)
      }
    }
    console.log('Search worker completed (targeted)')
    return
  }

  // Cron path: scan all users; processUserProfile skips those with no monitored profiles
  let lastKey: Record<string, unknown> | undefined
  do {
    const scanResult = await dynamo.send(
      new ScanCommand({
        TableName: process.env.USER_PROFILE_TABLE!,
        ExclusiveStartKey: lastKey
          ? marshall(lastKey as Record<string, unknown>)
          : undefined,
      }),
    )

    const users = (scanResult.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item) as UserProfile)

    await Promise.allSettled(users.map((u: UserProfile) => processUserProfile(u, mls)))

    lastKey = scanResult.LastEvaluatedKey
      ? (unmarshall(scanResult.LastEvaluatedKey) as Record<string, unknown>)
      : undefined
  } while (lastKey)

  // Send feedback requests for past viewings
  await sendFeedbackRequests()

  console.log('Search worker completed')
}
