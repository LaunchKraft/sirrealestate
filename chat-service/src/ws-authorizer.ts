import { CognitoJwtVerifier } from 'aws-jwt-verify'

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'id',
  clientId: process.env.COGNITO_USER_POOL_CLIENT_ID!,
})

interface WsAuthorizerEvent {
  methodArn: string
  queryStringParameters?: Record<string, string>
}

interface IamPolicy {
  principalId: string
  policyDocument: {
    Version: string
    Statement: Array<{ Action: string; Effect: string; Resource: string }>
  }
  context?: Record<string, string>
}

export async function handler(event: WsAuthorizerEvent): Promise<IamPolicy> {
  const token = event.queryStringParameters?.token

  const deny: IamPolicy = {
    principalId: 'user',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: event.methodArn }],
    },
  }

  if (!token) return deny

  try {
    const payload = await verifier.verify(token)
    // Allow all routes on this WebSocket API, not just $connect
    const resource = event.methodArn.replace(/\$connect$/, '*')
    return {
      principalId: payload.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: resource }],
      },
      context: {
        userId: payload.sub,
        userEmail: (payload['email'] as string) ?? '',
        givenName: (payload['given_name'] as string) ?? '',
        familyName: (payload['family_name'] as string) ?? '',
      },
    }
  } catch {
    return deny
  }
}
