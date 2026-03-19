import { DynamoDBClient, DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import type { UserProfile, SearchResult, Viewing, UserDocument, Offer, AvailabilityWindow, Favorite } from './types'
import { viewingAgentResponseToBuyerEmail, sellerDisclosureReceivedEmail, sellerDecisionEmail, viewingCancellationToAgentEmail } from './email-templates'
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

async function deleteSearchProfile(userId: string, profileId: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: userId } },
    }),
  )
  if (!result.Item) return json(404, { error: 'Profile not found' })

  const userProfile = unmarshall(result.Item) as UserProfile
  const before = userProfile.searchProfiles.length
  userProfile.searchProfiles = userProfile.searchProfiles.filter((p) => p.profileId !== profileId)
  if (userProfile.searchProfiles.length === before) return json(404, { error: 'Search profile not found' })

  userProfile.updatedAt = new Date().toISOString()
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Item: marshall(userProfile, { removeUndefinedValues: true }),
    }),
  )
  return json(200, { ok: true })
}

async function getProfile(userId: string, email?: string, givenName?: string, familyName?: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: userId } },
    }),
  )
  if (!result.Item) {
    // Seed the profile on first load using claims from the ID token.
    // Cognito includes email/given_name/family_name when the 'profile' scope is granted,
    // which covers both native and Google-federated users.
    const now = new Date().toISOString()
    const seed: Record<string, unknown> = { userId, searchProfiles: [], createdAt: now, updatedAt: now }
    if (email) seed.email = email
    if (givenName) seed.firstName = givenName
    if (familyName) seed.lastName = familyName
    await dynamo.send(new PutItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Item: marshall(seed),
      ConditionExpression: 'attribute_not_exists(userId)',
    })).catch(() => { /* concurrent request already created it — ignore */ })
    return json(200, seed)
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
  const body = JSON.parse(event.body ?? '{}') as { firstName?: string; lastName?: string; availability?: AvailabilityWindow[] }
  const { firstName, lastName, availability } = body
  if (!firstName && !lastName && availability === undefined) return json(400, { error: 'Nothing to update' })

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updatedAt: now }
  if (firstName) updates.firstName = firstName
  if (lastName) updates.lastName = lastName
  if (availability !== undefined) updates.availability = availability

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

async function getNotifications(userId: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.NOTIFICATIONS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
    }),
  )
  const notifications = (result.Items ?? [])
    .map((item: Record<string, AttributeValue>) => unmarshall(item))
    .sort((a, b) => (b.sentAt as string).localeCompare(a.sentAt as string))
  return json(200, { notifications })
}

async function getOffers(userId: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.OFFERS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ScanIndexForward: false,
    }),
  )
  const offers = (result.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item) as Offer)
  return json(200, { offers })
}

async function getFavorites(userId: string): Promise<APIGatewayProxyResultV2> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.FAVORITES_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ScanIndexForward: false,
    }),
  )
  const favorites = (result.Items ?? []).map((item: Record<string, AttributeValue>) => unmarshall(item) as Favorite)
  return json(200, { favorites })
}

async function toggleFavorite(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? '{}')
  const { listingId, listingData, profileId } = body
  if (!listingId) return json(400, { error: 'Missing listingId' })

  const existing = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.FAVORITES_TABLE!,
      Key: marshall({ userId, listingId }),
    }),
  )

  if (existing.Item) {
    await dynamo.send(
      new DeleteItemCommand({
        TableName: process.env.FAVORITES_TABLE!,
        Key: marshall({ userId, listingId }),
      }),
    )
    return json(200, { favorited: false })
  }

  const favorite: Favorite = {
    userId,
    listingId,
    profileId: profileId ?? '',
    listingData,
    favoritedAt: new Date().toISOString(),
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.FAVORITES_TABLE!,
      Item: marshall(favorite, { removeUndefinedValues: true }),
    }),
  )
  return json(200, { favorited: true })
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
    purchaseAgreementAvailable: !!offer.purchaseAgreementDocumentId,
    sellerDecisionStatus: offer.sellerResponse?.status ?? null,
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

async function getSellerDownloadPaUrl(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { token } = event.queryStringParameters ?? {}
  if (!token) return json(400, { error: 'Missing token' })

  const offer = await findOfferByToken(token)
  if (!offer) return json(404, { error: 'Invalid or expired link' })
  if (!offer.purchaseAgreementDocumentId) return json(404, { error: 'No purchase agreement available' })

  const s3Key = `${offer.userId}/${offer.purchaseAgreementDocumentId}`
  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.DOCUMENT_BUCKET_NAME!, Key: s3Key }),
    { expiresIn: 900 },
  )
  return json(200, { downloadUrl })
}

async function recordSellerDecision(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body ?? '{}') as {
    token?: string
    decision?: string
    counterOfferPrice?: number
  }
  const { token, decision, counterOfferPrice } = body
  if (!token || !decision) return json(400, { error: 'Missing token or decision' })
  if (!['accepted', 'countered', 'rejected'].includes(decision)) return json(400, { error: 'Invalid decision' })

  const offer = await findOfferByToken(token)
  if (!offer) return json(404, { error: 'Invalid or expired link' })
  if (offer.status !== 'submitted') return json(400, { error: 'Offer is not in submitted state' })

  const dec = decision as 'accepted' | 'countered' | 'rejected'
  const now = new Date().toISOString()
  const updatedOffer: Offer = {
    ...offer,
    status: dec,
    sellerResponse: {
      ...offer.sellerResponse,
      status: dec,
      counterOfferPrice: dec === 'countered' ? counterOfferPrice : undefined,
      respondedAt: now,
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
    const { subject, html } = sellerDecisionEmail(
      offer.listingAddress,
      dec,
      counterOfferPrice,
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

async function joinWaitlist(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { email } = JSON.parse(event.body ?? '{}') as { email?: string }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Valid email required' })
  }
  const existing = await dynamo.send(new GetItemCommand({
    TableName: process.env.WAITLIST_TABLE!,
    Key: { email: { S: email.toLowerCase() } },
  }))
  if (existing.Item) return json(200, { ok: true }) // idempotent
  await dynamo.send(new PutItemCommand({
    TableName: process.env.WAITLIST_TABLE!,
    Item: marshall({ email: email.toLowerCase(), status: 'waitlist', createdAt: new Date().toISOString() }),
  }))
  return json(200, { ok: true })
}

async function checkWaitlist(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const email = event.queryStringParameters?.email
  if (!email) return json(400, { error: 'email required' })
  const result = await dynamo.send(new GetItemCommand({
    TableName: process.env.WAITLIST_TABLE!,
    Key: { email: { S: email.toLowerCase() } },
  }))
  if (!result.Item) return json(404, { error: 'Not found' })
  const item = unmarshall(result.Item) as { email: string; status: string; createdAt: string }
  return json(200, { status: item.status })
}

async function acceptWaitlist(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { email } = JSON.parse(event.body ?? '{}') as { email?: string }
  if (!email) return json(400, { error: 'email required' })
  await dynamo.send(new UpdateItemCommand({
    TableName: process.env.WAITLIST_TABLE!,
    Key: { email: { S: email.toLowerCase() } },
    UpdateExpression: 'SET #s = :s',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': { S: 'accepted_beta' } },
  }))
  return json(200, { ok: true })
}

async function getStats(userId: string): Promise<APIGatewayProxyResultV2> {
  const [searchResultsRes, favoritesRes, viewingsRes, offersRes, clicksRes] = await Promise.all([
    dynamo.send(new QueryCommand({
      TableName: process.env.SEARCH_RESULTS_TABLE!,
      IndexName: 'userId-matchedAt-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
    })),
    dynamo.send(new QueryCommand({
      TableName: process.env.FAVORITES_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
    })),
    dynamo.send(new QueryCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
    })),
    dynamo.send(new QueryCommand({
      TableName: process.env.OFFERS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
    })),
    dynamo.send(new QueryCommand({
      TableName: process.env.LISTING_CLICKS_TABLE!,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': { S: userId } },
      ScanIndexForward: false,
      Limit: 500,
    })),
  ])

  const searchResultItems = (searchResultsRes.Items ?? []).map((i) => unmarshall(i) as { profileId: string; matchedAt: string })
  const viewingItems = (viewingsRes.Items ?? []).map((i) => unmarshall(i) as { status: string; requestedAt: string })
  const offerItems = (offersRes.Items ?? []).map((i) => unmarshall(i) as { status: string; createdAt?: string; updatedAt?: string })
  const clickItems = (clicksRes.Items ?? []).map((i) => unmarshall(i) as { clickedAt: string; platform: string; profileId?: string })

  // Stat cards
  const searchResultsCount = searchResultItems.length
  const favoritesCount = (favoritesRes.Items ?? []).length
  const viewingsAccepted = viewingItems.filter((v) => v.status === 'confirmed').length
  const offersAccepted = offerItems.filter((o) => o.status === 'accepted').length

  // Search results over time — group by week + profileId
  const srByWeek: Record<string, Record<string, number>> = {}
  for (const r of searchResultItems) {
    const week = r.matchedAt.slice(0, 10) // use day as granularity
    if (!srByWeek[week]) srByWeek[week] = {}
    srByWeek[week][r.profileId] = (srByWeek[week][r.profileId] ?? 0) + 1
  }
  const profileIds = [...new Set(searchResultItems.map((r) => r.profileId))]
  const srDates = Object.keys(srByWeek).sort()
  const searchResultsOverTime = srDates.map((date) => {
    const entry: Record<string, unknown> = { date }
    for (const pid of profileIds) entry[pid] = srByWeek[date][pid] ?? 0
    return entry
  })

  // Viewings by month
  const viewingsByMonth: Record<string, { requested: number; confirmed: number }> = {}
  for (const v of viewingItems) {
    const month = v.requestedAt.slice(0, 7)
    if (!viewingsByMonth[month]) viewingsByMonth[month] = { requested: 0, confirmed: 0 }
    viewingsByMonth[month].requested++
    if (v.status === 'confirmed') viewingsByMonth[month].confirmed++
  }
  const viewingsChartData = Object.entries(viewingsByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, counts]) => ({ month, ...counts }))

  // Offers by month
  const offersByMonth: Record<string, { submitted: number; accepted: number }> = {}
  for (const o of offerItems) {
    const ts = o.createdAt ?? o.updatedAt ?? ''
    const month = ts.slice(0, 7)
    if (!month) continue
    if (!offersByMonth[month]) offersByMonth[month] = { submitted: 0, accepted: 0 }
    offersByMonth[month].submitted++
    if (o.status === 'accepted') offersByMonth[month].accepted++
  }
  const offersChartData = Object.entries(offersByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, counts]) => ({ month, ...counts }))

  // Listing clicks by day + platform
  const clicksByDay: Record<string, { zillow: number; redfin: number; realtor: number }> = {}
  for (const c of clickItems) {
    const day = c.clickedAt.slice(0, 10)
    if (!clicksByDay[day]) clicksByDay[day] = { zillow: 0, redfin: 0, realtor: 0 }
    const p = c.platform?.toLowerCase() as 'zillow' | 'redfin' | 'realtor'
    if (p === 'zillow' || p === 'redfin' || p === 'realtor') clicksByDay[day][p]++
  }
  const listingClicksChartData = Object.entries(clicksByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }))

  return json(200, {
    stats: {
      searchResultsCount,
      favoritesCount,
      viewingsCount: { total: viewingItems.length, accepted: viewingsAccepted },
      offersCount: { total: offerItems.length, accepted: offersAccepted },
    },
    charts: {
      searchResultsOverTime,
      searchProfileIds: profileIds,
      viewingsChartData,
      offersChartData,
      listingClicksChartData,
    },
  })
}

async function recordListingClick(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { listingId, platform, profileId } = JSON.parse(event.body ?? '{}') as {
    listingId?: string
    platform?: string
    profileId?: string
  }
  if (!listingId || !platform) return json(400, { error: 'Missing listingId or platform' })

  const clickedAt = new Date().toISOString()
  await dynamo.send(new PutItemCommand({
    TableName: process.env.LISTING_CLICKS_TABLE!,
    Item: marshall({ userId, clickedAt, listingId, platform: platform.toLowerCase(), profileId: profileId ?? '' }),
  }))

  return json(200, { ok: true })
}

async function cancelViewing(userId: string, event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { viewingId } = JSON.parse(event.body ?? '{}') as { viewingId?: string }
  if (!viewingId) return json(400, { error: 'Missing viewingId' })

  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      Key: marshall({ userId, viewingId }),
    }),
  )
  if (!result.Item) return json(404, { error: 'Viewing not found' })

  const viewing = unmarshall(result.Item) as Viewing
  if (viewing.status === 'cancelled') return json(200, { ok: true })

  const now = new Date().toISOString()
  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.VIEWINGS_TABLE!,
      Key: marshall({ userId, viewingId }),
      UpdateExpression: 'SET #status = :s, cancelledAt = :ts',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':s': { S: 'cancelled' }, ':ts': { S: now } },
    }),
  )

  if (viewing.agentEmail) {
    const profileResult = await dynamo.send(
      new GetItemCommand({
        TableName: process.env.USER_PROFILE_TABLE!,
        Key: { userId: { S: userId } },
        ProjectionExpression: 'firstName, lastName, email',
      }),
    )
    const profile = profileResult.Item ? (unmarshall(profileResult.Item) as Pick<UserProfile, 'firstName' | 'lastName' | 'email'>) : null
    const buyerName = profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : profile?.email ?? userId
    const buyerEmail = profile?.email ?? userId

    const { subject, html } = viewingCancellationToAgentEmail(viewing, buyerName, buyerEmail)
    try {
      const bcc = process.env.AGENT_EMAIL_BCC
      const toAddress = process.env.SES_TEST_RECIPIENT ?? viewing.agentEmail
      await ses.send(new SendEmailCommand({
        Source: 'noreply@sirrealtor.com',
        Destination: { ToAddresses: [toAddress], ...(bcc ? { BccAddresses: [bcc] } : {}) },
        Message: { Subject: { Data: subject }, Body: { Html: { Data: html } } },
      }))
    } catch (err) {
      console.error('Failed to send cancellation email to agent', err)
    }
  }

  return json(200, { ok: true })
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath

  try {
    // Unauthenticated routes
    if (path === '/waitlist' && event.requestContext.http.method === 'POST') return joinWaitlist(event)
    if (path === '/waitlist/check' && event.requestContext.http.method === 'GET') return checkWaitlist(event)
    if (path === '/waitlist/accept' && event.requestContext.http.method === 'POST') return acceptWaitlist(event)
    if (path === '/viewing-response') return recordViewingResponse(event)
    if (path === '/seller-response' && event.requestContext.http.method === 'GET') return getSellerResponseInfo(event)
    if (path === '/seller-response/upload-url') return getSellerUploadUrl(event)
    if (path === '/seller-response/confirm') return confirmSellerUpload(event)
    if (path === '/seller-response/download-pa' && event.requestContext.http.method === 'GET') return getSellerDownloadPaUrl(event)
    if (path === '/seller-response/decision' && event.requestContext.http.method === 'POST') return recordSellerDecision(event)
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
    const claimEmail = claims?.['email'] as string | undefined
    const claimGivenName = claims?.['given_name'] as string | undefined
    const claimFamilyName = claims?.['family_name'] as string | undefined

    if (path === '/stats' && event.requestContext.http.method === 'GET') return getStats(userId)
    if (path === '/stats/listing-click' && event.requestContext.http.method === 'POST') return recordListingClick(userId, event)
    if (path === '/notifications') return getNotifications(userId)
    if (path === '/viewings/cancel' && event.requestContext.http.method === 'POST') return cancelViewing(userId, event)
    if (path === '/offers' && event.requestContext.http.method === 'GET') return getOffers(userId)
    if (path === '/favorites' && event.requestContext.http.method === 'GET') return getFavorites(userId)
    if (path === '/favorites/toggle' && event.requestContext.http.method === 'POST') return toggleFavorite(userId, event)
    if (path === '/profile' && event.requestContext.http.method === 'GET') return getProfile(userId, claimEmail, claimGivenName, claimFamilyName)
    if (path === '/profile' && event.requestContext.http.method === 'PATCH') return patchProfile(userId, event)
    if (path.startsWith('/search-profiles/') && event.requestContext.http.method === 'DELETE') {
      const profileId = path.split('/')[2]
      return deleteSearchProfile(userId, profileId)
    }
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
