import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Box, Button, Menu, MenuItem, Typography } from '@mui/material'
import { useLayoutContext } from '@/components/layout/layout-context'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'
import logo from '@/assets/logo.png'
import NiMenuSplit from '@/icons/nexture/ni-menu-split'
import NiBell from '@/icons/nexture/ni-bell'
import { useAuth } from '@/hooks/useAuth'
import { useUserProfile } from '@/hooks/useUserProfile'

export default function Header() {
  const navigate = useNavigate()
  const { toggleSidebar } = useLayoutContext()
  const { email, signOut } = useAuth()
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null)
  const { profile, refetch: refetchProfile } = useUserProfile()
  const {} = useSidebarRefresh()

  useEffect(() => { refetchProfile() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : email ? email.slice(0, 2).toUpperCase() : 'SR'

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
          startIcon={<NiMenuSplit size={24} />}
        />

        {/* Logo */}
        <Box className="flex flex-1 items-center">
          <Link to="/chat" className="flex items-center gap-2 no-underline">
            <img src={logo} alt="Sir Realtor" className="h-14 w-auto" />
            <Typography variant="h6" className="font-heading font-bold tracking-tight text-primary">
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
          onClick={toggleSidebar}
          startIcon={<NiBell size="medium" />}
        />

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
