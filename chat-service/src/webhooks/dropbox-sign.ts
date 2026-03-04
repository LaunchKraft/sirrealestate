import { createHmac, timingSafeEqual } from 'crypto'
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { Offer, UserDocument, UserProfile } from '../types'
import { purchaseAgreementSignedEmail } from '../email-templates'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})
const ses = new SESClient({})
const secretsManager = new SecretsManagerClient({})
let cachedApiKey: string | null = null

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey
  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.DROPBOX_SIGN_API_KEY_SECRET_ARN! }),
  )
  cachedApiKey = SecretString!
  return cachedApiKey
}

interface DropboxSignEvent {
  event: {
    event_type: string
    event_time: string
    event_hash: string
  }
  signature_request?: {
    signature_request_id: string
    metadata?: {
      userId?: string
      offerId?: string
      formType?: string
    }
  }
}

/** Dropbox Sign sends form-encoded body with the JSON payload in a 'json' parameter. */
function parseWebhookBody(rawBody: string): DropboxSignEvent {
  if (rawBody.trimStart().startsWith('{')) {
    return JSON.parse(rawBody) as DropboxSignEvent
  }
  const params = new URLSearchParams(rawBody)
  const jsonStr = params.get('json')
  if (!jsonStr) throw new Error('Missing json parameter in webhook body')
  return JSON.parse(jsonStr) as DropboxSignEvent
}

/** Dropbox Sign HMAC: SHA-256 over (event_time + event_type) keyed with the API key. */
function verifyEventHash(apiKey: string, eventTime: string, eventType: string, providedHash: string): boolean {
  const expected = createHmac('sha256', apiKey).update(eventTime + eventType).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(providedHash, 'hex'))
  } catch {
    return false
  }
}

async function downloadSignedPdf(apiKey: string, signatureRequestId: string): Promise<Buffer> {
  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64')
  const response = await fetch(
    `https://api.hellosign.com/v3/signature_request/files/${signatureRequestId}`,
    { headers: { Authorization: authHeader, Accept: 'application/pdf' } },
  )
  if (!response.ok) {
    throw new Error(`Dropbox Sign files API error ${response.status}: ${await response.text()}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/** Always returns "Hello API Event Received" — Dropbox Sign requires this exact string on every 200. */
export async function handleDropboxSignWebhook(rawBody: string): Promise<string> {
  let payload: DropboxSignEvent
  try {
    payload = parseWebhookBody(rawBody)
  } catch (err) {
    console.error('Dropbox Sign webhook: failed to parse body', err)
    return 'Hello API Event Received'
  }

  const apiKey = await getApiKey()
  const { event_type, event_time, event_hash } = payload.event

  if (!verifyEventHash(apiKey, event_time, event_type, event_hash)) {
    console.error('Dropbox Sign webhook: invalid event hash — ignoring')
    return 'Hello API Event Received'
  }

  if (event_type !== 'signature_request_all_signed') {
    return 'Hello API Event Received'
  }

  const sigReq = payload.signature_request
  if (!sigReq) return 'Hello API Event Received'

  const { userId, offerId, formType } = sigReq.metadata ?? {}
  if (!userId || !offerId || !formType) {
    console.error('Dropbox Sign webhook: missing metadata', { userId, offerId, formType })
    return 'Hello API Event Received'
  }

  // Fetch offer
  const offerResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Key: marshall({ userId, offerId }),
    }),
  )
  if (!offerResult.Item) {
    console.error('Dropbox Sign webhook: offer not found', { userId, offerId })
    return 'Hello API Event Received'
  }
  const offer = unmarshall(offerResult.Item) as Offer

  // Resolve documentId for this form type
  const docIdByFormType: Record<string, string | undefined> = {
    purchase_agreement: offer.purchaseAgreementDocumentId,
    earnest_money_agreement: offer.earnestMoneyAgreementDocumentId,
    agency_disclosure: offer.agencyDisclosureDocumentId,
  }
  const documentId = docIdByFormType[formType]
  if (!documentId) {
    console.error('Dropbox Sign webhook: no documentId for formType', { formType })
    return 'Hello API Event Received'
  }

  // Fetch document to get s3Key
  const docResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Key: marshall({ userId, documentId }),
    }),
  )
  if (!docResult.Item) {
    console.error('Dropbox Sign webhook: document not found', { documentId })
    return 'Hello API Event Received'
  }
  const doc = unmarshall(docResult.Item) as UserDocument

  // Download signed PDF and overwrite in S3
  const signedPdf = await downloadSignedPdf(apiKey, sigReq.signature_request_id)
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET_NAME!,
      Key: doc.s3Key,
      Body: signedPdf,
      ContentType: 'application/pdf',
    }),
  )

  const now = new Date().toISOString()

  // Mark document as signed
  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Key: marshall({ userId, documentId }),
      UpdateExpression: 'SET signedAt = :now',
      ExpressionAttributeValues: marshall({ ':now': now }),
    }),
  )

  // Record signed form on offer
  const signedForms = { ...(offer.signedForms ?? {}), [formType]: now }
  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Key: marshall({ userId, offerId }),
      UpdateExpression: 'SET signedForms = :sf, updatedAt = :now',
      ExpressionAttributeValues: marshall({ ':sf': signedForms, ':now': now }),
    }),
  )

  // Notify buyer
  const profileResult = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Key: { userId: { S: userId } },
      ProjectionExpression: 'email',
    }),
  )
  const buyerEmail = profileResult.Item
    ? (unmarshall(profileResult.Item) as Pick<UserProfile, 'email'>).email
    : undefined

  if (buyerEmail && formType === 'purchase_agreement') {
    const { subject, html } = purchaseAgreementSignedEmail(offer.listingAddress, 'https://app.sirrealtor.com/chat')
    await ses.send(
      new SendEmailCommand({
        Source: 'noreply@sirrealtor.com',
        Destination: { ToAddresses: [buyerEmail] },
        Message: { Subject: { Data: subject }, Body: { Html: { Data: html } } },
      }),
    ).catch((err: unknown) => console.error('SES notification failed', err))
  }

  console.log('Dropbox Sign webhook: processed', { userId, offerId, formType })
  return 'Hello API Event Received'
}
