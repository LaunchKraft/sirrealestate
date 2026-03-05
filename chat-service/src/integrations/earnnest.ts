/**
 * Earnnest integration — digital earnest money transfer platform (earnest.com).
 *
 * STATUS: Stubbed. API credentials require Earnnest approval.
 * Once access is granted:
 *   1. Create secret `SirRealtor/EarnnestApiKey` in Secrets Manager
 *   2. Update EARNNEST_API_BASE_URL if the sandbox URL differs
 *   3. Confirm the exact field names against Earnnest's API docs
 *   4. Register `initiate_earnest_money_transfer` in handler.ts
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const secretsManager = new SecretsManagerClient({})
let cachedApiKey: string | null = null

const EARNNEST_API_BASE_URL = 'https://api.earnest.com/v1'

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey
  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.EARNNEST_API_KEY_SECRET_ARN! }),
  )
  cachedApiKey = SecretString!
  return cachedApiKey
}

// ─── Request / Response Types ────────────────────────────────────────────────

export interface EarnnestPaymentRequest {
  /** Full street address of the property. */
  propertyAddress: string
  /** Full legal name of the primary buyer. */
  buyerName: string
  /** Email address to deliver the payment link to. */
  buyerEmail: string
  /** Earnest money amount in dollars (no cents). */
  amount: number
  /** Name of the escrow/title company receiving the funds. */
  escrowHolderName?: string
  /** ISO 8601 date by which the payment must be completed. */
  depositDueDate?: string
  /**
   * Our internal offerId — passed as a reference ID and echoed back in
   * webhook events so we can correlate payments to offers without a lookup.
   */
  referenceId: string
}

export interface EarnnestPaymentResult {
  /** Earnnest's internal payment ID — store on the Offer for webhook correlation. */
  paymentId: string
  /** URL to share with the buyer so they can complete the ACH transfer. */
  paymentUrl: string
  status: 'pending'
}

export interface EarnnestWebhookPayload {
  event: 'payment.completed' | 'payment.failed' | 'payment.refunded'
  paymentId: string
  referenceId: string
  amount: number
  propertyAddress: string
  completedAt?: string
  failedAt?: string
  refundedAt?: string
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class EarnnestProvider {
  async createPaymentRequest(request: EarnnestPaymentRequest): Promise<EarnnestPaymentResult> {
    const apiKey = await getApiKey()

    const response = await fetch(`${EARNNEST_API_BASE_URL}/payment-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        property_address: request.propertyAddress,
        buyer_name: request.buyerName,
        buyer_email: request.buyerEmail,
        amount: request.amount,
        escrow_holder_name: request.escrowHolderName,
        due_date: request.depositDueDate,
        reference_id: request.referenceId,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Earnnest API error ${response.status}: ${body}`)
    }

    const result = await response.json() as {
      id: string
      payment_url: string
      status: string
    }
    return {
      paymentId: result.id,
      paymentUrl: result.payment_url,
      status: 'pending',
    }
  }
}
