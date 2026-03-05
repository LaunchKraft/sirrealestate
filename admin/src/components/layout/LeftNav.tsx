import { NavLink } from 'react-router-dom'
import { Box, Drawer, List, ListItemButton, ListItemText, Typography } from '@mui/material'

const NAV_WIDTH = 240

const navItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Users', to: '/users' },
  { label: 'Documents', to: '/documents' },
  { label: 'Viewings', to: '/viewings' },
  { label: 'Offers', to: '/offers' },
]

interface LeftNavProps {
  open: boolean
  onClose: () => void
  variant: 'permanent' | 'temporary'
}

function NavContent({ onClose }: { onClose?: () => void }) {
  return (
    <Box className="flex flex-col h-full">
      <Box className="h-20 flex items-center px-6 border-b border-grey-100">
        <Typography variant="subtitle2" className="text-text-muted font-semibold tracking-widest uppercase text-xs">
          Navigation
        </Typography>
      </Box>
      <List disablePadding className="flex-1 py-3">
        {navItems.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={onClose}
            className="mx-3 rounded-lg mb-0.5"
            sx={{
              '&.active': {
                bgcolor: 'hsl(var(--primary) / 0.1)',
                color: 'hsl(var(--primary))',
                fontWeight: 700,
              },
            }}
          >
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ variant: 'body1', fontWeight: 'inherit' }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )
}

export default function LeftNav({ open, onClose, variant }: LeftNavProps) {
  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={{
        width: variant === 'permanent' ? NAV_WIDTH : undefined,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: NAV_WIDTH,
          boxSizing: 'border-box',
          border: 'none',
          bgcolor: 'hsl(var(--background-paper))',
          boxShadow: 'var(--shadow-sm)',
        },
      }}
    >
      <NavContent onClose={variant === 'temporary' ? onClose : undefined} />
    </Drawer>
  )
}
