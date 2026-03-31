import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import * as createOfferDraft from '../../tools/create-offer-draft'
import * as submitOffer from '../../tools/submit-offer'
import { TEST_USER_ID, TEST_USER_EMAIL, mockUserProfile } from '../fixtures/users'
import { STATE_FIXTURES } from '../fixtures/states'
import { makeReadyOffer } from '../fixtures/offers'
import type { Offer } from '../../types'

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://test-bucket.s3.amazonaws.com/signed-doc.pdf'),
}))

const ddbMock = mockClient(DynamoDBClient)
const sesMock = mockClient(SESClient)

beforeEach(() => {
  ddbMock.reset()
  sesMock.reset()
  ddbMock.on(PutItemCommand).resolves({})
  sesMock.on(SendEmailCommand).resolves({} as never)
})

describe('journey: viewing → offer', () => {
  test.each(STATE_FIXTURES)(
    '[$code] create_offer_draft creates offer with correct state and buyer info',
    async (state) => {
      ddbMock
        .on(GetItemCommand, { TableName: process.env.USER_PROFILE_TABLE })
        .resolves({ Item: marshall(mockUserProfile) })

      const result = await createOfferDraft.execute(
        TEST_USER_ID,
        {
          listingId: `listing-${state.code.toLowerCase()}-001`,
          listingAddress: state.listingAddress,
          propertyState: state.code,
          agentEmail: state.agentEmail,
          agentName: state.agentName,
        },
        TEST_USER_EMAIL,
      )

      expect(result.offerId).toBeTruthy()
      expect(result.message).toContain(state.listingAddress)

      const putCalls = ddbMock.commandCalls(PutItemCommand)
      const offerPut = putCalls.find(
        (c) => c.args[0].input.TableName === process.env.OFFERS_TABLE,
      )
      expect(offerPut).toBeDefined()

      const saved = unmarshall(offerPut!.args[0].input.Item!) as Offer
      expect(saved.status).toBe('draft')
      expect(saved.propertyState).toBe(state.code)
      expect(saved.listingAddress).toBe(state.listingAddress)
      expect(saved.agentEmail).toBe(state.agentEmail)
      expect(saved.buyers[0].email).toBe(TEST_USER_EMAIL)
      expect(saved.buyers[0].fullLegalName).toBe('Alex Buyer')
      expect(saved.buyers[0].isPrimaryBuyer).toBe(true)
      expect(saved.sellerResponseToken).toBeTruthy()
    },
  )

  test.each(STATE_FIXTURES)(
    '[$code] submit_offer sends emails and marks offer submitted',
    async (state) => {
      const readyOffer = makeReadyOffer(state)

      ddbMock
        .on(GetItemCommand, { TableName: process.env.OFFERS_TABLE })
        .resolves({ Item: marshall(readyOffer) })

      const result = await submitOffer.execute(TEST_USER_ID, { offerId: readyOffer.offerId }, TEST_USER_EMAIL)

      expect(result.message).toMatch(/submitted successfully/i)

      // ── Offer status updated ──────────────────────────────────────────────
      const putCalls = ddbMock.commandCalls(PutItemCommand)
      const offerPut = putCalls.find(
        (c) => c.args[0].input.TableName === process.env.OFFERS_TABLE,
      )
      expect(offerPut).toBeDefined()
      const updatedOffer = unmarshall(offerPut!.args[0].input.Item!) as Offer
      expect(updatedOffer.status).toBe('submitted')
      expect(updatedOffer.submittedAt).toBeTruthy()

      // ── Emails ────────────────────────────────────────────────────────────
      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(2)

      // Agent email
      const agentCall = emailCalls.find((c) =>
        c.args[0].input.Destination?.ToAddresses?.includes(state.agentEmail),
      )
      expect(agentCall).toBeDefined()
      const agentSubject = agentCall!.args[0].input.Message!.Subject!.Data!
      const agentBody = agentCall!.args[0].input.Message!.Body!.Html!.Data!
      expect(agentSubject).toBe(`Offer Received: ${state.listingAddress}`)
      expect(agentBody).toContain(`$${state.offerPrice.toLocaleString()}`)
      expect(agentBody).toContain('Alex Buyer')
      expect(agentBody).toContain('signed-doc.pdf')   // presigned URL in download button
      expect(agentBody).toContain('seller-response')  // seller response link

      // Buyer confirmation email
      const buyerCall = emailCalls.find((c) =>
        c.args[0].input.Destination?.ToAddresses?.includes(TEST_USER_EMAIL),
      )
      expect(buyerCall).toBeDefined()
      const buyerSubject = buyerCall!.args[0].input.Message!.Subject!.Data!
      expect(buyerSubject).toContain(state.listingAddress)
    },
  )

  test.each(STATE_FIXTURES)(
    '[$code] submit_offer rejects when purchase agreement is not signed',
    async (state) => {
      const unsignedOffer = { ...makeReadyOffer(state), signedForms: {} }

      ddbMock
        .on(GetItemCommand, { TableName: process.env.OFFERS_TABLE })
        .resolves({ Item: marshall(unsignedOffer) })

      const result = await submitOffer.execute(TEST_USER_ID, { offerId: unsignedOffer.offerId }, TEST_USER_EMAIL)

      expect(result.message).toMatch(/not been fully signed/i)
      expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0)
      expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0)
    },
  )

  test.each(STATE_FIXTURES)(
    '[$code] submit_offer rejects when offer status is not ready',
    async (state) => {
      const draftOffer = { ...makeReadyOffer(state), status: 'draft' as const }

      ddbMock
        .on(GetItemCommand, { TableName: process.env.OFFERS_TABLE })
        .resolves({ Item: marshall(draftOffer) })

      const result = await submitOffer.execute(TEST_USER_ID, { offerId: draftOffer.offerId }, TEST_USER_EMAIL)

      expect(result.message).toMatch(/status is "draft"/i)
      expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0)
    },
  )
})
