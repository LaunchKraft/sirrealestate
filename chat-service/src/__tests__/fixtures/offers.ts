import type { Offer, OfferBuyer } from '../../types'
import type { StateFixture } from './states'
import { TEST_USER_ID, TEST_USER_EMAIL } from './users'

const PRIMARY_BUYER: OfferBuyer = {
  buyerId: 'buyer-001',
  fullLegalName: 'Alex Buyer',
  street: '100 Main St',
  city: 'Denver',
  state: 'CO',
  zipCode: '80202',
  phone: '555-0100',
  email: TEST_USER_EMAIL,
  isPrimaryBuyer: true,
}

export function makeDraftOffer(state: StateFixture, offerId = `offer-${state.code.toLowerCase()}-001`): Offer {
  return {
    userId: TEST_USER_ID,
    offerId,
    listingId: `listing-${state.code.toLowerCase()}-001`,
    listingAddress: state.listingAddress,
    agentEmail: state.agentEmail,
    agentName: state.agentName,
    status: 'draft',
    propertyState: state.code,
    buyers: [PRIMARY_BUYER],
    terms: {
      offerPrice: state.offerPrice,
      earnestMoneyAmount: state.earnestMoney,
      closingDate: state.closingDate,
      contingencies: state.contingencies,
      ...(state.optionFee !== undefined ? { optionFee: state.optionFee } : {}),
      ...(state.optionPeriodDays !== undefined ? { optionPeriodDays: state.optionPeriodDays } : {}),
    },
    sellerResponseToken: 'test-seller-response-token',
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  }
}

/** An offer that has been marked ready and has a signed purchase agreement. */
export function makeReadyOffer(state: StateFixture, offerId = `offer-${state.code.toLowerCase()}-001`): Offer {
  return {
    ...makeDraftOffer(state, offerId),
    status: 'ready',
    purchaseAgreementDocumentId: 'doc-pa-001',
    signedForms: {
      purchase_agreement: '2026-03-31T12:00:00.000Z',
    },
  }
}
