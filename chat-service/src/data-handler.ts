import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import type { UserProfile, SearchResult, Viewing, UserDocument, Offer } from './types'
import { viewingAgentResponseToBuyerEmail, sellerDisclosureReceivedEmail } from './email-templates'
import { buildListingUrl } from './mls/listing-url'
import { classifyDocument } from './documents/classifier'
import { handleDropboxSignWebhook } from './webhooks/dropbox-sign'
import { handleEarnnestWebhook } from './webhooks/earnnest'

const dynamo = new DynamoDBClient({})
const ses = new SESClient({})
const s3 = new S3Client({})

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function getProfile(userId: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: userId } },
    }),
  )
  if (!result.Item) {
    return json(200, { userId, searchProfiles: [], createdAt: null })
  }
  return json(200, unmarshall(result.Item) as UserProfile)
}

async function getSearchResults(userId: string): Promise<APIGatewayProxyResultV2> {
  const [queryResult, profileResult] = await Promise.all([
    dynamo.send(
      new QueryCommand({
        TableName: process.env.SEARCH_RESULTS_TABLE!,
        IndexName: 'userId-matchedAt-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': { S: userId } },
        ScanIndexForward: false,  // descending by matchedAt
        Limit: 100,
      }),
    ),
    dynamo.send(
      new GetItemCommand({
        TableName: process.env.USER_PROFILE_TABLE!,
        Key: { userId: { S: userId } },
        ProjectionExpression: 'listingViewingPreference',
      }),
    ),
  ])

  const preference = profileResult.Item
    ? (unmarshall(profileResult.Item) as Pick<UserProfile, 'listingViewingPreference'>).listingViewingPreference
    : undefined

  const results = (queryResult.Items ?? []).map((item: Record<string, AttributeValue>) => {
    const r = unmarshall(item) as SearchResult
    r.listingData.listingUrl = buildListingUrl(r.listingData.address, preference)
    return r
  })

  // Group by profileId
  const grouped: Record<string, SearchResult[]> = {}
  for (const r of results) {
    if (!grouped[r.profileId]) grouped[r.profileId] = []
    grouped[r.profileId].push(r)
  }

  return json(200, { results, grouped })
}

async function recordViewingResponse(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { viewingId, slot } = event.queryStringParameters ?? {}
  if (!viewingId || slot === undefined) {
    return json(400, { error: 'Missing viewingId or slot' })
  }

  // Scan for the viewing by viewingId (table is small; no GSI needed)
  const scanResult = await dynamo.send(
    new ScanCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      FilterExpression: 'viewingId = :vid',
      ExpressionAttributeValues: { ':vid': { S: viewingId } },
    }),
  )

  const item = scanResult.Items?.[0]
  if (!item) return json(404, { error: 'Viewing not found' })

  const viewing = unmarshall(item) as Viewing
  const now = new Date().toISOString()

  const isNone = slot === 'none'
  const selectedSlot = isNone ? 'none' : (viewing.availabilitySlots?.[parseInt(slot)] ?? 'none')
  const newStatus = isNone ? 'requested' : 'confirmed'

  const updateExpr = isNone
    ? 'SET agentSelectedSlot = :slot, agentRespondedAt = :now, #s = :status'
    : 'SET agentSelectedSlot = :slot, agentRespondedAt = :now, #s = :status, proposedDateTime = :dt'

  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      Key: marshall({ userId: viewing.userId, viewingId: viewing.viewingId }),
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':slot': { S: selectedSlot },
        ':now': { S: now },
        ':status': { S: newStatus },
        ...(!isNone ? { ':dt': { S: selectedSlot } } : {}),
      },
    }),
  )

  // Notify the buyer — look up their email from UserProfile
  const profileResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: viewing.userId } },
      ProjectionExpression: 'email',
    }),
  )
  const buyerEmail = profileResult.Item ? (unmarshall(profileResult.Item) as UserProfile).email : undefined

  if (buyerEmail) {
    const updatedViewing: Viewing = { ...viewing, agentSelectedSlot: selectedSlot }
    const chatUrl = 'https://app.sirrealtor.com/chat'
    const { subject, html } = viewingAgentResponseToBuyerEmail(updatedViewing, !isNone, chatUrl)
    await ses.send(
      new SendEmailCommand({
        Source: 'noreply@sirrealtor.com',
        Destination: { ToAddresses: [buyerEmail] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: html } },
        },
      }),
    )
  }

  return json(200, { ok: true })
}

async function getViewings(userId: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ScanIndexForward: false,
    }),
  )

  const viewings = (result.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item) as Viewing)
  viewings.sort((a: Viewing, b: Viewing) => b.requestedAt.localeCompare(a.requestedAt))

  return json(200, { viewings })
}

async function getDocuments(userId: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ScanIndexForward: false,
    }),
  )
  const documents = (result.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item) as UserDocument)
  return json(200, { documents })
}

async function getUploadUrl(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { fileName, contentType } = event.queryStringParameters ?? {}
  if (!fileName || !contentType) return json(400, { error: 'Missing fileName or contentType' })

  const documentId = crypto.randomUUID()
  const s3Key = `${userId}/${documentId}`

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET_NAME!,
      Key: s3Key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  )

  return json(200, { uploadUrl, documentId, s3Key })
}

async function confirmUpload(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? '{}') as {
    documentId?: string
    s3Key?: string
    fileName?: string
    contentType?: string
    sizeBytes?: number
  }

  const { documentId, s3Key, fileName, contentType, sizeBytes } = body
  if (!documentId || !s3Key || !fileName || !contentType || sizeBytes === undefined) {
    return json(400, { error: 'Missing required fields' })
  }

  const uploadedAt = new Date().toISOString()
  const doc: UserDocument = { userId, documentId, fileName, contentType, sizeBytes, s3Key, uploadedAt }

  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Item: marshall(doc),
    }),
  )

  if (doc.contentType === 'application/pdf') {
    const classification = await classifyDocument(doc.s3Key, doc.fileName).catch(() => undefined)
    if (classification && classification.documentType !== 'unknown') {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: process.env.DOCUMENTS_TABLE!,
          Key: marshall({ userId, documentId: doc.documentId }),
          UpdateExpression: 'SET documentType = :t, extractedData = :d',
          ExpressionAttributeValues: marshall({
            ':t': classification.documentType,
            ':d': classification.extractedData ?? {},
          }),
        }),
      ).catch(() => {})
    }
    return json(200, { ...doc, ...classification })
  }

  return json(200, doc)
}

async function patchProfile(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? '{}') as { firstName?: string; lastName?: string }
  const { firstName, lastName } = body
  if (!firstName && !lastName) return json(400, { error: 'Nothing to update' })

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updatedAt: now }
  if (firstName) updates.firstName = firstName
  if (lastName) updates.lastName = lastName

  const setExpressions = Object.keys(updates).map((k) => `#${k} = :${k}`)
  const expressionAttributeNames = Object.fromEntries(Object.keys(updates).map((k) => [`#${k}`, k]))
  const expressionAttributeValues = Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [`:${k}`, marshall({ val: v }).val]),
  )

  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: userId } },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }),
  )

  return json(200, { ok: true })
}

async function getDownloadUrl(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { documentId } = event.queryStringParameters ?? {}
  if (!documentId) return json(400, { error: 'Missing documentId' })

  // Verify the document belongs to this user
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Key: marshall({ userId, documentId }),
      ProjectionExpression: 's3Key',
    }),
  )
  if (!result.Item) return json(404, { error: 'Document not found' })

  const { s3Key } = unmarshall(result.Item) as Pick<UserDocument, 's3Key'>

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET_NAME!,
      Key: s3Key,
    }),
    { expiresIn: 900 },
  )

  return json(200, { downloadUrl })
}

async function findOfferByToken(token: string): Promise<Offer | null> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.OFFERS_TABLE!,
      IndexName: 'sellerResponseToken-index',
      KeyConditionExpression: 'sellerResponseToken = :t',
      ExpressionAttributeValues: { ':t': { S: token } },
      Limit: 1,
    }),
  )
  if (!result.Items || result.Items.length === 0) return null
  return unmarshall(result.Items[0]) as Offer
}

async function getSellerResponseInfo(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const token = event.queryStringParameters?.['token']
  if (!token) return json(400, { error: 'Missing token' })

  const offer = await findOfferByToken(token)
  if (!offer) return json(404, { error: 'Invalid or expired link' })

  return json(200, {
    listingAddress: offer.listingAddress,
    propertyState: offer.propertyState,
    disclosuresAlreadyUploaded: offer.sellerResponse?.disclosureDocumentIds?.length ?? 0,
  })
}

async function getSellerUploadUrl(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { token, fileName, contentType } = event.queryStringParameters ?? {}
  if (!token || !fileName || !contentType) return json(400, { error: 'Missing required parameters' })

  const offer = await findOfferByToken(token)
  if (!offer) return json(404, { error: 'Invalid or expired link' })

  const documentId = crypto.randomUUID()
  const s3Key = `${offer.userId}/${documentId}`

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET_NAME!,
      Key: s3Key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  )

  return json(200, { uploadUrl, documentId, s3Key })
}

async function confirmSellerUpload(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? '{}') as {
    token?: string
    documentId?: string
    s3Key?: string
    fileName?: string
    contentType?: string
    sizeBytes?: number
  }
  const { token, documentId, s3Key, fileName, contentType, sizeBytes } = body
  if (!token || !documentId || !s3Key || !fileName || !contentType || sizeBytes === undefined) {
    return json(400, { error: 'Missing required fields' })
  }

  const offer = await findOfferByToken(token)
  if (!offer) return json(404, { error: 'Invalid or expired link' })

  const now = new Date().toISOString()

  // Store the document under the buyer's userId in the Documents table
  const doc: UserDocument = {
    userId: offer.userId,
    documentId,
    fileName,
    contentType,
    sizeBytes,
    s3Key,
    uploadedAt: now,
    documentType: 'seller_disclosure',
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Item: marshall(doc, { removeUndefinedValues: true }),
    }),
  )

  // Update the offer's sellerResponse
  const updatedOffer: Offer = {
    ...offer,
    sellerResponse: {
      status: 'received',
      disclosureDocumentIds: [
        ...(offer.sellerResponse?.disclosureDocumentIds ?? []),
        documentId,
      ],
      respondedAt: offer.sellerResponse?.respondedAt ?? now,
    },
    updatedAt: now,
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Item: marshall(updatedOffer, { removeUndefinedValues: true }),
    }),
  )

  // Notify the buyer
  const profileResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: offer.userId } },
      ProjectionExpression: 'email',
    }),
  )
  const buyerEmail = profileResult.Item
    ? (unmarshall(profileResult.Item) as Pick<UserProfile, 'email'>).email
    : undefined

  if (buyerEmail) {
    const { subject, html } = sellerDisclosureReceivedEmail(
      offer.listingAddress,
      [fileName],
      'https://app.sirrealtor.com/chat',
    )
    await ses.send(
      new SendEmailCommand({
        Source: 'noreply@sirrealtor.com',
        Destination: { ToAddresses: [buyerEmail] },
        Message: { Subject: { Data: subject }, Body: { Html: { Data: html } } },
      }),
    )
  }

  return json(200, { ok: true })
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath

  try {
    // Unauthenticated routes
    if (path === '/viewing-response') return recordViewingResponse(event)
    if (path === '/seller-response' && event.requestContext.http.method === 'GET') return getSellerResponseInfo(event)
    if (path === '/seller-response/upload-url') return getSellerUploadUrl(event)
    if (path === '/seller-response/confirm') return confirmSellerUpload(event)
    if (path === '/webhooks/dropbox-sign' && event.requestContext.http.method === 'POST') {
      const ack = await handleDropboxSignWebhook(event.body ?? '')
      return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: ack }
    }
    if (path === '/webhooks/earnnest' && event.requestContext.http.method === 'POST') {
      const sig = event.headers?.['x-earnnest-signature']
      const result = await handleEarnnestWebhook(event.body ?? '', sig)
      return { statusCode: result.statusCode, headers: { 'Content-Type': 'application/json' }, body: result.body }
    }

    // Authenticated routes — extract userId from JWT claims
    const claims = (event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } }
    }).authorizer?.jwt?.claims
    const userId = claims?.['sub'] as string | undefined
    if (!userId) return json(401, { error: 'Unauthorized' })

    if (path === '/profile' && event.requestContext.http.method === 'GET') return getProfile(userId)
    if (path === '/profile' && event.requestContext.http.method === 'PATCH') return patchProfile(userId, event)
    if (path === '/search-results') return getSearchResults(userId)
    if (path === '/viewings') return getViewings(userId)
    if (path === '/documents' && event.requestContext.http.method === 'GET') return getDocuments(userId)
    if (path === '/documents/upload-url') return getUploadUrl(userId, event)
    if (path === '/documents' && event.requestContext.http.method === 'POST') return confirmUpload(userId, event)
    if (path === '/documents/download-url') return getDownloadUrl(userId, event)
    return json(404, { error: 'Not found' })
  } catch (err) {
    console.error('Data handler error', err)
    return json(500, { error: 'Internal server error' })
  }
}
