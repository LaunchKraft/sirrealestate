// ci trigger
import { DynamoDBClient, ScanCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

const dynamo = new DynamoDBClient({})
const cognito = new CognitoIdentityProviderClient({})

const CONSUMER_USER_POOL_ID = process.env.CONSUMER_USER_POOL_ID!
const USER_PROFILE_TABLE = process.env.USER_PROFILE_TABLE!
const SEARCH_RESULTS_TABLE = process.env.SEARCH_RESULTS_TABLE!
const VIEWINGS_TABLE = process.env.VIEWINGS_TABLE!
const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE!
const OFFERS_TABLE = process.env.OFFERS_TABLE!

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function scanTable(tableName: string, limit = 500): Promise<Record<string, unknown>[]> {
  const result = await dynamo.send(
    new ScanCommand({ TableName: tableName, Limit: limit }),
  )
  return (result.Items ?? []).map(item => unmarshall(item))
}

async function getDashboard(): Promise<APIGatewayProxyResultV2> {
  const [users, profiles, searches, documents, viewings, offers] = await Promise.all([
    cognito.send(new ListUsersCommand({ UserPoolId: CONSUMER_USER_POOL_ID, Limit: 60 })),
    dynamo.send(new ScanCommand({ TableName: USER_PROFILE_TABLE, Select: 'COUNT' })),
    dynamo.send(new ScanCommand({ TableName: SEARCH_RESULTS_TABLE, Select: 'COUNT' })),
    dynamo.send(new ScanCommand({ TableName: DOCUMENTS_TABLE, Select: 'COUNT' })),
    dynamo.send(new ScanCommand({ TableName: VIEWINGS_TABLE, Select: 'COUNT' })),
    dynamo.send(new ScanCommand({ TableName: OFFERS_TABLE, Select: 'COUNT' })),
  ])

  return json(200, {
    counts: {
      users: users.Users?.length ?? 0,
      profiles: profiles.Count ?? 0,
      searches: searches.Count ?? 0,
      documents: documents.Count ?? 0,
      viewings: viewings.Count ?? 0,
      offers: offers.Count ?? 0,
    },
  })
}

async function getUsers(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const paginationToken = event.queryStringParameters?.nextToken

  const [cognitoResult, profilesResult] = await Promise.all([
    cognito.send(
      new ListUsersCommand({
        UserPoolId: CONSUMER_USER_POOL_ID,
        Limit: 60,
        PaginationToken: paginationToken,
      }),
    ),
    dynamo.send(new ScanCommand({ TableName: USER_PROFILE_TABLE })),
  ])

  const profilesByUserId = new Map(
    (profilesResult.Items ?? []).map(item => {
      const p = unmarshall(item)
      return [p.userId as string, p]
    }),
  )

  const users = (cognitoResult.Users ?? []).map(u => {
    const attrs = Object.fromEntries(
      (u.Attributes ?? []).map(a => [a.Name!, a.Value]),
    )
    const sub = attrs['sub'] as string
    return {
      userId: sub,
      email: attrs['email'],
      emailVerified: attrs['email_verified'] === 'true',
      status: u.UserStatus,
      enabled: u.Enabled,
      createdAt: u.UserCreateDate?.toISOString(),
      profile: profilesByUserId.get(sub) ?? null,
    }
  })

  return json(200, { users, nextToken: cognitoResult.PaginationToken ?? null })
}

async function getDocuments(): Promise<APIGatewayProxyResultV2> {
  const items = await scanTable(DOCUMENTS_TABLE)
  return json(200, { documents: items })
}

async function getViewings(): Promise<APIGatewayProxyResultV2> {
  const items = await scanTable(VIEWINGS_TABLE)
  return json(200, { viewings: items })
}

async function getOffers(): Promise<APIGatewayProxyResultV2> {
  const items = await scanTable(OFFERS_TABLE)
  return json(200, { offers: items })
}

async function updateProfile(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = event.queryStringParameters?.userId
  if (!userId) return json(400, { error: 'userId required' })

  const updates = JSON.parse(event.body ?? '{}') as Record<string, unknown>

  const result = await dynamo.send(new GetItemCommand({
    TableName: USER_PROFILE_TABLE,
    Key: { userId: { S: userId } },
  }))

  const profile: Record<string, unknown> = result.Item ? unmarshall(result.Item) : { userId, searchProfiles: [], createdAt: new Date().toISOString() }

  const allowedFields = [
    'firstName', 'lastName', 'phone', 'buyerStatus', 'preApproved', 'preApprovalAmount',
    'firstTimeHomeBuyer', 'currentCity', 'currentState', 'desiredCity', 'desiredState',
    'listingViewingPreference',
  ]

  for (const field of allowedFields) {
    if (field in updates) {
      if (updates[field] === null || updates[field] === '') {
        delete profile[field]
      } else {
        profile[field] = updates[field]
      }
    }
  }

  profile.updatedAt = new Date().toISOString()

  await dynamo.send(new PutItemCommand({
    TableName: USER_PROFILE_TABLE,
    Item: marshall(profile, { removeUndefinedValues: true }),
  }))

  return json(200, { ok: true })
}

async function deleteSearchProfile(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const userId = event.queryStringParameters?.userId
  const profileId = event.queryStringParameters?.profileId
  if (!userId || !profileId) return json(400, { error: 'userId and profileId required' })

  const result = await dynamo.send(new GetItemCommand({
    TableName: USER_PROFILE_TABLE,
    Key: { userId: { S: userId } },
  }))

  if (!result.Item) return json(404, { error: 'Profile not found' })

  const profile = unmarshall(result.Item) as Record<string, unknown>
  const searchProfiles = (profile.searchProfiles as Record<string, unknown>[] | undefined) ?? []
  profile.searchProfiles = searchProfiles.filter((p) => p.profileId !== profileId)
  profile.updatedAt = new Date().toISOString()

  await dynamo.send(new PutItemCommand({
    TableName: USER_PROFILE_TABLE,
    Item: marshall(profile, { removeUndefinedValues: true }),
  }))

  return json(200, { ok: true })
}

async function setUserEnabled(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? '{}') as { username: string; enabled: boolean }
  if (!body.username) return json(400, { error: 'username required' })

  if (body.enabled) {
    await cognito.send(
      new AdminEnableUserCommand({ UserPoolId: CONSUMER_USER_POOL_ID, Username: body.username }),
    )
  } else {
    await cognito.send(
      new AdminDisableUserCommand({ UserPoolId: CONSUMER_USER_POOL_ID, Username: body.username }),
    )
  }
  return json(200, { ok: true })
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.requestContext.http.path
  const method = event.requestContext.http.method

  try {
    if (path === '/dashboard' && method === 'GET') return getDashboard()
    if (path === '/users' && method === 'GET') return getUsers(event)
    if (path === '/users' && method === 'PATCH') return setUserEnabled(event)
    if (path === '/profile' && method === 'PATCH') return updateProfile(event)
    if (path === '/searches' && method === 'DELETE') return deleteSearchProfile(event)
    if (path === '/documents' && method === 'GET') return getDocuments()
    if (path === '/viewings' && method === 'GET') return getViewings()
    if (path === '/offers' && method === 'GET') return getOffers()

    return json(404, { error: 'Not found' })
  } catch (err) {
    console.error(err)
    return json(500, { error: 'Internal server error' })
  }
}
