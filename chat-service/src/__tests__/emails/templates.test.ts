import { describe, test, expect } from 'vitest'
import {
  viewingRequestToAgentEmail,
  viewingConfirmationToBuyerEmail,
  offerSubmittedToAgentEmail,
  offerSubmittedToBuyerEmail,
  closingDeadlineReminderEmail,
} from '../../email-templates'
import { STATE_FIXTURES } from '../fixtures/states'
import type { Viewing } from '../../types'

const TEST_VIEWING_ID = 'viewing-test-abc123'
const CHAT_URL = 'https://app.sirrealtor.com/chat'

const AVAILABILITY_WINDOWS = [
  { start: '2026-04-05T17:00:00.000Z', end: '2026-04-05T19:00:00.000Z' },
  { start: '2026-04-06T14:00:00.000Z', end: '2026-04-06T17:00:00.000Z' },
]

function makeViewing(state: (typeof STATE_FIXTURES)[number]): Viewing {
  return {
    userId: 'test-user-001',
    viewingId: TEST_VIEWING_ID,
    listingId: `listing-${state.code.toLowerCase()}-001`,
    profileId: 'profile-001',
    listingAddress: state.listingAddress,
    agentEmail: state.agentEmail,
    agentName: state.agentName,
    requestedAt: '2026-04-01T00:00:00.000Z',
    availabilitySlots: AVAILABILITY_WINDOWS.map((w) => w.start),
    status: 'requested',
  }
}

// ── viewingRequestToAgentEmail ───────────────────────────────────────────────

describe('viewingRequestToAgentEmail', () => {
  test.each(STATE_FIXTURES)('[$code] subject contains listing address', (state) => {
    const { subject } = viewingRequestToAgentEmail(
      makeViewing(state),
      'buyer@example.com',
      'Alex Buyer',
      AVAILABILITY_WINDOWS,
    )
    expect(subject).toBe(`Viewing Request: ${state.listingAddress}`)
  })

  test.each(STATE_FIXTURES)(
    '[$code] body has one confirmation link per availability slot',
    (state) => {
      const { html } = viewingRequestToAgentEmail(
        makeViewing(state),
        'buyer@example.com',
        'Alex Buyer',
        AVAILABILITY_WINDOWS,
      )
      // One clickable slot link per window
      expect(html).toContain(`slot=0`)
      expect(html).toContain(`slot=1`)
      // "None of these times work" link
      expect(html).toContain('slot=none')
      // viewingId embedded in links
      expect(html).toContain(encodeURIComponent(TEST_VIEWING_ID))
    },
  )

  test.each(STATE_FIXTURES)('[$code] body contains buyer name and email', (state) => {
    const { html } = viewingRequestToAgentEmail(
      makeViewing(state),
      'buyer@example.com',
      'Alex Buyer',
      AVAILABILITY_WINDOWS,
    )
    expect(html).toContain('Alex Buyer')
    expect(html).toContain('buyer@example.com')
  })
})

// ── viewingConfirmationToBuyerEmail ──────────────────────────────────────────

describe('viewingConfirmationToBuyerEmail', () => {
  test.each(STATE_FIXTURES)('[$code] subject and body contain listing address', (state) => {
    const { subject, html } = viewingConfirmationToBuyerEmail(makeViewing(state), CHAT_URL)
    expect(subject).toContain(state.listingAddress)
    expect(html).toContain(state.listingAddress)
  })

  test.each(STATE_FIXTURES)('[$code] body contains link back to chat', (state) => {
    const { html } = viewingConfirmationToBuyerEmail(makeViewing(state), CHAT_URL)
    expect(html).toContain(CHAT_URL)
  })
})

// ── offerSubmittedToAgentEmail ───────────────────────────────────────────────

describe('offerSubmittedToAgentEmail', () => {
  test.each(STATE_FIXTURES)('[$code] subject is "Offer Received: {address}"', (state) => {
    const { subject } = offerSubmittedToAgentEmail(
      state.listingAddress,
      'Alex Buyer',
      state.agentName,
      state.offerPrice,
      state.closingDate,
      'https://bucket.s3.amazonaws.com/doc.pdf',
      'https://app.sirrealtor.com/seller-response?token=abc',
    )
    expect(subject).toBe(`Offer Received: ${state.listingAddress}`)
  })

  test.each(STATE_FIXTURES)('[$code] body contains offer price formatted with commas', (state) => {
    const { html } = offerSubmittedToAgentEmail(
      state.listingAddress,
      'Alex Buyer',
      state.agentName,
      state.offerPrice,
      state.closingDate,
      undefined,
      'https://app.sirrealtor.com/seller-response?token=abc',
    )
    expect(html).toContain(`$${state.offerPrice.toLocaleString()}`)
  })

  test.each(STATE_FIXTURES)('[$code] body contains buyer name and seller response link', (state) => {
    const sellerResponseUrl = `https://app.sirrealtor.com/seller-response?token=test-token`
    const { html } = offerSubmittedToAgentEmail(
      state.listingAddress,
      'Alex Buyer',
      state.agentName,
      state.offerPrice,
      state.closingDate,
      undefined,
      sellerResponseUrl,
    )
    expect(html).toContain('Alex Buyer')
    expect(html).toContain(sellerResponseUrl)
  })

  test('body omits download button when no presigned URL provided', () => {
    const { html } = offerSubmittedToAgentEmail(
      '123 Main St',
      'Alex Buyer',
      'Agent Name',
      500_000,
      '2026-05-01',
      undefined,
      'https://app.sirrealtor.com/seller-response?token=x',
    )
    expect(html).not.toContain('Download Purchase Agreement')
  })

  test('body includes download button when presigned URL is provided', () => {
    const { html } = offerSubmittedToAgentEmail(
      '123 Main St',
      'Alex Buyer',
      'Agent Name',
      500_000,
      '2026-05-01',
      'https://bucket.s3.amazonaws.com/pa.pdf',
      'https://app.sirrealtor.com/seller-response?token=x',
    )
    expect(html).toContain('Download Purchase Agreement')
    expect(html).toContain('https://bucket.s3.amazonaws.com/pa.pdf')
  })
})

// ── offerSubmittedToBuyerEmail ───────────────────────────────────────────────

describe('offerSubmittedToBuyerEmail', () => {
  test.each(STATE_FIXTURES)('[$code] subject and body contain listing address', (state) => {
    const { subject, html } = offerSubmittedToBuyerEmail(
      state.listingAddress,
      state.agentName,
      CHAT_URL,
    )
    expect(subject).toContain(state.listingAddress)
    expect(html).toContain(state.listingAddress)
  })

  test.each(STATE_FIXTURES)('[$code] body mentions agent name', (state) => {
    const { html } = offerSubmittedToBuyerEmail(state.listingAddress, state.agentName, CHAT_URL)
    expect(html).toContain(state.agentName)
  })
})

// ── closingDeadlineReminderEmail ─────────────────────────────────────────────

describe('closingDeadlineReminderEmail', () => {
  const REMINDER_CASES: Array<[string, number, string]> = [
    ['CO — Inspection Objection', 7, '2026-04-11'],
    ['TX — Option Period', 3, '2026-04-08'],
    ['AZ — Inspection Period', 1, '2026-04-11'],
    ['NV — Due Diligence', 7, '2026-04-11'],
  ]

  test.each(REMINDER_CASES)(
    '%s: %d-day reminder subject contains deadline label',
    (label, days, dateStr) => {
      const { subject, html } = closingDeadlineReminderEmail(
        '123 Test St',
        label.split('—')[1].trim(),
        days,
        new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        'Complete the required action.',
      )
      expect(subject).toContain(`${days} day`)
      expect(html).toContain('123 Test St')
      expect(html).toContain('Complete the required action.')
    },
  )
})
