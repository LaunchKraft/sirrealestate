import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { Offer } from '../types'
import { offerSubmittedToAgentEmail, offerSubmittedToBuyerEmail } from '../email-templates'

const dynamo = new DynamoDBClient({})
const ses = new SESClient({})
const s3 = new S3Client({})

export const definition = {
  name: 'submit_offer',
  description:
    "Submit a completed, signed offer to the seller's agent via email. " +
    'Requires: offer status "ready", a fully signed purchase agreement ' +
    '(signedForms.purchase_agreement must be set), and agentEmail on the offer. ' +
    'Always confirm with the user before calling this tool.',
  input_schema: {
    type: 'object',
    properties: {
      offerId: {
        type: 'string',
        description: 'The offer to submit.',
      },
    },
    required: ['offerId'],
  },
}

export async function execute(
  userId: string,
  input: { offerId: string },
  userEmail: string,
): Promise<{ message: string }> {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Key: marshall({ userId, offerId: input.offerId }),
    }),
  )
  if (!result.Item) return { message: `Offer ${input.offerId} not found.` }
  const offer = unmarshall(result.Item) as Offer

  if (offer.status !== 'ready') {
    return {
      message: `Offer cannot be submitted — current status is "${offer.status}". All required fields must be complete and status must be "ready".`,
    }
  }
  if (!offer.agentEmail) {
    return {
      message:
        "Cannot submit offer — seller's agent email is missing. Call update_offer with agentEmail first.",
    }
  }
  if (!offer.signedForms?.['purchase_agreement']) {
    return {
      message:
        'Cannot submit offer — the purchase agreement has not been fully signed yet. Please wait for all signers to complete e-signature via Dropbox Sign.',
    }
  }

  const now = new Date().toISOString()

  // Generate a presigned URL for the purchase agreement PDF (7-day expiry for the agent email)
  let paDownloadUrl: string | undefined
  if (offer.purchaseAgreementDocumentId) {
    const s3Key = `${userId}/${offer.purchaseAgreementDocumentId}`
    paDownloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.DOCUMENT_BUCKET_NAME!, Key: s3Key }),
      { expiresIn: 604800 },
    ).catch(() => undefined)
  }

  const sellerResponseUrl = `https://app.sirrealtor.com/seller-response?token=${encodeURIComponent(offer.sellerResponseToken!)}`
  const chatUrl = 'https://app.sirrealtor.com/chat'

  const buyerNames = offer.buyers.map((b) => b.fullLegalName).filter(Boolean).join(', ')

  // Email the seller's agent
  const { subject: agentSubject, html: agentHtml } = offerSubmittedToAgentEmail(
    offer.listingAddress,
    buyerNames,
    offer.agentName,
    offer.terms?.offerPrice,
    offer.terms?.closingDate,
    paDownloadUrl,
    sellerResponseUrl,
  )
  const bcc = process.env.AGENT_EMAIL_BCC
  await ses.send(
    new SendEmailCommand({
      Source: 'Sir Realtor <noreply@sirrealtor.com>',
      Destination: {
        ToAddresses: [offer.agentEmail],
        ...(bcc ? { BccAddresses: [bcc] } : {}),
      },
      Message: { Subject: { Data: agentSubject }, Body: { Html: { Data: agentHtml } } },
    }),
  )

  // Update offer status to submitted
  const updatedOffer: Offer = { ...offer, status: 'submitted', submittedAt: now, updatedAt: now }
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.OFFERS_TABLE!,
      Item: marshall(updatedOffer, { removeUndefinedValues: true }),
    }),
  )

  // Notify buyer (non-critical)
  const { subject: buyerSubject, html: buyerHtml } = offerSubmittedToBuyerEmail(
    offer.listingAddress,
    offer.agentName,
    chatUrl,
  )
  await ses.send(
    new SendEmailCommand({
      Source: 'Sir Realtor <noreply@sirrealtor.com>',
      Destination: { ToAddresses: [userEmail] },
      Message: { Subject: { Data: buyerSubject }, Body: { Html: { Data: buyerHtml } } },
    }),
  ).catch(() => {})

  return {
    message: `Offer submitted successfully to ${offer.agentName ? `${offer.agentName} (${offer.agentEmail})` : offer.agentEmail}. The seller's agent has been emailed the purchase agreement and a response link. Offer status is now "submitted".`,
  }
}
