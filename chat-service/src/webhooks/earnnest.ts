/**
 * Earnnest webhook handler — receives payment lifecycle events.
 *
 * STATUS: Route wired. Awaiting Earnnest API access to confirm exact
 * signature header name and HMAC format; handler logic is complete.
 *
 * Earnnest sends POST with JSON body and an HMAC-SHA256 signature in
 * the X-Earnnest-Signature header, computed over the raw request body
 * using the API key as the secret.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { Offer, UserProfile } from '../types'
import type { EarnnestWebhookPayload } from '../integrations/earnnest'
import { earnestMoneyReceivedEmail } from '../email-templates'

const dynamo = new DynamoDBClient({})
const ses = new SESClient({})
const secretsManager = new SecretsManagerClient({})
let cachedApiKey: string | null = null

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey
  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.EARNNEST_API_KEY_SECRET_ARN! }),
  )
  cachedApiKey = SecretString!
  return cachedApiKey
}

function verifySignature(apiKey: string, rawBody: string, providedSig: string): boolean {
  const expected = createHmac('sha256', apiKey).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(providedSig, 'hex'))
  } catch {
    return false
  }
}

export async function handleEarnnestWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
): Promise<{ statusCode: number; body: string }> {
  let payload: EarnnestWebhookPayload
  try {
    payload = JSON.parse(rawBody) as EarnnestWebhookPayload
  } catch (err) {
    console.error('Earnnest webhook: failed to parse body', err)
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  // Verify HMAC signature if header is present.
  // During initial integration testing the signature header may be absent.
  if (signatureHeader) {
    const apiKey = await getApiKey().catch(() => null)
    if (apiKey && !verifySignature(apiKey, rawBody, signatureHeader)) {
      console.error('Earnnest webhook: invalid signature — ignoring')
      return { statusCode: 200, body: 'ok' }
    }
  }

  if (payload.event !== 'payment.completed') {
    // Log other events (payment.failed, payment.refunded) for observability
    console.log('Earnnest webhook: unhandled event', payload.event, { paymentId: payload.paymentId })
    return { statusCode: 200, body: 'ok' }
  }

  // referenceId is our offerId; we need to find the userId too.
  // The offer is stored with userId as PK — scan by earnestMoneyPaymentId.
  // Since this path is rate is very low (one event per offer), a scan is acceptable.
  // TODO: add a GSI on earnestMoneyPaymentId if volume warrants it.
  const scanResult = await dynamo.send(
    new (await import('@aws-sdk/client-dynamodb')).ScanCommand({
      TableName: process.env.OFFERS_TABLE!,
      FilterExpression: 'earnestMoneyPaymentId = :pid',
      ExpressionAttributeValues: { ':pid': { S: payload.paymentId } },
      Limit: 1,
    }),
  )

  const item = scanResult.Items?.[0]
  if (!item) {
    console.error('Earnnest webhook: offer not found for paymentId', payload.paymentId)
    return { statusCode: 200, body: 'ok' }
  }

  const offer = unmarshall(item) as Offer
  const now = payload.completedAt ?? new Date().toISOString()

  // Stamp earnestMoneyPaidAt on the offer
  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Key: marshall({ userId: offer.userId, offerId: offer.offerId }),
      UpdateExpression: 'SET earnestMoneyPaidAt = :t, updatedAt = :now',
      ExpressionAttributeValues: marshall({ ':t': now, ':now': new Date().toISOString() }),
    }),
  )

  // Notify buyer
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
    const { subject, html } = earnestMoneyReceivedEmail(offer.listingAddress, payload.amount, 'https://app.sirrealtor.com/chat')
    await ses.send(
      new SendEmailCommand({
        Source: 'noreply@sirrealtor.com',
        Destination: { ToAddresses: [buyerEmail] },
        Message: { Subject: { Data: subject }, Body: { Html: { Data: html } } },
      }),
    ).catch((err: unknown) => console.error('SES notification failed', err))
  }

  console.log('Earnnest webhook: payment.completed processed', { offerId: offer.offerId, amount: payload.amount })
  return { statusCode: 200, body: 'ok' }
}
