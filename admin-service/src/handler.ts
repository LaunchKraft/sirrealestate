// ci trigger 2
import { DynamoDBClient, ScanCommand, GetItemCommand, PutItemCommand, DeleteItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

const dynamo = new DynamoDBClient({})
const cognito = new CognitoIdentityProviderClient({})
const ses = new SESClient({})

const CONSUMER_USER_POOL_ID = process.env.CONSUMER_USER_POOL_ID!
const USER_PROFILE_TABLE = process.env.USER_PROFILE_TABLE!
const SEARCH_RESULTS_TABLE = process.env.SEARCH_RESULTS_TABLE!
const VIEWINGS_TABLE = process.env.VIEWINGS_TABLE!
const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE!
const OFFERS_TABLE = process.env.OFFERS_TABLE!
const WAITLIST_TABLE = process.env.WAITLIST_TABLE!

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

async function getWaitlist(): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(new ScanCommand({ TableName: WAITLIST_TABLE }))
  const entries = (result.Items ?? []).map(item => unmarshall(item))
  entries.sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string))
  return json(200, { entries })
}

async function deleteWaitlistEntry(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const email = event.queryStringParameters?.email
  if (!email) return json(400, { error: 'email required' })
  await dynamo.send(new DeleteItemCommand({ TableName: WAITLIST_TABLE, Key: { email: { S: email } } }))
  return json(200, { ok: true })
}

async function patchWaitlistEntry(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const email = event.queryStringParameters?.email
  if (!email) return json(400, { error: 'email required' })
  const { status } = JSON.parse(event.body ?? '{}') as { status?: string }
  if (!status || !['waitlist', 'invited_beta', 'accepted_beta'].includes(status)) {
    return json(400, { error: 'Invalid status' })
  }
  await dynamo.send(new UpdateItemCommand({
    TableName: WAITLIST_TABLE,
    Key: { email: { S: email } },
    UpdateExpression: 'SET #s = :s',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': { S: status } },
  }))
  return json(200, { ok: true })
}

async function inviteWaitlistEntry(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const email = event.queryStringParameters?.email
  if (!email) return json(400, { error: 'email required' })

  // Update status to invited_beta
  await dynamo.send(new UpdateItemCommand({
    TableName: WAITLIST_TABLE,
    Key: { email: { S: email } },
    UpdateExpression: 'SET #s = :s',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': { S: 'invited_beta' } },
  }))

  // Send invite email
  const signupUrl = `https://app.sirrealtor.com/beta-signup?email=${encodeURIComponent(email)}`
  const { subject, html } = buildBetaInviteEmail(email, signupUrl)
  await ses.send(new SendEmailCommand({
    Source: 'Sir Realtor <noreply@sirrealtor.com>',
    Destination: { ToAddresses: [email] },
    Message: { Subject: { Data: subject }, Body: { Html: { Data: html } } },
  }))

  return json(200, { ok: true })
}

function buildBetaInviteEmail(email: string, signupUrl: string): { subject: string; html: string } {
  const subject = "You're invited to try the Sir Realtor Beta App"
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're Invited — Sir Realtor Beta</title>
</head>
<body style="margin:0;padding:0;background:#f0f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7fb;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07)">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#00b4d8 0%,#0077b6 100%);padding:36px 48px">
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align:middle">
                    <h1 style="margin:0 0 6px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.2">You're invited to try the Sir Realtor Beta App 🎉</h1>
                    <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.85)">Your private beta invitation is ready</p>
                  </td>
                  <td style="vertical-align:middle;text-align:right;padding-left:24px;width:120px">
                    <img src="https://app.sirrealtor.com/logo.png" alt="Sir Realtor" width="100" style="display:block;border:0;border-radius:50%" />
                    <p style="margin:6px 0 0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.75);text-align:center">Sir Realtor</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 48px">
              <p style="margin:0 0 16px;font-size:16px;color:#1a2233;line-height:1.6">Hi there,</p>
              <p style="margin:0 0 16px;font-size:16px;color:#1a2233;line-height:1.6">
                We're thrilled to invite you to the <strong>Sir Realtor private beta</strong> — your AI-powered real estate agent that finds, tracks, and helps you make offers on homes, all through natural conversation.
              </p>
              <p style="margin:0 0 32px;font-size:16px;color:#1a2233;line-height:1.6">
                As a beta member, you'll get early access to features that are transforming how people buy homes. We'd love your feedback — you can share it directly with the AI agent inside the app, or just email us at <a href="mailto:feedback@sirrealtor.com" style="color:#0077b6;text-decoration:none">feedback@sirrealtor.com</a>.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px">
                <tr>
                  <td align="center" style="border-radius:10px;background:linear-gradient(135deg,#00b4d8 0%,#0077b6 100%)">
                    <a href="${signupUrl}" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.01em">
                      Complete Your Sign Up →
                    </a>
                  </td>
                </tr>
              </table>
              <!-- What you'll get -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background:#f0f7fb;border-radius:12px;margin-bottom:32px">
                <tr>
                  <td style="padding:24px 28px">
                    <p style="margin:0 0 14px;font-size:14px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#0077b6">What you'll get</p>
                    <table cellpadding="0" cellspacing="0">
                      <tr><td style="padding:4px 0;font-size:15px;color:#1a2233;line-height:1.5">🔍 &nbsp;AI-curated property matches based on your criteria</td></tr>
                      <tr><td style="padding:4px 0;font-size:15px;color:#1a2233;line-height:1.5">📅 &nbsp;Automated viewing scheduling with listing agents</td></tr>
                      <tr><td style="padding:4px 0;font-size:15px;color:#1a2233;line-height:1.5">📝 &nbsp;Guided offer creation and submission</td></tr>
                      <tr><td style="padding:4px 0;font-size:15px;color:#1a2233;line-height:1.5">🏠 &nbsp;Step-by-step closing guidance and deadline tracking</td></tr>
                      <tr><td style="padding:4px 0;font-size:15px;color:#1a2233;line-height:1.5">💬 &nbsp;Your personal real estate agent, available 24/7</td></tr>
                    </table>
                    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;border-top:1px solid #dbeaf2;padding-top:14px">
                      <strong>Beta test mode notice:</strong> During the beta, all outbound emails to listing agents are simulated — our admin team will respond to your viewing and offer requests on their behalf so you can experience the full workflow without contacting live agents.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">
                This link is personal to <strong>${email}</strong> and will be used as your account email. It expires in 7 days — don't wait too long!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 48px;border-top:1px solid #e8f4f8;text-align:center">
              <p style="margin:0;font-size:12px;color:#94a3b8">
                Sir Realtor · <a href="https://sirrealtor.com" style="color:#00b4d8;text-decoration:none">sirrealtor.com</a>
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">
                You're receiving this because you joined our waitlist. Questions? Reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  return { subject, html }
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
    if (path === '/waitlist' && method === 'GET') return getWaitlist()
    if (path === '/waitlist' && method === 'DELETE') return deleteWaitlistEntry(event)
    if (path === '/waitlist' && method === 'PATCH') return patchWaitlistEntry(event)
    if (path === '/waitlist/invite' && method === 'POST') return inviteWaitlistEntry(event)

    return json(404, { error: 'Not found' })
  } catch (err) {
    console.error(err)
    return json(500, { error: 'Internal server error' })
  }
}
