import { useEffect, useRef, useMemo, useState } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { Box, Divider, IconButton, Tooltip, Typography } from '@mui/material'
import { useLayoutContext } from '@/components/layout/layout-context'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'
import { MessageSquare, Search, Eye, Folder, Upload, DollarSign, Home, BarChart2, ChevronDown } from 'lucide-react'
import SearchProfileCard from '@/components/sidebar/SearchProfileCard'
import FavoritesCard from '@/components/sidebar/FavoritesCard'
import ViewingCard from '@/components/sidebar/ViewingCard'
import OfferCard from '@/components/sidebar/OfferCard'
import ClosingCard from '@/components/sidebar/ClosingCard'
import NameMismatchDialog from '@/components/documents/NameMismatchDialog'
import { useUserProfile } from '@/hooks/useUserProfile'
import { useSearchResults } from '@/hooks/useSearchResults'
import { useViewings } from '@/hooks/useViewings'
import { useDocuments } from '@/hooks/useDocuments'
import { useDocumentUpload } from '@/hooks/useDocumentUpload'
import { useOffers } from '@/hooks/useOffers'
import { useClosings } from '@/hooks/useClosings'
import { useFavoritesContext } from '@/components/favorites/FavoritesContext'
import { cn } from '@/lib/utils'

const DOCS_LAST_VISIT_KEY = 'documents_last_visit'

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
        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-grey-50"
        style={{ background: 'none', border: 'none' }}
      >
        <span className="text-primary">{icon}</span>
        <Typography variant="h6" className="text-primary flex-1 text-sm font-semibold">
          {title}
        </Typography>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-primary transition-transform', open && 'rotate-180')}
        />
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
      <MessageSquare size={12} />
    </button>
  )
}

export default function LeftMenu() {
  const { sidebarOpen, sidebarWidth } = useLayoutContext()
  const { registerProfileRefetch, registerSearchResultsRefetch, registerDocumentsRefetch, registerOffersRefetch, registerViewingsRefetch, registerClosingsRefetch, setNewListingsCount } = useSidebarRefresh()
  const { profile, refetch: refetchProfile } = useUserProfile()
  const { results, grouped, refetch: refetchSearchResults } = useSearchResults()
  const { viewings, refetch: refetchViewings } = useViewings()
  const { documents, refetch: refetchDocuments } = useDocuments()
  const { offers, refetch: refetchOffers } = useOffers()
  const { closings, refetch: refetchClosings } = useClosings()
  const { favorites } = useFavoritesContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { upload, isUploading, nameMismatch, clearNameMismatch, updateProfileName } = useDocumentUpload()

  const newDocsCount = useMemo(() => {
    const lastVisit = localStorage.getItem(DOCS_LAST_VISIT_KEY)
    if (!lastVisit) return documents.length
    const lastVisitTime = new Date(lastVisit).getTime()
    return documents.filter((d) => new Date(d.uploadedAt).getTime() > lastVisitTime).length
  }, [documents])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await upload(file)
  }

  useEffect(() => registerProfileRefetch(refetchProfile), [registerProfileRefetch, refetchProfile])
  useEffect(() => registerSearchResultsRefetch(refetchSearchResults), [registerSearchResultsRefetch, refetchSearchResults])
  useEffect(() => registerDocumentsRefetch(refetchDocuments), [registerDocumentsRefetch, refetchDocuments])
  useEffect(() => registerOffersRefetch(refetchOffers), [registerOffersRefetch, refetchOffers])
  useEffect(() => registerViewingsRefetch(refetchViewings), [registerViewingsRefetch, refetchViewings])
  useEffect(() => registerClosingsRefetch(refetchClosings), [registerClosingsRefetch, refetchClosings])

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
    refetchClosings()
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
          <MessageSquare size={20} />
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
          <BarChart2 size={20} />
          <Typography variant="body2" component="span" className="font-medium">
            Dashboard
          </Typography>
        </NavLink>

        {/* Documents nav link with upload button */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <NameMismatchDialog
          nameMismatch={nameMismatch}
          onUpdate={updateProfileName}
          onDismiss={clearNameMismatch}
        />
        <div className="flex items-center rounded-xl">
          <NavLink
            to="/documents"
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-row items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-grey-50 hover:text-text-primary',
              )
            }
          >
            <Folder size={20} />
            <Typography variant="body2" component="span" className="font-medium flex-1">
              Documents
            </Typography>
            {newDocsCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
                {newDocsCount > 99 ? '99+' : newDocsCount}
              </span>
            )}
          </NavLink>
          <Tooltip title="Upload document" arrow>
            <span>
              <IconButton
                size="small"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className={cn('mx-1 text-text-secondary', isUploading && 'animate-pulse')}
              >
                <Upload size={16} />
              </IconButton>
            </span>
          </Tooltip>
        </div>

        <Divider className="my-1" />

        <SidebarSection
          title="My Searches"
          icon={<Search size={16} />}
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
          icon={<Eye size={16} />}
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
          icon={<DollarSign size={16} />}
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
          icon={<Home size={16} />}
          contentClassName="flex flex-col gap-1.5 px-2 pb-3 pt-0"
        >
          {closings.length === 0 ? (
            <Typography variant="caption" className="text-text-secondary px-2.5 italic">
              Your active closing will appear here once an offer is accepted.
            </Typography>
          ) : (
            closings.map((c) => <ClosingCard key={c.closingId} closing={c} />)
          )}
        </SidebarSection>

      </Box>
      <div className="flex justify-center p-6" style={{ width: `${sidebarWidth}px` }}>
        <span className="text-6xl">🏠</span>
      </div>
    </nav>
  )
}
