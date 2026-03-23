import { useEffect, useState } from 'react'
import {
  Box, Chip, Collapse, Divider, IconButton, Typography,
} from '@mui/material'
import { ChevronRight } from 'lucide-react'
import { useNotifications, type AppNotification } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  new_listing: 'New Listing Match',
  viewing_request: 'Viewing Request',
  viewing_confirmation: 'Viewing Confirmation',
  viewing_feedback_request: 'Feedback Request',
}

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function NotificationItem({ n }: { n: AppNotification }) {
  const [expanded, setExpanded] = useState(false)
  const isToUser = !n.direction || n.direction === 'to_user'

  return (
    <Box>
      <Box
        className={cn(
          'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-grey-25 transition-colors',
          expanded && 'bg-grey-25',
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Direction + channel chips */}
        <Box className="flex flex-col gap-1 pt-0.5 shrink-0 w-28">
          <Chip
            label={isToUser ? 'To you' : 'On your behalf'}
            size="small"
            color={isToUser ? 'primary' : 'secondary'}
            variant="outlined"
            sx={{ height: 18, fontSize: '0.6rem', borderRadius: '4px' }}
          />
          <Chip
            label={CHANNEL_LABEL[n.channel] ?? n.channel}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.6rem', borderRadius: '4px', alignSelf: 'flex-start' }}
          />
        </Box>

        {/* Subject + type */}
        <Box className="flex-1 min-w-0">
          <Typography variant="body2" className="font-medium truncate">
            {n.subject}
          </Typography>
          <Typography variant="caption" className="text-text-secondary">
            {TYPE_LABEL[n.type] ?? n.type} · {n.recipientAddress}
          </Typography>
        </Box>

        {/* Date + expand toggle */}
        <Box className="flex items-center gap-1 shrink-0">
          <Typography variant="caption" className="text-text-disabled">
            {timeAgo(n.sentAt)}
          </Typography>
          {n.body && (
            <IconButton size="small" sx={{ p: 0.25 }}>
              <ChevronRight
                size={16}
                className={cn('transition-transform', expanded && 'rotate-90')}
              />
            </IconButton>
          )}
          {n.status === 'failed' && (
            <Chip label="Failed" size="small" color="error" variant="outlined" sx={{ height: 16, fontSize: '0.6rem' }} />
          )}
        </Box>
      </Box>

      {/* Body */}
      {n.body && (
        <Collapse in={expanded}>
          <Box className="border-t border-grey-100 bg-grey-20">
            <iframe
              srcDoc={n.body}
              sandbox="allow-same-origin"
              title={n.subject}
              style={{ width: '100%', border: 'none', minHeight: 320, display: 'block' }}
              onLoad={(e) => {
                const iframe = e.currentTarget
                const height = iframe.contentDocument?.body?.scrollHeight
                if (height) iframe.style.height = `${height + 32}px`
              }}
            />
          </Box>
        </Collapse>
      )}
      <Divider />
    </Box>
  )
}

export default function NotificationsPage() {
  const { notifications, isLoading, error, refetch } = useNotifications()

  useEffect(() => { refetch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box className="flex flex-col gap-0 max-w-3xl mx-auto">
      <Box className="px-4 py-4">
        <Typography variant="h5" className="font-heading font-bold">Notifications</Typography>
        <Typography variant="body2" className="text-text-secondary mt-0.5">
          All messages sent to you or on your behalf
        </Typography>
      </Box>

      <Box className="rounded-2xl overflow-hidden border border-grey-100 bg-background-paper shadow-xs">
        {isLoading && (
          <Typography variant="body2" className="text-text-secondary px-4 py-6 text-center">
            Loading…
          </Typography>
        )}
        {error && (
          <Typography variant="body2" color="error" className="px-4 py-6 text-center">
            {error}
          </Typography>
        )}
        {!isLoading && !error && notifications.length === 0 && (
          <Typography variant="body2" className="text-text-secondary px-4 py-10 text-center italic">
            No notifications yet
          </Typography>
        )}
        {notifications.map((n) => (
          <NotificationItem key={n.notificationId} n={n} />
        ))}
      </Box>
    </Box>
  )
}
