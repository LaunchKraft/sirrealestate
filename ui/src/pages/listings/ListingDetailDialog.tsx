import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useFloatingChat } from '@/components/chat/floating-chat-context'
import type { SearchResult } from '@/hooks/useSearchResults'
import { streetViewUrl } from '@/lib/streetview'
import FavoriteButton from '@/components/favorites/FavoriteButton'
import { stats } from '@/services/api'
import { trackEvent } from '@/lib/analytics'

interface ListingDetailDialogProps {
  result: SearchResult | null
  open: boolean
  onClose: () => void
}

export default function ListingDetailDialog({ result, open, onClose }: ListingDetailDialogProps) {
  const { setPendingMessage, openChat } = useFloatingChat()

  if (!result) return null

  const l = result.listingData
  const imgUrl = l.latitude != null && l.longitude != null
    ? streetViewUrl(l.latitude, l.longitude, 800, 400)
    : null

  function handleScheduleViewing() {
    onClose()
    setPendingMessage(
      `I'd like to schedule a viewing for ${l.address}. Can you help me arrange that?`,
    )
    openChat()
  }

  function handleAiAnalysis() {
    onClose()
    const sqftPart = l.sqft ? `, ${l.sqft.toLocaleString()} sqft` : ''
    setPendingMessage(
      `I'm viewing this listing: ${l.address} — $${l.price.toLocaleString()}, ` +
        `${l.bedrooms} bed / ${l.bathrooms} bath${sqftPart}. ` +
        `How does it compare to my search criteria and is it a good fit for me?`,
    )
    openChat()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        {l.address}
        <FavoriteButton
          listingId={result.listingId}
          listingData={result.listingData}
          profileId={result.profileId}
          size="medium"
        />
      </DialogTitle>
      <DialogContent dividers sx={{ padding: 0 }}>
        {imgUrl && (
          <img
            src={imgUrl}
            alt={l.address}
            style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}
        <Box className="flex flex-col gap-3 p-5">
          <Box className="flex flex-wrap gap-4">
            <Box>
              <Typography variant="caption" className="text-text-secondary block">
                Price
              </Typography>
              <Typography variant="h6" className="font-semibold">
                ${l.price.toLocaleString()}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" className="text-text-secondary block">
                Beds / Baths
              </Typography>
              <Typography variant="body1">
                {l.bedrooms} bed / {l.bathrooms} bath
              </Typography>
            </Box>
            {l.sqft && (
              <Box>
                <Typography variant="caption" className="text-text-secondary block">
                  Sqft
                </Typography>
                <Typography variant="body1">{l.sqft.toLocaleString()}</Typography>
              </Box>
            )}
          </Box>

          <Box>
            <Typography variant="caption" className="text-text-secondary block">
              Matched
            </Typography>
            <Typography variant="body2">
              {new Date(result.matchedAt).toLocaleDateString()}
            </Typography>
          </Box>

          {(l.agentName || l.agentEmail) && (
            <Box>
              <Typography variant="caption" className="text-text-secondary block">
                Agent
              </Typography>
              {l.agentName && <Typography variant="body2">{l.agentName}</Typography>}
              {l.agentEmail && (
                <Typography variant="body2">
                  <a href={`mailto:${l.agentEmail}`} className="text-primary hover:underline">
                    {l.agentEmail}
                  </a>
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions className="gap-2 p-3">
        {l.listingUrl && (
          <Button
            variant="outlined"
            color="grey"
            size="small"
            href={l.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              const platform = l.listingUrl?.includes('zillow') ? 'zillow'
                : l.listingUrl?.includes('redfin') ? 'redfin'
                : l.listingUrl?.includes('realtor') ? 'realtor'
                : 'other'
              stats.recordListingClick(result.listingId, platform, result.profileId).catch(() => {})
              trackEvent('listing_site_click', { platform, listing_id: result.listingId })
            }}
          >
            View Listing
          </Button>
        )}
        <Button variant="outlined" color="primary" size="small" onClick={handleAiAnalysis}>
          AI Analysis
        </Button>
        <Button variant="contained" color="primary" size="small" onClick={handleScheduleViewing}>
          Schedule Viewing
        </Button>
        <Button variant="text" color="grey" size="small" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
