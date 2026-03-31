import type { Listing, SearchResult } from '../../types'
import type { StateFixture } from './states'

export function makeListing(state: StateFixture): Listing {
  return {
    listingId: `listing-${state.code.toLowerCase()}-001`,
    address: state.listingAddress,
    price: state.offerPrice,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1_800,
    agentEmail: state.agentEmail,
    agentName: state.agentName,
    rawData: {},
  }
}

export function makeSearchResult(
  userId: string,
  state: StateFixture,
  profileId = 'profile-001',
): SearchResult {
  const listing = makeListing(state)
  return {
    userId,
    profileIdListingId: `${profileId}#${listing.listingId}`,
    profileId,
    listingId: listing.listingId,
    listingData: listing,
    matchedAt: '2026-03-30T00:00:00.000Z',
    notified: true,
  }
}
