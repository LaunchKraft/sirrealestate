import { describe, test, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import * as upsertSearchProfile from '../../tools/upsert-search-profile'
import * as updateAvailability from '../../tools/update-availability'
import * as scheduleViewing from '../../tools/schedule-viewing'
import { TEST_USER_ID, TEST_USER_EMAIL, mockUserProfile } from '../fixtures/users'
import { makeSearchResult } from '../fixtures/listings'
import { STATE_FIXTURES } from '../fixtures/states'
import type { UserProfile } from '../../types'

const ddbMock = mockClient(DynamoDBClient)
const sesMock = mockClient(SESClient)
const lambdaMock = mockClient(LambdaClient)

beforeEach(() => {
  ddbMock.reset()
  sesMock.reset()
  lambdaMock.reset()
  ddbMock.on(PutItemCommand).resolves({})
  ddbMock.on(UpdateItemCommand).resolves({})
  sesMock.on(SendEmailCommand).resolves({} as never)
  lambdaMock.on(InvokeCommand).resolves({} as never)
})

describe('journey: search → viewing', () => {
  test.each(STATE_FIXTURES)(
    '[$code] upsert_search_profile creates profile with correct state criteria',
    async (state) => {
      ddbMock
        .on(GetItemCommand, { TableName: process.env.USER_PROFILE_TABLE })
        .resolves({ Item: undefined })

      const result = await upsertSearchProfile.execute(
        TEST_USER_ID,
        {
          name: `${state.name} Home Search`,
          criteria: { state: state.code, maxPrice: state.offerPrice, bedrooms: 3 },
          monitoring: false,
        },
        TEST_USER_EMAIL,
      )

      expect(result.profileId).toBeTruthy()
      expect(result.message).toMatch(/created/i)

      const putCalls = ddbMock.commandCalls(PutItemCommand)
      const profilePut = putCalls.find(
        (c) => c.args[0].input.TableName === process.env.USER_PROFILE_TABLE,
      )
      expect(profilePut).toBeDefined()
      const saved = unmarshall(profilePut!.args[0].input.Item!) as UserProfile
      expect(saved.email).toBe(TEST_USER_EMAIL)
      expect(saved.searchProfiles).toHaveLength(1)
      expect(saved.searchProfiles[0].criteria.state).toBe(state.code)
      expect(saved.searchProfiles[0].criteria.maxPrice).toBe(state.offerPrice)
      expect(saved.searchProfiles[0].monitoring).toBe(false)
    },
  )

  test.each(STATE_FIXTURES)(
    '[$code] update_availability saves windows to user profile',
    async (_state) => {
      const windows = [
        { start: '2026-04-05T17:00:00.000Z', end: '2026-04-05T19:00:00.000Z' },
        { start: '2026-04-06T14:00:00.000Z', end: '2026-04-06T17:00:00.000Z' },
      ]

      const result = await updateAvailability.execute(TEST_USER_ID, { windows })

      expect(result.ok).toBe(true)
      expect(result.windowCount).toBe(2)

      const updateCalls = ddbMock.commandCalls(UpdateItemCommand)
      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0].args[0].input.Key).toMatchObject({ userId: { S: TEST_USER_ID } })
    },
  )

  test.each(STATE_FIXTURES)(
    '[$code] schedule_viewing creates viewing record and sends agent + buyer emails',
    async (state) => {
      const profileId = 'profile-001'
      const searchResult = makeSearchResult(TEST_USER_ID, state, profileId)
      const listing = searchResult.listingData

      ddbMock
        .on(GetItemCommand, { TableName: process.env.SEARCH_RESULTS_TABLE })
        .resolves({ Item: marshall(searchResult) })
        .on(GetItemCommand, { TableName: process.env.USER_PROFILE_TABLE })
        .resolves({ Item: marshall(mockUserProfile) })

      const result = await scheduleViewing.execute(
        TEST_USER_ID,
        { listingId: listing.listingId, profileId },
        TEST_USER_EMAIL,
      )

      // Should succeed (not return error)
      expect('error' in result).toBe(false)
      if ('error' in result) return
      expect(result.viewingId).toBeTruthy()

      // ── Viewing record ────────────────────────────────────────────────────
      const putCalls = ddbMock.commandCalls(PutItemCommand)
      const viewingPut = putCalls.find(
        (c) => c.args[0].input.TableName === process.env.VIEWINGS_TABLE,
      )
      expect(viewingPut).toBeDefined()

      const savedViewing = unmarshall(viewingPut!.args[0].input.Item!)
      expect(savedViewing['viewingId']).toBe(result.viewingId)
      expect(savedViewing['userId']).toBe(TEST_USER_ID)
      expect(savedViewing['listingAddress']).toBe(state.listingAddress)
      expect(savedViewing['status']).toBe('requested')
      expect((savedViewing['availabilitySlots'] as string[])).toHaveLength(2)

      // ── Emails ───────────────────────────────────────────────────────────
      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(2)

      // Agent email
      const agentCall = emailCalls.find((c) =>
        c.args[0].input.Destination?.ToAddresses?.includes(state.agentEmail),
      )
      expect(agentCall).toBeDefined()
      const agentSubject = agentCall!.args[0].input.Message!.Subject!.Data!
      const agentBody = agentCall!.args[0].input.Message!.Body!.Html!.Data!
      expect(agentSubject).toContain(state.listingAddress)
      expect(agentBody).toContain('viewing-response')   // confirmation URL
      expect(agentBody).toContain(result.viewingId)     // viewingId in slot URL
      expect(agentBody).toContain('Alex Buyer')         // buyer name from profile

      // Buyer confirmation email
      const buyerCall = emailCalls.find((c) =>
        c.args[0].input.Destination?.ToAddresses?.includes(TEST_USER_EMAIL),
      )
      expect(buyerCall).toBeDefined()
      const buyerSubject = buyerCall!.args[0].input.Message!.Subject!.Data!
      const buyerBody = buyerCall!.args[0].input.Message!.Body!.Html!.Data!
      expect(buyerSubject).toContain(state.listingAddress)
      expect(buyerBody).toContain(state.listingAddress)
    },
  )

  test.each(STATE_FIXTURES)(
    '[$code] schedule_viewing returns error when user has no availability',
    async (state) => {
      const profileId = 'profile-001'
      const searchResult = makeSearchResult(TEST_USER_ID, state, profileId)
      const profileWithNoAvailability = { ...mockUserProfile, availability: [] }

      ddbMock
        .on(GetItemCommand, { TableName: process.env.SEARCH_RESULTS_TABLE })
        .resolves({ Item: marshall(searchResult) })
        .on(GetItemCommand, { TableName: process.env.USER_PROFILE_TABLE })
        .resolves({ Item: marshall(profileWithNoAvailability) })

      const result = await scheduleViewing.execute(
        TEST_USER_ID,
        { listingId: searchResult.listingData.listingId, profileId },
        TEST_USER_EMAIL,
      )

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toMatch(/no.*availability/i)
      }
      expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0)
    },
  )

  test.each(STATE_FIXTURES)(
    '[$code] schedule_viewing accepts inline availabilityWindows (skips profile fetch)',
    async (state) => {
      const profileId = 'profile-001'
      const searchResult = makeSearchResult(TEST_USER_ID, state, profileId)
      const inlineWindows = [
        { start: '2026-04-07T10:00:00.000Z', end: '2026-04-07T12:00:00.000Z' },
      ]

      ddbMock
        .on(GetItemCommand, { TableName: process.env.SEARCH_RESULTS_TABLE })
        .resolves({ Item: marshall(searchResult) })
      // NOTE: USER_PROFILE_TABLE is intentionally not mocked — should not be called

      const result = await scheduleViewing.execute(
        TEST_USER_ID,
        { listingId: searchResult.listingData.listingId, profileId, availabilityWindows: inlineWindows },
        TEST_USER_EMAIL,
      )

      expect('error' in result).toBe(false)
      if ('error' in result) return

      // Only one GetItemCommand call — for the search result, not the profile
      const getCalls = ddbMock.commandCalls(GetItemCommand)
      expect(getCalls).toHaveLength(1)
      expect(getCalls[0].args[0].input.TableName).toBe(process.env.SEARCH_RESULTS_TABLE)

      // Slot saved from inline windows, not profile
      const viewingPut = ddbMock
        .commandCalls(PutItemCommand)
        .find((c) => c.args[0].input.TableName === process.env.VIEWINGS_TABLE)
      const savedViewing = unmarshall(viewingPut!.args[0].input.Item!)
      expect((savedViewing['availabilitySlots'] as string[])).toHaveLength(1)
    },
  )
})
