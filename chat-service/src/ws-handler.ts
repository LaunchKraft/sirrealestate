// ci trigger 6
/**
 * WebSocket chat handler.
 * Handles $connect (save connection record), $disconnect (delete record),
 * and $default (dispatches to async self-invocation to bypass 29s API GW timeout).
 * The async self-invocation carries _asyncProcess:true and runs the full Anthropic loop.
 */
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type { MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages'
import { SYSTEM_PROMPT, TOOLS, executeTool, getClient, getToolsForStates } from './handler'
import type { ConversationMessage } from './types'

const dynamo = new DynamoDBClient({})

interface WsEvent {
  requestContext: {
    routeKey: string
    connectionId: string
    domainName: string
    stage: string
    authorizer?: Record<string, string>
  }
  body?: string
  _asyncProcess?: boolean
}

interface WsConnection {
  connectionId: string
  userId: string
  userEmail: string
  givenName?: string
  familyName?: string
}

async function postToConnection(connectionId: string, payload: unknown): Promise<boolean> {
  const mgmt = new ApiGatewayManagementApiClient({ endpoint: process.env.WS_CALLBACK_URL })
  try {
    await mgmt.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(payload)),
    }))
    return true
  } catch (err) {
    if (err instanceof GoneException) {
      console.log(`ws: connectionId=${connectionId} gone — client disconnected`)
      return false
    }
    throw err
  }
}

export async function handler(event: WsEvent): Promise<{ statusCode: number }> {
  const { routeKey, connectionId, authorizer } = event.requestContext

  // ── $connect ────────────────────────────────────────────────────────────────
  if (routeKey === '$connect') {
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24-hour TTL
    await dynamo.send(new PutItemCommand({
      TableName: process.env.WS_CONNECTIONS_TABLE!,
      Item: marshall({
        connectionId,
        userId: authorizer?.userId ?? '',
        userEmail: authorizer?.userEmail ?? '',
        givenName: authorizer?.givenName ?? '',
        familyName: authorizer?.familyName ?? '',
        connectedAt: new Date().toISOString(),
        ttl,
      }),
    }))
    console.log(`ws $connect: connectionId=${connectionId} userId=${authorizer?.userId}`)
    return { statusCode: 200 }
  }

  // ── $disconnect ──────────────────────────────────────────────────────────────
  if (routeKey === '$disconnect') {
    await dynamo.send(new DeleteItemCommand({
      TableName: process.env.WS_CONNECTIONS_TABLE!,
      Key: marshall({ connectionId }),
    }))
    console.log(`ws $disconnect: connectionId=${connectionId}`)
    return { statusCode: 200 }
  }

  // ── $default — dispatch to async self-invocation ────────────────────────────
  // API Gateway WebSocket has a 29s integration timeout. We return 200 immediately
  // and invoke this Lambda again asynchronously (_asyncProcess:true) to run the
  // full Anthropic loop without racing against that limit.
  if (!event._asyncProcess) {
    const lambdaClient = new LambdaClient({})
    await lambdaClient.send(new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME!,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ ...event, _asyncProcess: true })),
    }))
    console.log(`ws $default: dispatched async connectionId=${connectionId}`)
    return { statusCode: 200 }
  }

  // ── $process — main chat logic (async self-invocation) ──────────────────────
  const connectionResult = await dynamo.send(new GetItemCommand({
    TableName: process.env.WS_CONNECTIONS_TABLE!,
    Key: marshall({ connectionId }),
  }))
  if (!connectionResult.Item) {
    console.error(`ws $default: no connection record for connectionId=${connectionId}`)
    return { statusCode: 200 }
  }
  const conn = unmarshall(connectionResult.Item) as WsConnection
  const { userId, userEmail, givenName, familyName } = conn

  let body: { messages?: ConversationMessage[]; sessionId?: string }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    await postToConnection(connectionId, { error: 'Invalid JSON body' })
    return { statusCode: 200 }
  }

  const { messages, sessionId } = body
  if (!messages?.length) {
    await postToConnection(connectionId, { error: 'Missing messages' })
    return { statusCode: 200 }
  }

  const resolvedSessionId = sessionId ?? userId
  const client = await getClient()
  const conversationMessages: MessageParam[] = messages as MessageParam[]

  // Ensure profile row exists — seed name from connection record for Google sign-ins
  const now = new Date().toISOString()
  const profileSeed: Record<string, unknown> = { userId, email: userEmail, searchProfiles: [], createdAt: now, updatedAt: now }
  if (givenName) profileSeed.firstName = givenName
  if (familyName) profileSeed.lastName = familyName
  await dynamo.send(new PutItemCommand({
    TableName: process.env.USER_PROFILE_TABLE!,
    Item: marshall(profileSeed),
    ConditionExpression: 'attribute_not_exists(userId)',
  })).catch(() => { /* already exists */ })

  // Beta user check + user profile state fetch — run in parallel
  const [waitlistResult, profileResult] = await Promise.all([
    userEmail && process.env.WAITLIST_TABLE
      ? dynamo.send(new GetItemCommand({
          TableName: process.env.WAITLIST_TABLE,
          Key: { email: { S: userEmail.toLowerCase() } },
          ProjectionExpression: '#s',
          ExpressionAttributeNames: { '#s': 'status' },
        })).catch(() => null)
      : Promise.resolve(null),
    dynamo.send(new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: marshall({ userId }),
      ProjectionExpression: 'searchProfiles, desiredState',
    })).catch(() => null),
  ])

  const status = waitlistResult?.Item?.status?.S
  const isBetaUser = status === 'invited_beta' || status === 'accepted_beta'

  // Extract the states the user is actively searching in
  const activeStates: string[] = []
  if (profileResult?.Item) {
    const profile = unmarshall(profileResult.Item) as { searchProfiles?: { criteria?: { state?: string } }[]; desiredState?: string }
    for (const sp of profile.searchProfiles ?? []) {
      if (sp.criteria?.state) activeStates.push(sp.criteria.state)
    }
    if (profile.desiredState && !activeStates.includes(profile.desiredState)) {
      activeStates.push(profile.desiredState)
    }
  }
  const tools = getToolsForStates(activeStates)
  console.log(`ws: connectionId=${connectionId} activeStates=[${activeStates.join(',')}] tools=${tools.length}/${TOOLS.length}`)

  const betaPromptSection = isBetaUser
    ? '\n\nBETA USER: This user is a valued Sir Realtor beta participant. ' +
      'At the start of fresh conversations (when there is only one user message so far), ' +
      'warmly welcome them to the beta, thank them personally for their early support, ' +
      'and let them know their feedback directly shapes the product. ' +
      'Tell them they can share product feedback with you at any time during any conversation ' +
      'and you will save it instantly. ' +
      'Whenever the user shares any feedback about Sir Realtor — features, experience, bugs, ' +
      'things they love, things they want improved — immediately call save_beta_feedback ' +
      'with their exact words before responding. ' +
      'TEST PRE-APPROVAL LETTER: If the user does not yet have a pre-approval letter in their documents ' +
      '(check get_documents — no document with documentType "pre_approval_letter"), and they have ' +
      'started a property search or expressed interest in making an offer, proactively offer to generate ' +
      'a test pre-approval letter for beta testing. Say something like: "Since you\'re in beta, I can ' +
      'generate a test pre-approval letter so you can experience the full offer workflow — would you like one?" ' +
      'If they say yes, ask for: (1) their full name if not already known, (2) the lender name — offer ' +
      'to make one up (e.g. "Meridian Home Lending") if they prefer, and (3) the pre-approval amount. ' +
      'Once you have all three, call generate_test_pre_approval. Only offer this once per conversation.'
    : ''

  const systemPrompt = `${SYSTEM_PROMPT}${betaPromptSection}\n\nUser context: email=${userEmail}`

  // Trim tool_result content in older exchanges to keep input tokens under control.
  // We preserve the 2 most recent tool exchanges at full fidelity; older ones are
  // truncated to 300 chars. This prevents token accumulation across long conversations.
  function trimmedForApi(messages: MessageParam[]): MessageParam[] {
    const MAX_OLD_CHARS = 300
    const KEEP_RECENT_EXCHANGES = 2

    const toolUseIndices: number[] = []
    messages.forEach((msg, i) => {
      if (msg.role === 'assistant' && Array.isArray(msg.content) && msg.content.some((b) => b.type === 'tool_use')) {
        toolUseIndices.push(i)
      }
    })
    const trimFrom = toolUseIndices.length > KEEP_RECENT_EXCHANGES
      ? toolUseIndices[toolUseIndices.length - KEEP_RECENT_EXCHANGES]
      : 0

    return messages.map((msg, i) => {
      if (i >= trimFrom || !Array.isArray(msg.content)) return msg
      return {
        ...msg,
        content: msg.content.map((block) => {
          if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > MAX_OLD_CHARS) {
            return { ...block, content: `${block.content.slice(0, MAX_OLD_CHARS)}… [${block.content.length} chars]` }
          }
          return block
        }),
      }
    })
  }

  try {
    let reply = ''
    let hasToolUse = false
    const MAX_TOOL_ROUNDS = 10

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL_ID!,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: trimmedForApi(conversationMessages),
      })

      const toolNames = response.content.filter((b) => b.type === 'tool_use').map((b) => b.type === 'tool_use' ? b.name : '').join(',')
      console.log(`ws loop: connectionId=${connectionId} round=${round} stop_reason=${response.stop_reason} tools=[${toolNames}]`)

      conversationMessages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        const textBlock = response.content.find((b) => b.type === 'text')
        reply = textBlock?.type === 'text' ? textBlock.text : ''
        console.log(`ws loop: connectionId=${connectionId} final stop_reason=${response.stop_reason} reply_length=${reply.length}`)
        break
      }

      if (response.stop_reason === 'tool_use') {
        hasToolUse = true
        const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')

        // request_location is handled client-side — send the action over the socket and return
        const locationBlock = toolUseBlocks.find((b) => b.name === 'request_location')
        if (locationBlock) {
          await postToConnection(connectionId, {
            reply: '',
            sessionId: resolvedSessionId,
            messages: conversationMessages as ConversationMessage[],
            hasToolUse: false,
            clientAction: 'request_location',
            toolUseId: locationBlock.id,
          })
          return { statusCode: 200 }
        }

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

      console.log(`ws loop: connectionId=${connectionId} round=${round} unexpected stop_reason=${response.stop_reason} — breaking`)
      break
    }

    await postToConnection(connectionId, {
      reply,
      sessionId: resolvedSessionId,
      messages: conversationMessages as ConversationMessage[],
      hasToolUse,
    })
  } catch (err) {
    console.error(`ws $default: Anthropic call failed connectionId=${connectionId}`, err)
    await postToConnection(connectionId, { error: 'Failed to invoke model' }).catch(() => {})
  }

  return { statusCode: 200 }
}
