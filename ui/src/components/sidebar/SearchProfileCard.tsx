import { useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import NiChevronRightSmall from '@/icons/nexture/ni-chevron-right-small'
import NiClose from '@/icons/nexture/ni-close'
import ListingMatchCard from './ListingMatchCard'
import type { SearchProfile } from '@/hooks/useUserProfile'
import type { SearchResult } from '@/hooks/useSearchResults'
import { searchProfiles } from '@/services/api'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'

interface SearchProfileCardProps {
  profile: SearchProfile
  results: SearchResult[]
  onDeleted: () => void
}

function formatCriteria(profile: SearchProfile): string {
  const parts: string[] = []
  const c = profile.criteria
  if (c.bedrooms) parts.push(`${c.bedrooms}BR`)
  if (c.city && c.state) parts.push(`${c.city} ${c.state}`)
  else if (c.city) parts.push(c.city)
  else if (c.state) parts.push(c.state)
  if (c.minPrice || c.maxPrice) {
    const min = c.minPrice ? `$${Math.round(c.minPrice / 1000)}k` : ''
    const max = c.maxPrice ? `$${Math.round(c.maxPrice / 1000)}k` : ''
    if (min && max) parts.push(`${min}–${max}`)
    else if (max) parts.push(`up to ${max}`)
    else if (min) parts.push(`from ${min}`)
  }
  return parts.join(' · ') || 'No criteria set'
}

export default function SearchProfileCard({ profile, results, onDeleted }: SearchProfileCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const topResults = results.slice(0, 3)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await searchProfiles.delete(profile.profileId)
      trackEvent('search_profile_deleted')
      setConfirmOpen(false)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Box>
        {/* Header row — acts as the toggle */}
        <Box
          component="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-left"
          sx={{ background: 'none', border: 'none', p: 0 }}
        >
          <NiChevronRightSmall
            size="small"
            className={cn('accordion-rotate shrink-0 transition-transform', expanded && 'rotate-90')}
          />
          <Box className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1 py-1.5">
            <Typography variant="body2" className="font-medium truncate">
              {profile.name}
            </Typography>
            <Box className="flex items-center gap-1 shrink-0">
              <Chip
                label={profile.monitoring ? 'Live' : 'Paused'}
                color={profile.monitoring ? 'success' : 'default'}
                size="small"
                className="h-4 text-[10px]"
              />
              <IconButton
                size="small"
                className="text-text-secondary opacity-50 hover:opacity-100 hover:text-error p-0.5!"
                onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
                title="Remove this search"
              >
                <NiClose size={12} />
              </IconButton>
            </Box>
          </Box>
        </Box>

        {/* Expandable content */}
        {expanded && (
          <Box className="flex flex-col gap-1.5 px-2 pb-2 pt-0">
            <Typography variant="caption" className="text-text-secondary ms-7 block">
              {formatCriteria(profile)}
            </Typography>
            {topResults.length === 0 ? (
              <Typography variant="caption" className="text-text-secondary ms-7">
                No matches yet — monitoring will run daily at 8 AM.
              </Typography>
            ) : (
              <>
                {topResults.map((r) => (
                  <ListingMatchCard key={r.profileIdListingId} result={r} />
                ))}
                {results.length > 0 && (
                  <Link
                    to={`/listings/${profile.profileId}`}
                    className="text-primary ms-7 mt-1 block text-xs font-medium hover:underline"
                  >
                    Show all {results.length} listings →
                  </Link>
                )}
              </>
            )}
          </Box>
        )}
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove this search?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{profile.name}</strong> and all its saved results will be permanently removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} color="grey" disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
