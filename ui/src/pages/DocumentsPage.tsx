import { useState, useEffect, useCallback } from 'react'
import { Box, Button, Chip, CircularProgress, Divider, IconButton, Tooltip, Typography } from '@mui/material'
import { ChevronDown, ChevronUp, Download, FileText, Folder } from 'lucide-react'
import { useDocuments, type UserDocument } from '@/hooks/useDocuments'
import { documents as documentsApi } from '@/services/api'
import { cn } from '@/lib/utils'

const DOCS_LAST_VISIT_KEY = 'documents_last_visit'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDocumentType(type?: string): string {
  if (!type) return 'Document'
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatExtractedKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}

function formatExtractedValue(value: unknown): string {
  if (typeof value === 'number') {
    if (value > 10000) return `$${value.toLocaleString()}`
    return String(value)
  }
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      }
    }
    return value
  }
  return String(value)
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box className="flex flex-col gap-0.5">
      <Typography variant="caption" className="text-text-disabled" style={{ fontSize: '0.68rem' }}>
        {label}
      </Typography>
      <Typography variant="caption" className="text-text-primary font-medium">
        {value}
      </Typography>
    </Box>
  )
}

function DocumentDetails({ doc }: { doc: UserDocument }) {
  return (
    <Box className="flex flex-col gap-3">
      <Box className="grid grid-cols-2 gap-x-6 gap-y-2">
        <DetailRow label="File name" value={doc.fileName} />
        <DetailRow label="Type" value={formatDocumentType(doc.documentType)} />
        <DetailRow label="Size" value={formatBytes(doc.sizeBytes)} />
        <DetailRow
          label="Uploaded"
          value={new Date(doc.uploadedAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        />
        <DetailRow label="Content type" value={doc.contentType} />
      </Box>

      {doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
        <>
          <Divider />
          <Typography
            variant="caption"
            className="font-semibold uppercase tracking-wide text-text-secondary"
            style={{ fontSize: '0.65rem' }}
          >
            Extracted Information
          </Typography>
          <Box className="grid grid-cols-2 gap-x-6 gap-y-2">
            {Object.entries(doc.extractedData).map(([key, value]) =>
              value !== null && value !== undefined && value !== '' ? (
                <DetailRow key={key} label={formatExtractedKey(key)} value={formatExtractedValue(value)} />
              ) : null,
            )}
          </Box>
        </>
      )}
    </Box>
  )
}

function PdfPreview({ doc }: { doc: UserDocument }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const isPdf =
      doc.contentType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setPreviewUrl(null)
      return
    }
    setLoading(true)
    setPreviewUrl(null)
    documentsApi
      .getDownloadUrl(doc.documentId)
      .then(({ downloadUrl }) => setPreviewUrl(downloadUrl))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [doc.documentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    try {
      const { downloadUrl } = await documentsApi.getDownloadUrl(doc.documentId)
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch {
      // ignore
    }
  }

  const isPdf =
    doc.contentType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf')

  return (
    <Box className="flex h-full flex-col overflow-hidden rounded-xl border border-grey-100 bg-background-paper">
      {loading ? (
        <Box className="flex flex-1 items-center justify-center py-16">
          <CircularProgress size={32} />
        </Box>
      ) : previewUrl ? (
        <iframe
          src={previewUrl}
          title={doc.fileName}
          className="flex-1"
          style={{ minHeight: 400, border: 'none', width: '100%' }}
        />
      ) : (
        <Box className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <FileText size={40} className="text-text-disabled" />
          <Typography variant="body2" className="text-text-secondary italic">
            {isPdf ? 'Unable to load preview' : 'Preview not available for this file type'}
          </Typography>
          <Button size="small" variant="outlined" onClick={handleDownload}>
            Download to view
          </Button>
        </Box>
      )}
    </Box>
  )
}

export default function DocumentsPage() {
  const { documents, isLoading, refetch } = useDocuments()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    refetch()
    localStorage.setItem(DOCS_LAST_VISIT_KEY, new Date().toISOString())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(
    (doc: UserDocument) => {
      const id = doc.documentId
      setSelectedId(id)
      setExpandedId((prev) => (prev === id ? null : id))
    },
    [],
  )

  const handleDownload = async (doc: UserDocument, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { downloadUrl } = await documentsApi.getDownloadUrl(doc.documentId)
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch {
      // ignore
    }
  }

  const selectedDoc = documents.find((d) => d.documentId === selectedId) ?? null

  return (
    <Box className="flex h-full min-h-0 flex-col gap-6 p-6 md:flex-row">
      {/* Right: PDF preview — rendered first so it appears on top in mobile stacked layout */}
      <Box className="flex w-full flex-col gap-4 md:w-1/2">
        <Typography variant="h5" className="font-semibold text-text-primary">
          Preview
        </Typography>

        {selectedDoc ? (
          <PdfPreview key={selectedDoc.documentId} doc={selectedDoc} />
        ) : (
          <Box className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-grey-100 bg-background-paper py-20 text-center">
            <Folder size={44} className="text-text-disabled" />
            <Typography variant="body2" className="text-text-secondary italic">
              Select a document to preview
            </Typography>
          </Box>
        )}
      </Box>

      {/* Left: document list */}
      <Box className="flex w-full flex-col gap-4 overflow-y-auto md:w-1/2">
        <Typography variant="h5" className="font-semibold text-text-primary">
          Documents
        </Typography>

        {isLoading ? (
          <Box className="flex justify-center py-12">
            <CircularProgress size={32} />
          </Box>
        ) : documents.length === 0 ? (
          <Box className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Folder size={44} className="text-text-disabled" />
            <Typography variant="body2" className="text-text-secondary italic">
              No documents yet. Upload one using the Documents icon in the sidebar.
            </Typography>
          </Box>
        ) : (
          documents.map((doc) => {
            const isSelected = selectedId === doc.documentId
            const isExpanded = expandedId === doc.documentId

            return (
              <Box
                key={doc.documentId}
                className={cn(
                  'cursor-pointer rounded-xl border bg-background-paper transition-all',
                  isSelected
                    ? 'border-primary shadow-sm'
                    : 'border-grey-100 hover:border-grey-300',
                )}
                onClick={() => handleSelect(doc)}
              >
                {/* Header row */}
                <Box className="flex items-center gap-3 px-4 py-3">
                  <FileText
                    size={20}
                    className={isSelected ? 'shrink-0 text-primary' : 'shrink-0 text-text-secondary'}
                  />
                  <Box className="min-w-0 flex-1">
                    <Typography
                      variant="body2"
                      className="truncate font-medium text-text-primary"
                    >
                      {doc.fileName}
                    </Typography>
                    <Typography variant="caption" className="text-text-secondary">
                      {formatDocumentType(doc.documentType)} · {formatBytes(doc.sizeBytes)} ·{' '}
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box className="flex shrink-0 items-center gap-1">
                    {doc.documentType === 'pre_approval_letter' && (
                      <Chip
                        label="Pre-Approval"
                        size="small"
                        sx={{
                          bgcolor: 'success.light',
                          color: 'success.contrastText',
                          height: 20,
                          fontSize: '0.68rem',
                          fontWeight: 600,
                        }}
                      />
                    )}
                    <Tooltip title="Download" arrow>
                      <IconButton size="small" onClick={(e) => handleDownload(doc, e)}>
                        <Download size={14} />
                      </IconButton>
                    </Tooltip>
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-text-secondary" />
                    ) : (
                      <ChevronDown size={16} className="text-text-secondary" />
                    )}
                  </Box>
                </Box>

                {/* Expanded details */}
                {isExpanded && (
                  <Box className="border-t border-grey-100 px-4 py-3">
                    <DocumentDetails doc={doc} />
                  </Box>
                )}
              </Box>
            )
          })
        )}
      </Box>
    </Box>
  )
}
