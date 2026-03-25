import { useState, useCallback } from 'react'
import { api } from '@/services/api'

export interface ClosingDeadlines {
  inspectionObjectionDeadline?: string
  inspectionResolutionDeadline?: string
  titleObjectionDeadline?: string
  appraisalDeadline?: string
  appraisalObjectionDeadline?: string
  appraisalResolutionDeadline?: string
  loanConditionsDeadline?: string
  newLoanAvailabilityDeadline?: string
  closingDate?: string
}

export interface Closing {
  userId: string
  closingId: string
  offerId: string
  listingId: string
  listingAddress: string
  propertyState: string
  financingType: 'cash' | 'financed'
  hasHoa: boolean
  deadlines: ClosingDeadlines
  /** milestoneId → ISO timestamp when completed */
  milestones: Record<string, string>
  titleCompany?: string
  titleContactEmail?: string
  escrowNumber?: string
  notes?: string
  documents?: Record<string, string>
  signingRequests?: Record<string, string>
  signedForms?: Record<string, string>
  createdAt: string
  updatedAt: string
}

interface ClosingsResponse {
  closings: Closing[]
}

export function useClosings() {
  const [closings, setClosings] = useState<Closing[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<ClosingsResponse>('/closings')
      setClosings(data.closings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load closings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { closings, isLoading, error, refetch: fetch }
}
