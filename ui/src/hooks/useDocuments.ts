import { useState, useCallback } from 'react'
import { api } from '@/services/api'

export interface UserDocument {
  userId: string
  documentId: string
  fileName: string
  contentType: string
  sizeBytes: number
  s3Key: string
  uploadedAt: string
  documentType?: string
  extractedData?: Record<string, unknown>
}

interface DocumentsResponse {
  documents: UserDocument[]
}

export function useDocuments() {
  const [documents, setDocuments] = useState<UserDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<DocumentsResponse>('/documents')
      setDocuments(data.documents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { documents, isLoading, error, refetch: fetch }
}
