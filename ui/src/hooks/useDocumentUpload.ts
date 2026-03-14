import { useState, useCallback } from 'react'
import { documents as documentsApi, profile as profileApi } from '@/services/api'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'
import { trackEvent } from '@/lib/analytics'

// Maps documentType → the extractedData key that holds person names (string[]).
// Mirrors the nameField in the backend taxonomy.
const NAME_FIELD_BY_TYPE: Record<string, string> = {
  pre_approval_letter: 'borrowerNames',
}

export interface NameMismatch {
  documentNames: string[]
  profileName: string
}

function namesMatch(firstName: string, lastName: string, documentNames: string[]): boolean {
  const fn = firstName.toLowerCase().trim()
  const ln = lastName.toLowerCase().trim()
  return documentNames.some((name) => {
    const words = name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
    return words.includes(fn) && words.includes(ln)
  })
}

function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const [nameMismatch, setNameMismatch] = useState<NameMismatch | null>(null)
  const { invalidateDocuments, invalidateProfile } = useSidebarRefresh()

  const upload = useCallback(async (file: File): Promise<void> => {
    setIsUploading(true)
    try {
      const { uploadUrl, documentId, s3Key } = await documentsApi.getUploadUrl(file.name, file.type)

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })

      const doc = await documentsApi.confirm({
        documentId,
        s3Key,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      })

      trackEvent('document_uploaded', {
        document_type: doc.documentType ?? 'unknown',
        file_size_kb: Math.round(file.size / 1024),
      })
      invalidateDocuments()

      // Name mismatch check for classified documents that have a name field
      const nameField = doc.documentType ? NAME_FIELD_BY_TYPE[doc.documentType] : undefined
      if (nameField && Array.isArray(doc.extractedData?.[nameField])) {
        const documentNames = doc.extractedData![nameField] as string[]
        if (documentNames.length > 0) {
          const userProfile = await profileApi.get().catch(() => null)
          if (userProfile?.firstName && userProfile?.lastName) {
            if (!namesMatch(userProfile.firstName, userProfile.lastName, documentNames)) {
              setNameMismatch({
                documentNames,
                profileName: `${userProfile.firstName} ${userProfile.lastName}`,
              })
            }
          }
        }
      }
    } finally {
      setIsUploading(false)
    }
  }, [invalidateDocuments])

  const clearNameMismatch = useCallback(() => setNameMismatch(null), [])

  const updateProfileName = useCallback(async (fullName: string): Promise<void> => {
    const { firstName, lastName } = parseFullName(fullName)
    await profileApi.patch({ firstName, lastName })
    setNameMismatch(null)
    invalidateProfile()
  }, [invalidateProfile])

  return { upload, isUploading, nameMismatch, clearNameMismatch, updateProfileName }
}
