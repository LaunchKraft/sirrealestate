import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Box, Button, Chip, Divider, Menu, MenuItem, Popover, Typography } from '@mui/material'
import { useLayoutContext } from '@/components/layout/layout-context'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'
import logo from '@/assets/logo.png'
import { Menu as MenuIcon, Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useUserProfile } from '@/hooks/useUserProfile'
import { useNotifications, type AppNotification } from '@/hooks/useNotifications'

const TYPE_LABEL: Record<string, string> = {
  new_listing: 'New Listing Match',
  viewing_request: 'Viewing Request',
  viewing_confirmation: 'Viewing Confirmation',
  viewing_feedback_request: 'Feedback Request',
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function NotificationRow({ n }: { n: AppNotification }) {
  const isToUser = !n.direction || n.direction === 'to_user'
  return (
    <Box className="flex flex-col gap-0.5 px-4 py-2.5">
      <Box className="flex items-center justify-between gap-2">
        <Box className="flex items-center gap-1.5">
          <Chip
            label={isToUser ? 'To you' : 'On your behalf'}
            size="small"
            color={isToUser ? 'primary' : 'secondary'}
            variant="outlined"
            sx={{ height: 18, fontSize: '0.6rem', borderRadius: '4px' }}
          />
          <Typography variant="caption" className="text-text-secondary font-medium">
            {TYPE_LABEL[n.type] ?? n.type}
          </Typography>
        </Box>
        <Typography variant="caption" className="text-text-disabled shrink-0">
          {timeAgo(n.sentAt)}
        </Typography>
      </Box>
      <Typography variant="caption" className="text-text-primary line-clamp-1">
        {n.subject}
      </Typography>
    </Box>
  )
}

export default function Header() {
  const navigate = useNavigate()
  const { toggleSidebar } = useLayoutContext()
  const { email, signOut } = useAuth()
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null)
  const [bellAnchor, setBellAnchor] = useState<null | HTMLElement>(null)
  const { profile, refetch: refetchProfile } = useUserProfile()
  const { notifications, refetch: refetchNotifications } = useNotifications()
  const {} = useSidebarRefresh()

  useEffect(() => { refetchProfile() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : email ? email.slice(0, 2).toUpperCase() : 'SR'

  const handleBellClick = (e: React.MouseEvent<HTMLElement>) => {
    setBellAnchor(e.currentTarget)
    refetchNotifications()
  }

  const recent = notifications.slice(0, 3)

  return (
    <Box className="mui-fixed fixed z-20 h-20 w-full" component="header">
      <Box
        className="bg-background-paper shadow-darker-xs flex h-full w-full flex-row items-center rounded-b-3xl px-4 sm:px-6"
      >
        {/* Mobile/desktop sidebar toggle */}
        <Button
          variant="text"
          size="large"
          color="text-primary"
          className="icon-only hover-icon-shrink hover:bg-grey-25 me-2"
          onClick={toggleSidebar}
          startIcon={<MenuIcon size={24} />}
        />

        {/* Logo */}
        <Box className="flex flex-1 items-center">
          <Link to="/chat" className="flex items-center gap-2 no-underline">
            <img src={logo} alt="Sir Realtor" className="h-14 w-auto" />
            <Typography variant="h6" className="font-heading font-bold tracking-tight text-primary" sx={{ fontWeight: 700, fontSize: '1.5rem' }}>
              Sir Realtor
            </Typography>
          </Link>
        </Box>

        {/* Notifications bell */}
        <Button
          variant="text"
          size="medium"
          color="grey"
          className="icon-only"
          sx={{ mr: 1.5 }}
          onClick={handleBellClick}
          startIcon={<Bell size={20} />}
        />

        {/* Notifications popover */}
        <Popover
          open={Boolean(bellAnchor)}
          anchorEl={bellAnchor}
          onClose={() => setBellAnchor(null)}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          slotProps={{ paper: { sx: { width: 320, mt: 1 } } }}
        >
          <Box className="px-4 py-2.5 border-b border-grey-100">
            <Typography variant="subtitle2" className="font-semibold">Notifications</Typography>
          </Box>
          {recent.length === 0 ? (
            <Box className="px-4 py-6 text-center">
              <Typography variant="caption" className="text-text-secondary italic">
                No notifications yet
              </Typography>
            </Box>
          ) : (
            recent.map((n, i) => (
              <Box key={n.notificationId}>
                <NotificationRow n={n} />
                {i < recent.length - 1 && <Divider />}
              </Box>
            ))
          )}
          <Divider />
          <Button
            fullWidth
            size="small"
            variant="text"
            sx={{ py: 1.5, borderRadius: 0 }}
            onClick={() => { setBellAnchor(null); navigate('/notifications') }}
          >
            Show all Notifications
          </Button>
        </Popover>

        {/* User avatar */}
        <Avatar
          onClick={(e) => setUserMenuAnchor(e.currentTarget)}
          className="bg-primary cursor-pointer text-sm font-semibold"
          sx={{ width: 36, height: 36 }}
        >
          {initials}
        </Avatar>

        <Menu
          anchorEl={userMenuAnchor}
          open={Boolean(userMenuAnchor)}
          onClose={() => setUserMenuAnchor(null)}
          className="mt-1"
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem disabled>
            <Typography variant="body2" className="text-text-secondary">
              {email}
            </Typography>
          </MenuItem>
          <MenuItem
            onClick={async () => {
              setUserMenuAnchor(null)
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            Sign out
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  )
}
