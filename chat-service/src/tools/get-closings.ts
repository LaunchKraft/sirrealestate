import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { Closing } from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'get_closings',
  description:
    'Retrieve all active closing records for the user. Call this at the start of conversations ' +
    'where the user has accepted offers, to check closing status and see which milestones are pending.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

export async function execute(userId: string): Promise<{ closings: Closing[] }> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: marshall({ ':uid': userId }),
    }),
  )

  const closings = (result.Items ?? []).map((item) => unmarshall(item) as Closing)
  return { closings }
}
