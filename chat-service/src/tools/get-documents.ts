import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import type { UserDocument } from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'get_documents',
  description:
    'Retrieve the user\'s uploaded documents including any extracted fields (e.g. pre-approval amount). ' +
    'Call this when the user asks about their documents, budget, or pre-approval, or when creating or ' +
    'updating a search profile. If a pre_approval_letter is found, use its approvedAmount as the ' +
    'maxPrice ceiling when setting up search criteria.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

export async function execute(userId: string): Promise<{ documents: UserDocument[] }> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ScanIndexForward: false,
    }),
  )
  const documents = (result.Items ?? []).map(
    (item: Record<string, AttributeValue>) => unmarshall(item) as UserDocument,
  )
  return { documents }
}
