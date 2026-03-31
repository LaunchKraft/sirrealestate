import type { UserProfile } from '../../types'

export const TEST_USER_ID = 'test-user-001'
export const TEST_USER_EMAIL = 'alex.buyer@example.com'

export const mockUserProfile: UserProfile = {
  userId: TEST_USER_ID,
  email: TEST_USER_EMAIL,
  firstName: 'Alex',
  lastName: 'Buyer',
  phone: '555-0100',
  buyerStatus: 'actively_looking',
  preApproved: true,
  preApprovalAmount: 700_000,
  searchProfiles: [],
  availability: [
    {
      windowId: 'avail-w1',
      start: '2026-04-05T17:00:00.000Z',
      end: '2026-04-05T19:00:00.000Z',
    },
    {
      windowId: 'avail-w2',
      start: '2026-04-06T14:00:00.000Z',
      end: '2026-04-06T17:00:00.000Z',
    },
  ],
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
}
