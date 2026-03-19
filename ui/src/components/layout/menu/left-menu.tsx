import { useEffect, useState } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { Box, Divider, Typography } from '@mui/material'
import { useLayoutContext } from '@/components/layout/layout-context'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'
import NiMessage from '@/icons/nexture/ni-message'
import NiUser from '@/icons/nexture/ni-user'
import NiSearch from '@/icons/nexture/ni-search'
import NiCalendar from '@/icons/nexture/ni-calendar'
import NiListSquare from '@/icons/nexture/ni-list-square'
import NiDuplicate from '@/icons/nexture/ni-duplicate'
import NiHome from '@/icons/nexture/ni-home'
import NiBarChart from '@/icons/nexture/ni-bar-chart'
import NiChevronRightSmall from '@/icons/nexture/ni-chevron-right-small'
import keysImage from '@/assets/keys.png'
import ProfilePanel from '@/components/sidebar/ProfilePanel'
import SearchProfileCard from '@/components/sidebar/SearchProfileCard'
import FavoritesCard from '@/components/sidebar/FavoritesCard'
import ViewingCard from '@/components/sidebar/ViewingCard'
import DocumentPanel from '@/components/sidebar/DocumentPanel'
import OfferCard from '@/components/sidebar/OfferCard'
import { useUserProfile } from '@/hooks/useUserProfile'
import { useSearchResults } from '@/hooks/useSearchResults'
import { useViewings } from '@/hooks/useViewings'
import { useDocuments } from '@/hooks/useDocuments'
import { useOffers } from '@/hooks/useOffers'
import { useFavoritesContext } from '@/components/favorites/FavoritesContext'
import { cn } from '@/lib/utils'

function SidebarSection({
  title,
  icon,
  defaultOpen = false,
  contentClassName,
  children,
}: {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  contentClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-1 rounded-xl px-2 py-2 text-left hover:bg-grey-50"
        style={{ background: 'none', border: 'none' }}
      >
        <NiChevronRightSmall
          size="small"
          className={cn('shrink-0 text-primary transition-transform', open && 'rotate-90')}
        />
        <Box className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <Typography variant="h6" className="text-primary text-sm font-semibold">
            {title}
          </Typography>
        </Box>
      </button>
      {open && (
        <div className={contentClassName ?? 'px-2 pb-3 pt-0'}>
          {children}
        </div>
      )}
    </div>
  )
}

function ViewingChatButton({ prompt }: { prompt: string }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/chat?prompt=${encodeURIComponent(prompt)}`)}
      className="shrink-0 text-text-secondary opacity-40 hover:opacity-100 hover:text-primary transition-opacity rounded p-0.5"
      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 0 }}
      title="Chat about viewings"
    >
      <NiMessage size={12} />
    </button>
  )
}

export default function LeftMenu() {
  const { sidebarOpen, sidebarWidth } = useLayoutContext()
  const { registerProfileRefetch, registerSearchResultsRefetch, registerDocumentsRefetch, registerOffersRefetch, registerViewingsRefetch, setNewListingsCount } = useSidebarRefresh()
  const { profile, refetch: refetchProfile } = useUserProfile()
  const { results, grouped, refetch: refetchSearchResults } = useSearchResults()
  const { viewings, refetch: refetchViewings } = useViewings()
  const { documents, refetch: refetchDocuments } = useDocuments()
  const { offers, refetch: refetchOffers } = useOffers()
  const { favorites } = useFavoritesContext()

  useEffect(() => registerProfileRefetch(refetchProfile), [registerProfileRefetch, refetchProfile])
  useEffect(() => registerSearchResultsRefetch(refetchSearchResults), [registerSearchResultsRefetch, refetchSearchResults])
  useEffect(() => registerDocumentsRefetch(refetchDocuments), [registerDocumentsRefetch, refetchDocuments])
  useEffect(() => registerOffersRefetch(refetchOffers), [registerOffersRefetch, refetchOffers])
  useEffect(() => registerViewingsRefetch(refetchViewings), [registerViewingsRefetch, refetchViewings])

  useEffect(() => {
    setNewListingsCount(results.filter((r) => !r.notified).length)
  }, [results, setNewListingsCount])

  useEffect(() => {
    if (!sidebarOpen) return
    refetchProfile()
    refetchSearchResults()
    refetchViewings()
    refetchDocuments()
    refetchOffers()
  }, [sidebarOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav
      className={cn(
        'bg-background-paper shadow-darker-xs fixed z-10 mt-20 flex h-[calc(100%-5rem)] flex-col overflow-hidden rounded-e-4xl transition-all duration-(--layout-duration)',
      )}
      style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
    >
      <Box
        className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto px-4 py-2.5"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Chat nav link */}
        <NavLink
          to="/chat"
          className={({ isActive }) =>
            cn(
              'flex flex-row items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-grey-50 hover:text-text-primary',
            )
          }
        >
          <NiMessage size="medium" />
          <Typography variant="body2" component="span" className="font-medium">
            Chat
          </Typography>
        </NavLink>

        {/* Dashboard nav link */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            cn(
              'flex flex-row items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-grey-50 hover:text-text-primary',
            )
          }
        >
          <NiBarChart size="medium" />
          <Typography variant="body2" component="span" className="font-medium">
            Dashboard
          </Typography>
        </NavLink>

        <Divider className="my-1" />

        <SidebarSection
          title="My Profile"
          icon={<NiUser size="small" />}
          defaultOpen
        >
          <ProfilePanel profile={profile} />
        </SidebarSection>

        <SidebarSection
          title="My Documents"
          icon={<NiListSquare size="small" />}
        >
          <DocumentPanel documentList={documents} />
        </SidebarSection>

        <SidebarSection
          title="My Searches"
          icon={<NiSearch size="small" />}
          contentClassName="flex flex-col gap-1 px-2 pb-3 pt-0"
        >
          {favorites.length > 0 && <FavoritesCard />}
          {!profile || profile.searchProfiles.length === 0 ? (
            <Link
              to="/chat?prompt=I'd+like+to+start+a+property+search"
              className="text-primary px-2.5 text-xs font-medium italic hover:underline"
            >
              Start a search in chat →
            </Link>
          ) : (
            profile.searchProfiles.map((sp) => (
              <SearchProfileCard
                key={sp.profileId}
                profile={sp}
                results={grouped[sp.profileId] ?? []}
                onDeleted={refetchProfile}
              />
            ))
          )}
        </SidebarSection>

        <SidebarSection
          title="My Viewings"
          icon={<NiCalendar size="small" />}
          contentClassName="flex flex-col gap-1.5 px-2 pb-3 pt-0"
        >
          {viewings.length === 0 ? (
            <Link
              to="/chat?prompt=I'd+like+to+schedule+a+property+viewing"
              className="text-primary px-2.5 text-xs font-medium italic hover:underline"
            >
              Schedule a viewing through chat →
            </Link>
          ) : (
            viewings.map((v) => <ViewingCard key={v.viewingId} viewing={v} />)
          )}
          {/* Always-visible calendar link + context-aware chat icon */}
          {(() => {
            const hasAvailability = (profile?.availability?.length ?? 0) > 0
            const upcoming = viewings.filter(
              (v) => v.status === 'requested' || v.status === 'confirmed',
            )
            const availPrompt = hasAvailability
              ? `I'd like to update my viewing availability. I currently have ${profile!.availability!.length} time window${profile!.availability!.length === 1 ? '' : 's'} set.`
              : `I'd like to set my availability for property viewings.`
            const viewingsPart =
              upcoming.length > 0
                ? ` I also have ${upcoming.length} upcoming viewing${upcoming.length === 1 ? '' : 's'} (${upcoming.map((v) => v.listingAddress).join(', ')}).`
                : ''
            const chatPrompt = availPrompt + viewingsPart
            return (
              <Box className="ms-7 mt-1 flex items-center gap-1.5">
                <Link
                  to="/viewings"
                  className="text-primary text-xs font-medium hover:underline"
                >
                  Viewing Calendar →
                </Link>
                <ViewingChatButton prompt={chatPrompt} />
              </Box>
            )
          })()}
        </SidebarSection>

        <SidebarSection
          title="My Offers"
          icon={<NiDuplicate size="small" />}
          contentClassName="flex flex-col gap-1.5 px-2 pb-3 pt-0"
        >
          {offers.length === 0 ? (
            <Link
              to="/chat?prompt=I'd+like+to+start+an+offer+on+a+property"
              className="text-primary px-2.5 text-xs font-medium italic hover:underline"
            >
              Start an offer through chat →
            </Link>
          ) : (
            offers.map((o) => <OfferCard key={o.offerId} offer={o} />)
          )}
        </SidebarSection>

        <SidebarSection
          title="My Home"
          icon={<NiHome size="small" />}
        >
          <Typography variant="caption" className="text-text-secondary px-2.5 italic">
            Coming soon
          </Typography>
        </SidebarSection>

        <div className="flex justify-center py-4">
          <img
            src={keysImage}
            alt=""
            className="w-24 opacity-60"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>
      </Box>
    </nav>
  )
}
