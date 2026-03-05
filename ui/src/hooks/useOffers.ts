import { useState, useCallback } from 'react'
import { api } from '@/services/api'

export type OfferStatus =
  | 'draft'
  | 'ready'
  | 'submitted'
  | 'accepted'
  | 'countered'
  | 'rejected'
  | 'withdrawn'

export interface Offer {
  userId: string
  offerId: string
  listingId: string
  listingAddress: string
  status: OfferStatus
  propertyState: string
  terms?: {
    offerPrice?: number
    earnestMoneyAmount?: number
    closingDate?: string
    possessionDate?: string
  }
  purchaseAgreementDocumentId?: string
  earnestMoneyAgreementDocumentId?: string
  agencyDisclosureDocumentId?: string
  signedForms?: Record<string, string>
  earnestMoneyPaidAt?: string
  createdAt: string
  updatedAt: string
}

interface OffersResponse {
  offers: Offer[]
}

export function useOffers() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<OffersResponse>('/offers')
      setOffers(data.offers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load offers')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { offers, isLoading, error, refetch: fetch }
}
