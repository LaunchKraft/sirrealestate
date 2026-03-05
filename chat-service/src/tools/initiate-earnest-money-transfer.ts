/**
 * Chat tool: initiate_earnest_money_transfer
 *
 * STATUS: Not registered in handler.ts — pending Earnnest API access.
 * To activate: add to TOOLS array and executeTool switch in handler.ts.
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { Offer } from '../types'
import { EarnnestProvider } from '../integrations/earnnest'

const dynamo = new DynamoDBClient({})
const earnnest = new EarnnestProvider()

export const definition = {
  name: 'initiate_earnest_money_transfer',
  description:
    'Send the buyer a payment link via Earnnest to submit their earnest money deposit digitally. ' +
    'Call this after the earnest money agreement has been signed. The buyer will receive an email ' +
    'from Earnnest with a secure link to complete the ACH bank transfer.',
  input_schema: {
    type: 'object',
    properties: {
      offerId: {
        type: 'string',
        description: 'The offer ID to initiate the earnest money transfer for.',
      },
      depositDueDate: {
        type: 'string',
        description: 'ISO 8601 date (YYYY-MM-DD) by which payment must be completed.',
      },
      escrowHolderName: {
        type: 'string',
        description: 'Name of the escrow/title company receiving the funds.',
      },
    },
    required: ['offerId'],
  },
}

export async function execute(
  userId: string,
  input: { offerId: string; depositDueDate?: string; escrowHolderName?: string },
): Promise<{ paymentId?: string; paymentUrl?: string; message: string }> {
  // Fetch offer
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Key: marshall({ userId, offerId: input.offerId }),
    }),
  )
  if (!result.Item) return { message: `Offer ${input.offerId} not found.` }
  const offer = unmarshall(result.Item) as Offer

  // Validate required fields
  const primaryBuyer = offer.buyers?.find((b) => b.isPrimaryBuyer) ?? offer.buyers?.[0]
  const missing: string[] = []
  if (!primaryBuyer)                    missing.push('buyer information')
  if (!offer.terms?.earnestMoneyAmount) missing.push('earnest money amount')
  if (missing.length) {
    return { message: `Cannot initiate earnest money transfer. Missing: ${missing.join(', ')}.` }
  }

  const { paymentId, paymentUrl } = await earnnest.createPaymentRequest({
    propertyAddress: offer.listingAddress,
    buyerName: primaryBuyer!.fullLegalName,
    buyerEmail: primaryBuyer!.email,
    amount: offer.terms!.earnestMoneyAmount!,
    escrowHolderName: input.escrowHolderName,
    depositDueDate: input.depositDueDate,
    referenceId: offer.offerId,
  })

  // Store Earnnest payment ID on offer
  const now = new Date().toISOString()
  const updatedOffer: Offer = {
    ...offer,
    earnestMoneyPaymentId: paymentId,
    updatedAt: now,
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Item: marshall(updatedOffer, { removeUndefinedValues: true }),
    }),
  )

  return {
    paymentId,
    paymentUrl,
    message:
      `Earnest money transfer initiated. ${primaryBuyer!.fullLegalName} (${primaryBuyer!.email}) ` +
      `will receive a payment link from Earnnest to submit the $${offer.terms!.earnestMoneyAmount!.toLocaleString()} deposit. ` +
      `Payment link: ${paymentUrl}`,
  }
}
