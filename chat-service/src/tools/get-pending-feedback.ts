import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { Viewing } from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'get_pending_feedback',
  description:
    'Check if the user has any completed property viewings that they haven\'t yet provided feedback for. Call this at the start of each conversation to naturally ask about recent viewings.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

export async function execute(userId: string): Promise<{ viewings: Viewing[]; count: number }> {
  const now = new Date().toISOString()

  // Query for requested/confirmed viewings
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression:
        'attribute_not_exists(feedback) AND #status = :confirmed AND (attribute_not_exists(proposedDateTime) OR proposedDateTime < :now)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':uid': { S: userId },
        ':now': { S: now },
        ':confirmed': { S: 'confirmed' },
      },
    }),
  )

  const viewings = (result.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item) as Viewing)

  return { viewings, count: viewings.length }
}
