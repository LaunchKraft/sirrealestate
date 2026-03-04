import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material'
import type { NameMismatch } from '@/hooks/useDocumentUpload'

interface NameMismatchDialogProps {
  nameMismatch: NameMismatch | null
  onUpdate: (selectedName: string) => Promise<void>
  onDismiss: () => void
}

export default function NameMismatchDialog({ nameMismatch, onUpdate, onDismiss }: NameMismatchDialogProps) {
  const [selected, setSelected] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)

  if (!nameMismatch) return null

  const { documentNames, profileName } = nameMismatch
  const effectiveSelected = selected || documentNames[0]

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      await onUpdate(effectiveSelected)
    } finally {
      setIsUpdating(false)
      setSelected('')
    }
  }

  const handleDismiss = () => {
    setSelected('')
    onDismiss()
  }

  return (
    <Dialog open maxWidth="sm" fullWidth>
      <DialogTitle>Name Mismatch Detected</DialogTitle>
      <DialogContent className="flex flex-col gap-3">
        <Typography variant="body2">
          The name on your uploaded document doesn't match the name we have on file for you.
          Before making an offer on a house, the buyer name in our system must match the name on the document.
        </Typography>

        <Typography variant="body2">
          <strong>Your name in SirRealtor:</strong> {profileName}
        </Typography>

        {documentNames.length === 1 ? (
          <Typography variant="body2">
            <strong>Name on document:</strong> {documentNames[0]}
          </Typography>
        ) : (
          <FormControl>
            <Typography variant="body2" className="mb-1">
              <strong>Names on document</strong> — select which one is you:
            </Typography>
            <RadioGroup
              value={effectiveSelected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {documentNames.map((name) => (
                <FormControlLabel key={name} value={name} control={<Radio size="small" />} label={name} />
              ))}
            </RadioGroup>
          </FormControl>
        )}

        <Typography variant="caption" color="text.secondary">
          Would you like to update your name to match?
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleDismiss} disabled={isUpdating}>
          Keep my current name
        </Button>
        <Button
          onClick={handleUpdate}
          variant="contained"
          disabled={isUpdating}
        >
          Update my name to {effectiveSelected}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
