// ci trigger 1
/**
 * WebSocket chat handler.
 * Phase 1: manages connection lifecycle ($connect / $disconnect).
 * Phase 2: $default will run the full Anthropic agentic loop and
 *           post the response back via ApiGatewayManagementApi.
 */
import { DynamoDBClient, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

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
}

export async function handler(event: WsEvent): Promise<{ statusCode: number }> {
  const { routeKey, connectionId, authorizer } = event.requestContext

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

  if (routeKey === '$disconnect') {
    await dynamo.send(new DeleteItemCommand({
      TableName: process.env.WS_CONNECTIONS_TABLE!,
      Key: marshall({ connectionId }),
    }))
    console.log(`ws $disconnect: connectionId=${connectionId}`)
    return { statusCode: 200 }
  }

  // $default — Phase 2: Anthropic agentic loop + postToConnection response
  console.log(`ws $default: connectionId=${connectionId} body=${event.body?.slice(0, 100)}`)
  return { statusCode: 200 }
}
