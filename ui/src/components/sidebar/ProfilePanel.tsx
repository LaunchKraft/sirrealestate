import { useNavigate } from 'react-router-dom'
import { Avatar, Box, Chip, Divider, Typography } from '@mui/material'
import NiMessage from '@/icons/nexture/ni-message'
import type { UserProfile } from '@/hooks/useUserProfile'

interface ProfilePanelProps {
  profile: UserProfile | null
}

function getInitials(profile: UserProfile): string {
  if (profile.firstName && profile.lastName) {
    return `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
  }
  return profile.email?.[0]?.toUpperCase() ?? '?'
}

const LISTING_PREF_LABEL: Record<string, string> = {
  zillow: 'Zillow',
  redfin: 'Redfin',
  realtor: 'Realtor.com',
}

function ChatEditButton({ prompt }: { prompt: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(`/chat?prompt=${encodeURIComponent(prompt)}`)}
      title="Ask in chat"
      className="shrink-0 text-text-secondary opacity-40 hover:opacity-100 hover:text-primary transition-opacity rounded p-0.5"
      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 0 }}
    >
      <NiMessage size={12} />
    </button>
  )
}

function ProfileRow({ label, value, prompt }: { label: string; value: string; prompt: string }) {
  return (
    <Box className="flex items-center justify-between gap-2">
      <Typography variant="caption" className="text-text-secondary shrink-0">
        {label}
      </Typography>
      <Box className="flex min-w-0 items-center gap-1">
        <Typography variant="caption" className="text-text-primary truncate text-right font-medium">
          {value}
        </Typography>
        <ChatEditButton prompt={prompt} />
      </Box>
    </Box>
  )
}

export default function ProfilePanel({ profile }: ProfilePanelProps) {
  if (!profile) {
    return (
      <Typography variant="caption" className="text-text-secondary px-2.5">
        Chat to fill in your profile →
      </Typography>
    )
  }

  const hasName = profile.firstName || profile.lastName
  const displayName = hasName
    ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
    : null
  const isIncomplete = !hasName || !profile.phone

  const location = profile.currentCity && profile.currentState
    ? `${profile.currentCity}, ${profile.currentState}`
    : profile.currentCity ?? profile.currentState ?? null

  return (
    <Box className="flex flex-col gap-1.5 px-2.5">
      {/* Name / avatar row */}
      <Box className="flex items-center gap-2">
        <Avatar className="bg-primary/20 text-primary h-8 w-8 text-sm font-semibold">
          {getInitials(profile)}
        </Avatar>
        <Box className="min-w-0 flex-1">
          {displayName && (
            <Typography variant="body2" className="font-medium truncate">
              {displayName}
            </Typography>
          )}
          <Typography variant="body2" className="text-text-secondary truncate text-xs">
            {profile.email}
          </Typography>
        </Box>
        <ChatEditButton prompt="I'd like to update my name" />
      </Box>

      {/* Phone row */}
      <Box className="flex items-center justify-between gap-2">
        {profile.phone ? (
          <Typography variant="caption" className="text-text-secondary">
            {profile.phone}
          </Typography>
        ) : (
          <Typography variant="caption" className="text-text-disabled">
            Phone: not yet collected
          </Typography>
        )}
        <ChatEditButton prompt="I'd like to update my phone number" />
      </Box>

      <Divider className="my-0.5" />

      <Box className="flex flex-col gap-0.5">
        {location && (
          <ProfileRow
            label="Location"
            value={location}
            prompt="I'd like to update my location"
          />
        )}
        {profile.preApprovalAmount && (
          <ProfileRow
            label="Pre-approval"
            value={`$${profile.preApprovalAmount.toLocaleString()}`}
            prompt="I'd like to update my pre-approval amount"
          />
        )}
        {profile.listingViewingPreference && (
          <ProfileRow
            label="Listings on"
            value={LISTING_PREF_LABEL[profile.listingViewingPreference] ?? profile.listingViewingPreference}
            prompt="I'd like to change my listing preference"
          />
        )}
      </Box>

      {(location || profile.preApprovalAmount || profile.listingViewingPreference) && (
        <Divider className="my-0.5" />
      )}

      {profile.buyerStatus && (
        <Box className="flex items-center gap-2">
          <Chip
            label={profile.buyerStatus === 'ready_to_offer' ? 'Ready to offer' : profile.buyerStatus === 'actively_looking' ? 'Actively looking' : 'Browsing'}
            size="small"
            color={profile.buyerStatus === 'ready_to_offer' ? 'success' : profile.buyerStatus === 'actively_looking' ? 'primary' : 'default'}
            sx={{ height: 20, fontSize: '0.68rem' }}
          />
          <ChatEditButton prompt="I'd like to update my buyer status" />
        </Box>
      )}

      {isIncomplete && (
        <Typography variant="caption" className="text-text-secondary italic">
          Chat to fill in your profile →
        </Typography>
      )}
    </Box>
  )
}
