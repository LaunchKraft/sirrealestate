// ci trigger 2
import Anthropic from '@anthropic-ai/sdk'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import * as GetUserProfile from './tools/get-user-profile'
import * as UpdateUserDetails from './tools/update-user-details'
import * as UpsertSearchProfile from './tools/upsert-search-profile'
import * as GetSearchResults from './tools/get-search-results'
import * as ScheduleViewing from './tools/schedule-viewing'
import * as GetPendingFeedback from './tools/get-pending-feedback'
import * as SaveViewingFeedback from './tools/save-viewing-feedback'
import * as GetDocuments from './tools/get-documents'
import type { ConversationMessage } from './types'

const secretsManager = new SecretsManagerClient({})
const dynamo = new DynamoDBClient({})
let anthropic: Anthropic | null = null

async function getClient(): Promise<Anthropic> {
  if (anthropic) return anthropic
  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_API_KEY_SECRET_ARN! }),
  )
  anthropic = new Anthropic({ apiKey: SecretString! })
  return anthropic
}

const TOOLS: Anthropic.Tool[] = [
  GetUserProfile.definition,
  UpdateUserDetails.definition,
  UpsertSearchProfile.definition,
  GetSearchResults.definition,
  ScheduleViewing.definition,
  GetPendingFeedback.definition,
  SaveViewingFeedback.definition,
  GetDocuments.definition,
] as Anthropic.Tool[]

async function executeTool(
  name: string,
  input: unknown,
  userId: string,
  userEmail: string,
): Promise<unknown> {
  switch (name) {
    case 'get_user_profile':
      return GetUserProfile.execute(userId)
    case 'update_user_details':
      return UpdateUserDetails.execute(userId, input as Parameters<typeof UpdateUserDetails.execute>[1])
    case 'upsert_search_profile':
      return UpsertSearchProfile.execute(userId, input as Parameters<typeof UpsertSearchProfile.execute>[1], userEmail)
    case 'get_search_results':
      return GetSearchResults.execute(userId, input as Parameters<typeof GetSearchResults.execute>[1])
    case 'schedule_viewing':
      return ScheduleViewing.execute(userId, input as Parameters<typeof ScheduleViewing.execute>[1], userEmail)
    case 'get_pending_feedback':
      return GetPendingFeedback.execute(userId)
    case 'save_viewing_feedback':
      return SaveViewingFeedback.execute(userId, input as Parameters<typeof SaveViewingFeedback.execute>[1])
    case 'get_documents':
      return GetDocuments.execute(userId)
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) }
  }

  let messages: ConversationMessage[]
  let sessionId: string | undefined
  try {
    const parsed = JSON.parse(event.body) as {
      messages?: ConversationMessage[]
      sessionId?: string
    }
    if (!parsed.messages || parsed.messages.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing messages field' }) }
    }
    messages = parsed.messages
    sessionId = parsed.sessionId
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const claims = event.requestContext.authorizer.jwt.claims
  const userId = claims['sub'] as string
  const userEmail = (claims['email'] as string | undefined) ?? ''
  const resolvedSessionId = sessionId ?? userId

  const client = await getClient()
  const conversationMessages: MessageParam[] = messages as MessageParam[]

  // Ensure a profile row exists before the tool loop so get_user_profile always returns real data.
  const now = new Date().toISOString()
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Item: marshall({ userId, email: userEmail, searchProfiles: [], createdAt: now, updatedAt: now }),
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  ).catch(() => { /* item already exists — ignore ConditionalCheckFailedException */ })

  const systemPrompt = `${process.env.SYSTEM_PROMPT!}\n\nUser context: email=${userEmail}`

  try {
    let reply = ''
    let hasToolUse = false
    const MAX_TOOL_ROUNDS = 10

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL_ID!,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: conversationMessages,
      })

      conversationMessages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text')
        reply = textBlock?.type === 'text' ? textBlock.text : ''
        break
      }

      if (response.stop_reason === 'tool_use') {
        hasToolUse = true
        const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const result = await executeTool(block.name, block.input, userId, userEmail)
              .catch((err: unknown) => ({ error: String(err) }))
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            }
          }),
        )

        conversationMessages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    const updatedMessages: ConversationMessage[] = conversationMessages as ConversationMessage[]

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply,
        sessionId: resolvedSessionId,
        messages: updatedMessages,
        hasToolUse,
      }),
    }
  } catch (err) {
    console.error('Anthropic API call failed', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to invoke model' }) }
  }
}
