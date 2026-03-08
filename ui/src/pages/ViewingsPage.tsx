import { useMemo, useEffect, useState } from 'react'
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Link as MuiLink, Menu, MenuItem, Typography,
} from '@mui/material'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { useViewings, type Viewing, type ViewingStatus } from '@/hooks/useViewings'
import { useUserProfile, type AvailabilityWindow } from '@/hooks/useUserProfile'
import { profile as profileApi, viewings as viewingsApi } from '@/services/api'
import NiClose from '@/icons/nexture/ni-chevron-right-small'

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

const CONFIRMED_COLOR = '#16a34a'
const AVAILABILITY_COLOR = '#f59e0b'
const CANCELLED_COLOR = '#9ca3af'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

const STATUS_LABEL: Record<ViewingStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_COLOR: Record<ViewingStatus, 'info' | 'success' | 'default' | 'error'> = {
  requested: 'info',
  confirmed: 'success',
  completed: 'default',
  cancelled: 'error',
}

function buildListingUrl(address: string, preference?: string): string {
  if (preference === 'redfin') return `https://www.redfin.com/search?location=${encodeURIComponent(address)}`
  if (preference === 'realtor') return `https://www.realtor.com/realestateandhomes-search/search?query=${encodeURIComponent(address)}`
  return `https://www.zillow.com/homes/${address.replace(/ /g, '-')}_rb/`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function toTimeInput(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function applyTimeToDate(iso: string, time: string): string {
  const d = new Date(iso)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Availability dialog
// ---------------------------------------------------------------------------
interface AvailabilityDialogProps {
  window: AvailabilityWindow
  allWindows: AvailabilityWindow[]
  onClose: () => void
  onSaved: () => void
}

function AvailabilityDialog({ window: w, allWindows, onClose, onSaved }: AvailabilityDialogProps) {
  const [editing, setEditing] = useState(false)
  const [startTime, setStartTime] = useState(toTimeInput(w.start))
  const [endTime, setEndTime] = useState(toTimeInput(w.end))
  const [saving, setSaving] = useState(false)

  const dateLabel = new Date(w.start).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  async function handleSave() {
    setSaving(true)
    const updated = allWindows.map((win) =>
      win.windowId === w.windowId
        ? { ...win, start: applyTimeToDate(w.start, startTime), end: applyTimeToDate(w.end, endTime) }
        : win,
    )
    await profileApi.patch({ availability: updated })
    setSaving(false)
    onSaved()
    onClose()
  }

  async function handleDelete() {
    setSaving(true)
    const updated = allWindows.filter((win) => win.windowId !== w.windowId)
    await profileApi.patch({ availability: updated })
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Availability Window
        <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 12, top: 12 }}>
          <NiClose size="small" className="rotate-90" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" className="font-semibold mb-1">{dateLabel}</Typography>
        {editing ? (
          <Box className="flex items-center gap-3 mt-2">
            <Box className="flex flex-col gap-0.5">
              <Typography variant="caption" className="text-text-secondary">Start</Typography>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
              />
            </Box>
            <Typography variant="body2" className="mt-4">–</Typography>
            <Box className="flex flex-col gap-0.5">
              <Typography variant="caption" className="text-text-secondary">End</Typography>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
              />
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" className="text-text-secondary mt-1">
            {new Date(w.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {' – '}
            {new Date(w.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {editing ? (
          <>
            <Button onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        ) : (
          <>
            <Button color="error" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="outlined" onClick={() => setEditing(true)}>Edit</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------
function fmtIcsDt(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function buildDescription(viewing: Viewing): string {
  return [
    viewing.agentName ? `Agent: ${viewing.agentName}` : '',
    viewing.agentEmail ? `Email: ${viewing.agentEmail}` : '',
  ].filter(Boolean).join('\\n')
}

function generateIcs(viewing: Viewing): string {
  const start = new Date(viewing.proposedDateTime!)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const desc = buildDescription(viewing)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SirRealtor//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${viewing.viewingId}@sirrealtor.com`,
    `DTSTART:${fmtIcsDt(start)}`,
    `DTEND:${fmtIcsDt(end)}`,
    `SUMMARY:Property Viewing: ${viewing.listingAddress}`,
    `LOCATION:${viewing.listingAddress}`,
    desc ? `DESCRIPTION:${desc}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}

function downloadIcs(viewing: Viewing) {
  const blob = new Blob([generateIcs(viewing)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `viewing-${viewing.listingAddress.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function googleCalendarUrl(viewing: Viewing): string {
  const start = new Date(viewing.proposedDateTime!)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Property Viewing: ${viewing.listingAddress}`,
    dates: `${fmtIcsDt(start)}/${fmtIcsDt(end)}`,
    location: viewing.listingAddress,
    details: [
      viewing.agentName ? `Agent: ${viewing.agentName}` : '',
      viewing.agentEmail ? `Email: ${viewing.agentEmail}` : '',
    ].filter(Boolean).join('\n'),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function outlookCalendarUrl(viewing: Viewing): string {
  const start = new Date(viewing.proposedDateTime!)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: `Property Viewing: ${viewing.listingAddress}`,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    location: viewing.listingAddress,
    body: [
      viewing.agentName ? `Agent: ${viewing.agentName}` : '',
      viewing.agentEmail ? `Email: ${viewing.agentEmail}` : '',
    ].filter(Boolean).join('\n'),
  })
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Viewing dialog (active and cancelled)
// ---------------------------------------------------------------------------
interface ViewingDialogProps {
  viewing: Viewing
  listingPreference?: string
  onClose: () => void
  onCancelled: () => void
}

function ViewingDialog({ viewing, listingPreference, onClose, onCancelled }: ViewingDialogProps) {
  const [cancelling, setCancelling] = useState(false)
  const [thumbError, setThumbError] = useState(false)
  const [calMenuAnchor, setCalMenuAnchor] = useState<HTMLElement | null>(null)
  const isCancelled = viewing.status === 'cancelled'
  const canAddToCalendar = viewing.status === 'confirmed' && !!viewing.proposedDateTime

  const listingUrl = buildListingUrl(viewing.listingAddress, listingPreference)
  const thumbUrl = MAPS_KEY
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x220&location=${encodeURIComponent(viewing.listingAddress)}&key=${MAPS_KEY}&return_error_codes=true`
    : null

  async function handleCancel() {
    setCancelling(true)
    await viewingsApi.cancel(viewing.viewingId)
    setCancelling(false)
    onCancelled()
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box className="flex items-center gap-2">
          <span>{isCancelled ? 'Viewing (Cancelled)' : 'Viewing'}</span>
          <Chip
            label={STATUS_LABEL[viewing.status]}
            color={STATUS_COLOR[viewing.status]}
            size="small"
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 12, top: 12 }}>
          <NiClose size="small" className="rotate-90" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Street View thumbnail */}
        {thumbUrl && !thumbError && (
          <img
            src={thumbUrl}
            alt={viewing.listingAddress}
            onError={() => setThumbError(true)}
            style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
          />
        )}

        <Box className="p-4 flex flex-col gap-2">
          {/* Address + listing link */}
          <Box>
            <MuiLink href={listingUrl} target="_blank" rel="noopener noreferrer" underline="hover">
              <Typography variant="subtitle1" className="font-semibold">{viewing.listingAddress}</Typography>
            </MuiLink>
          </Box>

          {isCancelled && (
            <Typography variant="caption" className="text-error-main italic">
              This viewing was cancelled.
            </Typography>
          )}

          <Divider />

          {/* Details */}
          <Box className="flex flex-col gap-1.5 text-sm">
            {viewing.agentName && (
              <Box className="flex gap-2">
                <Typography variant="body2" className="text-text-secondary w-32 shrink-0">Agent</Typography>
                <Typography variant="body2">{viewing.agentName}</Typography>
              </Box>
            )}
            {viewing.agentEmail && (
              <Box className="flex gap-2">
                <Typography variant="body2" className="text-text-secondary w-32 shrink-0">Agent email</Typography>
                <MuiLink href={`mailto:${viewing.agentEmail}`} variant="body2">{viewing.agentEmail}</MuiLink>
              </Box>
            )}
            <Box className="flex gap-2">
              <Typography variant="body2" className="text-text-secondary w-32 shrink-0">Requested</Typography>
              <Typography variant="body2">{fmtDate(viewing.requestedAt)}</Typography>
            </Box>
            {viewing.proposedDateTime && (
              <Box className="flex gap-2">
                <Typography variant="body2" className="text-text-secondary w-32 shrink-0">
                  {viewing.status === 'confirmed' ? 'Scheduled for' : 'Was scheduled'}
                </Typography>
                <Typography variant="body2">{fmtDate(viewing.proposedDateTime)}</Typography>
              </Box>
            )}
            {viewing.availabilitySlots && viewing.availabilitySlots.length > 0 && (
              <Box className="flex gap-2">
                <Typography variant="body2" className="text-text-secondary w-32 shrink-0">You offered</Typography>
                <Box className="flex flex-col gap-0.5">
                  {viewing.availabilitySlots.map((slot, i) => (
                    <Typography key={i} variant="body2">{fmtDate(slot)}</Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>

      {!isCancelled && (
        <DialogActions>
          {canAddToCalendar && (
            <>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                onClick={(e) => setCalMenuAnchor(e.currentTarget)}
              >
                Add to Calendar
              </Button>
              <Menu
                anchorEl={calMenuAnchor}
                open={Boolean(calMenuAnchor)}
                onClose={() => setCalMenuAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              >
                <MenuItem onClick={() => { downloadIcs(viewing); setCalMenuAnchor(null) }}>
                  Apple Calendar
                </MenuItem>
                <MenuItem
                  component="a"
                  href={googleCalendarUrl(viewing)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCalMenuAnchor(null)}
                >
                  Google Calendar
                </MenuItem>
                <MenuItem
                  component="a"
                  href={outlookCalendarUrl(viewing)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCalMenuAnchor(null)}
                >
                  Outlook
                </MenuItem>
              </Menu>
            </>
          )}
          <Button
            color="error"
            variant="outlined"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling…' : 'Cancel Viewing'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Calendar event types
// ---------------------------------------------------------------------------
interface ViewingEvent {
  title: string
  start: Date
  end: Date
  type: 'confirmed' | 'availability' | 'cancelled'
  source: Viewing | AvailabilityWindow
}

function buildEvents(viewings: Viewing[], availability: AvailabilityWindow[]): ViewingEvent[] {
  const events: ViewingEvent[] = []

  for (const v of viewings) {
    if (v.status === 'cancelled') {
      const start = new Date(v.proposedDateTime ?? v.requestedAt)
      events.push({ title: v.listingAddress, start, end: new Date(start.getTime() + 60 * 60 * 1000), type: 'cancelled', source: v })
    } else if (v.proposedDateTime) {
      const start = new Date(v.proposedDateTime)
      events.push({ title: v.listingAddress, start, end: new Date(start.getTime() + 60 * 60 * 1000), type: 'confirmed', source: v })
    }
  }

  for (const w of availability) {
    events.push({ title: 'Available for viewings', start: new Date(w.start), end: new Date(w.end), type: 'availability', source: w })
  }

  return events
}

function eventStyleGetter(event: ViewingEvent) {
  const bg =
    event.type === 'confirmed' ? CONFIRMED_COLOR
    : event.type === 'cancelled' ? CANCELLED_COLOR
    : AVAILABILITY_COLOR
  return {
    style: {
      backgroundColor: bg,
      border: 'none',
      borderRadius: '4px',
      color: '#fff',
      fontSize: '12px',
      opacity: event.type === 'availability' ? 0.75 : event.type === 'cancelled' ? 0.7 : 1,
      textDecoration: event.type === 'cancelled' ? 'line-through' : undefined,
    },
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ViewingsPage() {
  const { viewings, isLoading: viewingsLoading, refetch: refetchViewings } = useViewings()
  const { profile, isLoading: profileLoading, refetch: refetchProfile } = useUserProfile()

  const [selectedEvent, setSelectedEvent] = useState<ViewingEvent | null>(null)

  useEffect(() => {
    refetchViewings()
    refetchProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const availability = profile?.availability ?? []
  const events = useMemo(() => buildEvents(viewings, availability), [viewings, availability])
  const isLoading = viewingsLoading || profileLoading

  const defaultDate = useMemo(() => {
    if (events.length === 0) return new Date()
    const now = new Date()
    const future = events.filter((e) => e.start >= now)
    if (future.length > 0) return future.reduce((a, b) => (a.start < b.start ? a : b)).start
    return events.reduce((a, b) => (a.start > b.start ? a : b)).start
  }, [events])

  function handleEventSelect(event: object) {
    setSelectedEvent(event as ViewingEvent)
  }

  return (
    <Box className="flex flex-col gap-4 max-w-6xl mx-auto">
      <Box className="px-4 pt-4">
        <Typography variant="h5" className="font-heading font-bold">Viewing Calendar</Typography>
        <Typography variant="body2" className="text-text-secondary mt-0.5">
          Confirmed viewings and your availability windows
        </Typography>
      </Box>

      {/* Legend */}
      <Box className="flex items-center gap-5 px-4">
        <Box className="flex items-center gap-2">
          <Box className="h-3 w-3 rounded-sm" style={{ backgroundColor: CONFIRMED_COLOR }} />
          <Typography variant="caption" className="text-text-secondary">Confirmed viewing</Typography>
        </Box>
        <Box className="flex items-center gap-2">
          <Box className="h-3 w-3 rounded-sm" style={{ backgroundColor: AVAILABILITY_COLOR }} />
          <Typography variant="caption" className="text-text-secondary">Your availability</Typography>
        </Box>
        <Box className="flex items-center gap-2">
          <Box className="h-3 w-3 rounded-sm" style={{ backgroundColor: CANCELLED_COLOR }} />
          <Typography variant="caption" className="text-text-secondary">Cancelled</Typography>
        </Box>
      </Box>

      {isLoading ? (
        <Typography variant="body2" className="text-text-secondary px-4 py-8 text-center">Loading…</Typography>
      ) : (
        <Box
          className="mx-4 overflow-hidden rounded-2xl border border-grey-100 bg-background-paper shadow-xs"
          sx={{
            height: 'calc(100vh - 260px)',
            minHeight: 480,
            '& .rbc-toolbar': { padding: '12px 16px', gap: '8px' },
            '& .rbc-toolbar button': {
              borderRadius: '8px',
              border: '1px solid var(--grey-100)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxShadow: 'none',
              backgroundImage: 'none',
            },
            '& .rbc-toolbar button.rbc-active': {
              backgroundColor: 'hsl(var(--primary))',
              borderColor: 'hsl(var(--primary))',
              color: '#fff',
              boxShadow: 'none',
            },
            '& .rbc-today': { backgroundColor: 'rgba(0,191,235,0.05)' },
            '& .rbc-header': { fontSize: '12px', fontWeight: 600, padding: '8px 4px' },
            '& .rbc-event:focus': { outline: 'none' },
          }}
        >
          <Calendar
            localizer={localizer}
            events={events}
            defaultView="month"
            defaultDate={defaultDate}
            views={['month', 'week', 'day', 'agenda']}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            eventPropGetter={eventStyleGetter as any}
            onSelectEvent={handleEventSelect}
            style={{ height: '100%' }}
          />
        </Box>
      )}

      {/* Dialogs */}
      {selectedEvent?.type === 'availability' && (
        <AvailabilityDialog
          window={selectedEvent.source as AvailabilityWindow}
          allWindows={availability}
          onClose={() => setSelectedEvent(null)}
          onSaved={refetchProfile}
        />
      )}
      {(selectedEvent?.type === 'confirmed' || selectedEvent?.type === 'cancelled') && (
        <ViewingDialog
          viewing={selectedEvent.source as Viewing}
          listingPreference={profile?.listingViewingPreference}
          onClose={() => setSelectedEvent(null)}
          onCancelled={refetchViewings}
        />
      )}
    </Box>
  )
}
