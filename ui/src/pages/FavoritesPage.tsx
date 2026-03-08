import { useState } from 'react'
import { Box, Typography } from '@mui/material'
import { useFavoritesContext } from '@/components/favorites/FavoritesContext'
import ListingsTable from './listings/ListingsTable'
import ListingDetailDialog from './listings/ListingDetailDialog'
import type { SearchResult } from '@/hooks/useSearchResults'

export default function FavoritesPage() {
  const { favorites } = useFavoritesContext()

  const [selectedListing, setSelectedListing] = useState<SearchResult | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Convert Favorite → SearchResult for ListingsTable
  const allResults: SearchResult[] = favorites.map((f) => ({
    userId: '',
    listingId: f.listingId,
    profileId: f.profileId,
    profileIdListingId: `${f.profileId}#${f.listingId}`,
    listingData: f.listingData,
    matchedAt: f.favoritedAt,
    notified: true,
  }))

  function handleListingSelect(result: SearchResult) {
    setSelectedListing(result)
    setDialogOpen(true)
  }

  return (
    <Box className="flex flex-col gap-4">
      <Box className="flex items-center justify-between">
        <Typography variant="h6" className="font-semibold">
          Favorites
        </Typography>
        <Typography variant="body2" className="text-text-secondary">
          {allResults.length} listing{allResults.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      <Box sx={{ height: 'calc(100vh - 16rem)', minHeight: 300 }}>
        {allResults.length === 0 ? (
          <Typography variant="body2" className="text-text-secondary px-1 italic">
            No favorites yet — heart a listing to save it here.
          </Typography>
        ) : (
          <ListingsTable results={allResults} onListingClick={handleListingSelect} />
        )}
      </Box>

      <ListingDetailDialog
        result={selectedListing}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </Box>
  )
}
