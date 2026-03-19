import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'save_beta_feedback',
  description:
    'Save product feedback from a beta user. Call this immediately whenever the user shares any feedback about Sir Realtor — the product, features, their experience, or anything they\'d like to see improved or changed. Capture their exact words.',
  input_schema: {
    type: 'object',
    properties: {
      feedback: {
        type: 'string',
        description: "The user's exact feedback text.",
      },
    },
    required: ['feedback'],
  },
}

interface SaveBetaFeedbackInput {
  feedback: string
}

export async function execute(
  userEmail: string,
  input: SaveBetaFeedbackInput,
): Promise<{ message: string }> {
  const entry = { text: input.feedback, submittedAt: new Date().toISOString() }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.WAITLIST_TABLE!,
      Key: { email: { S: userEmail.toLowerCase() } },
      UpdateExpression: 'SET feedback = list_append(if_not_exists(feedback, :empty), :new)',
      ExpressionAttributeValues: {
        ':new': { L: [{ M: { text: { S: entry.text }, submittedAt: { S: entry.submittedAt } } }] },
        ':empty': { L: [] },
      },
    }),
  )

  return { message: 'Feedback saved. Thank you!' }
}
