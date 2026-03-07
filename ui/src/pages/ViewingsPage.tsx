import { useMemo, useEffect } from 'react'
import { Box, Typography } from '@mui/material'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { useViewings, type Viewing } from '@/hooks/useViewings'
import { useUserProfile, type AvailabilityWindow } from '@/hooks/useUserProfile'

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

const CONFIRMED_COLOR = '#16a34a'
const AVAILABILITY_COLOR = '#f59e0b'

interface ViewingEvent {
  title: string
  start: Date
  end: Date
  type: 'confirmed' | 'availability'
  source: Viewing | AvailabilityWindow
}

function buildEvents(viewings: Viewing[], availability: AvailabilityWindow[]): ViewingEvent[] {
  const events: ViewingEvent[] = []

  // Confirmed viewing appointments
  for (const v of viewings) {
    if (v.proposedDateTime) {
      const start = new Date(v.proposedDateTime)
      events.push({
        title: v.listingAddress,
        start,
        end: new Date(start.getTime() + 60 * 60 * 1000),
        type: 'confirmed',
        source: v,
      })
    }
  }

  // User's availability windows from profile (shown for context across all viewings)
  for (const w of availability) {
    events.push({
      title: 'Available for viewings',
      start: new Date(w.start),
      end: new Date(w.end),
      type: 'availability',
      source: w,
    })
  }

  return events
}

function eventStyleGetter(event: ViewingEvent) {
  const bg = event.type === 'confirmed' ? CONFIRMED_COLOR : AVAILABILITY_COLOR
  return {
    style: {
      backgroundColor: bg,
      border: 'none',
      borderRadius: '4px',
      color: '#fff',
      fontSize: '12px',
      opacity: event.type === 'availability' ? 0.75 : 1,
    },
  }
}

export default function ViewingsPage() {
  const { viewings, isLoading: viewingsLoading, refetch: refetchViewings } = useViewings()
  const { profile, isLoading: profileLoading, refetch: refetchProfile } = useUserProfile()

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
      </Box>

      {isLoading ? (
        <Typography variant="body2" className="text-text-secondary px-4 py-8 text-center">
          Loading…
        </Typography>
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
            },
            '& .rbc-toolbar button.rbc-active': {
              backgroundColor: 'var(--primary)',
              borderColor: 'var(--primary)',
              color: '#fff',
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
            style={{ height: '100%' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tooltipAccessor={(event: any) =>
              (event as ViewingEvent).type === 'confirmed'
                ? `Confirmed: ${(event as ViewingEvent).title}`
                : 'Your availability window'
            }
          />
        </Box>
      )}
    </Box>
  )
}
