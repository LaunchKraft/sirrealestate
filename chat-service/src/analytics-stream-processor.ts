import { FirehoseClient, PutRecordBatchCommand } from '@aws-sdk/client-firehose'
import type { DynamoDBStreamEvent } from 'aws-lambda'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'

const firehose = new FirehoseClient({})

interface BusinessEvent {
  event_type: string
  user_id: string
  timestamp: string
  properties: string // JSON-encoded
}

function tableNameFromArn(arn: string): string {
  const match = arn.match(/table\/([^/]+)/)
  return match?.[1] ?? ''
}

type StreamRecord = DynamoDBStreamEvent['Records'][0]

function normalizeViewingEvent(record: StreamRecord): BusinessEvent | null {
  const newImage = record.dynamodb?.NewImage
  const oldImage = record.dynamodb?.OldImage
  if (!newImage) return null

  const newItem = unmarshall(newImage as Record<string, AttributeValue>)
  const userId = newItem.userId as string
  if (!userId) return null

  const timestamp = (record.dynamodb?.ApproximateCreationDateTime
    ? new Date((record.dynamodb.ApproximateCreationDateTime as number) * 1000)
    : new Date()
  ).toISOString()

  if (record.eventName === 'INSERT') {
    return {
      event_type: 'viewing_requested',
      user_id: userId,
      timestamp,
      properties: JSON.stringify({ viewingId: newItem.viewingId, listingAddress: newItem.listingAddress }),
    }
  }

  if (record.eventName === 'MODIFY' && oldImage) {
    const oldItem = unmarshall(oldImage as Record<string, AttributeValue>)
    const newStatus = newItem.status as string
    const oldStatus = oldItem.status as string
    if (newStatus === oldStatus) return null

    const statusToEvent: Record<string, string> = {
      confirmed: 'viewing_confirmed',
      cancelled: 'viewing_cancelled',
    }
    const eventType = statusToEvent[newStatus]
    if (!eventType) return null

    return {
      event_type: eventType,
      user_id: userId,
      timestamp,
      properties: JSON.stringify({ viewingId: newItem.viewingId, listingAddress: newItem.listingAddress }),
    }
  }

  return null
}

function normalizeOfferEvent(record: StreamRecord): BusinessEvent | null {
  const newImage = record.dynamodb?.NewImage
  const oldImage = record.dynamodb?.OldImage
  if (!newImage) return null

  const newItem = unmarshall(newImage as Record<string, AttributeValue>)
  const userId = newItem.userId as string
  if (!userId) return null

  const timestamp = (record.dynamodb?.ApproximateCreationDateTime
    ? new Date((record.dynamodb.ApproximateCreationDateTime as number) * 1000)
    : new Date()
  ).toISOString()

  if (record.eventName === 'INSERT') {
    return {
      event_type: 'offer_created',
      user_id: userId,
      timestamp,
      properties: JSON.stringify({ offerId: newItem.offerId, listingAddress: newItem.listingAddress }),
    }
  }

  if (record.eventName === 'MODIFY' && oldImage) {
    const oldItem = unmarshall(oldImage as Record<string, AttributeValue>)
    const newStatus = newItem.status as string
    const oldStatus = oldItem.status as string
    if (newStatus === oldStatus) return null

    const statusToEvent: Record<string, string> = {
      submitted: 'offer_submitted',
      accepted: 'offer_accepted',
      rejected: 'offer_rejected',
      countered: 'offer_countered',
    }
    const eventType = statusToEvent[newStatus]
    if (!eventType) return null

    return {
      event_type: eventType,
      user_id: userId,
      timestamp,
      properties: JSON.stringify({
        offerId: newItem.offerId,
        listingAddress: newItem.listingAddress,
        offerPrice: newItem.offerPrice,
      }),
    }
  }

  return null
}

function normalizeUserProfileEvent(record: StreamRecord): BusinessEvent | null {
  const newImage = record.dynamodb?.NewImage
  const oldImage = record.dynamodb?.OldImage
  if (!newImage) return null

  const newItem = unmarshall(newImage as Record<string, AttributeValue>)
  const userId = newItem.userId as string
  if (!userId) return null

  const timestamp = (record.dynamodb?.ApproximateCreationDateTime
    ? new Date((record.dynamodb.ApproximateCreationDateTime as number) * 1000)
    : new Date()
  ).toISOString()

  if (record.eventName === 'INSERT') {
    return {
      event_type: 'user_registered',
      user_id: userId,
      timestamp,
      properties: JSON.stringify({ email: newItem.email }),
    }
  }

  if (record.eventName === 'MODIFY' && oldImage) {
    const oldItem = unmarshall(oldImage as Record<string, AttributeValue>)
    const oldCount = (oldItem.searchProfiles as unknown[])?.length ?? 0
    const newCount = (newItem.searchProfiles as unknown[])?.length ?? 0
    if (newCount > oldCount) {
      return {
        event_type: 'search_profile_created',
        user_id: userId,
        timestamp,
        properties: JSON.stringify({ profileCount: newCount }),
      }
    }
    if (newCount < oldCount) {
      return {
        event_type: 'search_profile_deleted',
        user_id: userId,
        timestamp,
        properties: JSON.stringify({ profileCount: newCount }),
      }
    }
  }

  return null
}

function normalizeSearchResultEvent(record: StreamRecord): BusinessEvent | null {
  if (record.eventName !== 'INSERT') return null
  const newImage = record.dynamodb?.NewImage
  if (!newImage) return null

  const newItem = unmarshall(newImage as Record<string, AttributeValue>)
  const userId = newItem.userId as string
  if (!userId) return null

  const timestamp = (record.dynamodb?.ApproximateCreationDateTime
    ? new Date((record.dynamodb.ApproximateCreationDateTime as number) * 1000)
    : new Date()
  ).toISOString()

  return {
    event_type: 'search_result_matched',
    user_id: userId,
    timestamp,
    properties: JSON.stringify({ profileId: newItem.profileId, listingId: newItem.listingId }),
  }
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  const events: BusinessEvent[] = []

  for (const record of event.Records) {
    if (!record.dynamodb) continue

    const tableName = tableNameFromArn(record.eventSourceARN ?? '')
    let normalized: BusinessEvent | null = null

    if (tableName.includes('Viewings')) {
      normalized = normalizeViewingEvent(record)
    } else if (tableName.includes('Offers')) {
      normalized = normalizeOfferEvent(record)
    } else if (tableName.includes('UserProfile')) {
      normalized = normalizeUserProfileEvent(record)
    } else if (tableName.includes('SearchResults')) {
      normalized = normalizeSearchResultEvent(record)
    }

    if (normalized) events.push(normalized)
  }

  if (events.length === 0) return

  // Firehose PutRecordBatch limit is 500 records per call
  const BATCH_SIZE = 500
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE)
    await firehose.send(
      new PutRecordBatchCommand({
        DeliveryStreamName: process.env.FIREHOSE_STREAM_NAME!,
        Records: batch.map((e) => ({
          Data: Buffer.from(JSON.stringify(e) + '\n'),
        })),
      }),
    )
  }
}
