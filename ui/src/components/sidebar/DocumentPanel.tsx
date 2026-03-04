import { useRef } from 'react'
import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material'
import NiArrowOutUp from '@/icons/nexture/ni-arrow-out-up'
import NiShare from '@/icons/nexture/ni-share'
import { documents as documentsApi } from '@/services/api'
import { useDocumentUpload } from '@/hooks/useDocumentUpload'
import type { UserDocument } from '@/hooks/useDocuments'
import NameMismatchDialog from '@/components/documents/NameMismatchDialog'

interface DocumentPanelProps {
  documentList: UserDocument[]
}

function formatPreApprovalSummary(extractedData: Record<string, unknown>): string {
  const parts: string[] = []

  const amount = extractedData['approvedAmount']
  if (typeof amount === 'number' && amount > 0) {
    const k = Math.round(amount / 1000)
    parts.push(`Up to $${k}k`)
  }

  const expDate = extractedData['expirationDate']
  if (typeof expDate === 'string' && expDate) {
    const d = new Date(expDate)
    if (!isNaN(d.getTime())) {
      parts.push(`Exp. ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`)
    }
  }

  return parts.join(' · ')
}

export default function DocumentPanel({ documentList }: DocumentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { upload, isUploading, nameMismatch, clearNameMismatch, updateProfileName } = useDocumentUpload()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await upload(file)
  }

  const handleDownload = async (doc: UserDocument) => {
    try {
      const { downloadUrl } = await documentsApi.getDownloadUrl(doc.documentId)
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch {
      // silently ignore
    }
  }

  return (
    <Box className="flex flex-col gap-1">
      <NameMismatchDialog
        nameMismatch={nameMismatch}
        onUpdate={updateProfileName}
        onDismiss={clearNameMismatch}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      <Box className="ms-7 flex items-center justify-between">
        <Typography variant="caption" className="text-text-secondary italic">
          {documentList.length === 0 ? 'No documents yet' : `${documentList.length} document${documentList.length === 1 ? '' : 's'}`}
        </Typography>
        <Tooltip title="Upload document" arrow>
          <span>
            <IconButton
              size="small"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className={isUploading ? 'animate-pulse' : ''}
            >
              <NiArrowOutUp size="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {documentList.length === 0 ? (
        <Typography variant="caption" className="text-text-secondary ms-7 px-2.5 italic">
          Upload one from here or the chat bar
        </Typography>
      ) : (
        documentList.map((doc) => (
          <Box
            key={doc.documentId}
            className="ms-7 flex items-start justify-between gap-2 rounded-lg border border-grey-100 bg-background px-3 py-2"
          >
            <Box className="min-w-0 flex-1">
              <Tooltip title={doc.fileName} arrow>
                <Typography
                  variant="body2"
                  className="text-text-primary truncate font-medium"
                >
                  {doc.fileName}
                </Typography>
              </Tooltip>
              {doc.documentType === 'pre_approval_letter' && (
                <Box className="mt-1 flex flex-wrap items-center gap-1">
                  <Chip
                    label="Pre-Approval"
                    size="small"
                    sx={{ bgcolor: 'success.light', color: 'success.contrastText', fontWeight: 600, fontSize: '0.7rem', height: 20 }}
                  />
                  {doc.extractedData && (
                    <Typography variant="caption" className="text-text-secondary">
                      {formatPreApprovalSummary(doc.extractedData)}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
            <Tooltip title="Download" arrow>
              <IconButton size="small" onClick={() => handleDownload(doc)}>
                <NiShare size="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))
      )}
    </Box>
  )
}
