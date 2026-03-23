import { useState } from 'react'
import { Box, Chip, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import ListingMatchCard from './ListingMatchCard'
import { useFavoritesContext } from '@/components/favorites/FavoritesContext'
import { cn } from '@/lib/utils'
import type { SearchResult } from '@/hooks/useSearchResults'

export default function FavoritesCard() {
  const { favorites } = useFavoritesContext()
  const [expanded, setExpanded] = useState(false)
  const topFavorites = favorites.slice(0, 3)

  // Map Favorite → SearchResult shape that ListingMatchCard expects
  const asSearchResults: SearchResult[] = topFavorites.map((f) => ({
    userId: '',
    listingId: f.listingId,
    profileId: f.profileId,
    profileIdListingId: `${f.profileId}#${f.listingId}`,
    listingData: f.listingData,
    matchedAt: f.favoritedAt,
    notified: true,
  }))

  return (
    <Box>
      <Box
        component="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-left"
        sx={{ background: 'none', border: 'none', p: 0 }}
      >
        <ChevronRight
          size={16}
          className={cn('accordion-rotate shrink-0 transition-transform', expanded && 'rotate-90')}
        />
        <Box className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1 py-1.5">
          <Box className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-error shrink-0" style={{ color: 'var(--mui-palette-error-main)' }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <Typography variant="body2" className="font-medium">
              Favorites
            </Typography>
          </Box>
          <Chip
            label={favorites.length}
            color="error"
            size="small"
            className="shrink-0"
            sx={{ height: 13, fontSize: '0.5rem', '& .MuiChip-label': { px: 0.75 } }}
          />
        </Box>
      </Box>

      {expanded && (
        <Box className="flex flex-col gap-1.5 px-2 pb-2 pt-0">
          {asSearchResults.map((r) => (
            <ListingMatchCard key={r.listingId} result={r} />
          ))}
          <Link
            to="/favorites"
            className="text-primary ms-7 mt-1 block text-xs font-medium hover:underline"
          >
            Show all {favorites.length} favorite{favorites.length !== 1 ? 's' : ''} →
          </Link>
        </Box>
      )}
    </Box>
  )
}
