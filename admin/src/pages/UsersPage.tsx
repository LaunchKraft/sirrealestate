import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { api, type AdminUser } from '@/services/api'
import UserDetailDialog from '@/components/UserDetailDialog'

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const fetchUsers = () => {
    setLoading(true)
    api.users.list()
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  const handleToggleEnabled = async (user: AdminUser) => {
    setTogglingId(user.userId)
    try {
      await api.users.setEnabled(user.userId, !user.enabled)
      setUsers((prev) =>
        prev.map((u) => u.userId === user.userId ? { ...u, enabled: !u.enabled } : u),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    } finally {
      setTogglingId(null)
    }
  }

  const columns: GridColDef<AdminUser>[] = [
    {
      field: 'email',
      headerName: 'Email',
      flex: 2,
      minWidth: 200,
      renderCell: ({ row }) => (
        <Button
          variant="text"
          size="small"
          sx={{ textTransform: 'none', justifyContent: 'flex-start', p: 0, minWidth: 0 }}
          onClick={() => setSelectedUser(row)}
        >
          {row.email}
        </Button>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 160,
      renderCell: ({ row }) => (
        <Chip
          label={row.status}
          size="small"
          color={row.status === 'CONFIRMED' ? 'success' : 'warning'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'enabled',
      headerName: 'Enabled',
      width: 100,
      renderCell: ({ row }) => (
        <Chip
          label={row.enabled ? 'Yes' : 'No'}
          size="small"
          color={row.enabled ? 'success' : 'error'}
        />
      ),
    },
    {
      field: 'profile',
      headerName: 'Has Profile',
      width: 120,
      renderCell: ({ row }) => (
        <Chip label={row.profile ? 'Yes' : 'No'} size="small" variant="outlined" />
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      flex: 1,
      minWidth: 160,
      valueFormatter: (value: string) => value ? new Date(value).toLocaleDateString() : '—',
    },
    {
      field: 'actions',
      headerName: '',
      width: 120,
      sortable: false,
      renderCell: ({ row }) => (
        <Button
          size="small"
          variant="outlined"
          color={row.enabled ? 'error' : 'success'}
          disabled={togglingId === row.userId}
          onClick={() => handleToggleEnabled(row)}
        >
          {togglingId === row.userId
            ? <CircularProgress size={14} />
            : row.enabled ? 'Disable' : 'Enable'}
        </Button>
      ),
    },
  ]

  if (error) return <Typography color="error">{error}</Typography>

  return (
    <Box className="flex flex-col gap-4">
      <Typography variant="h5" className="font-heading font-bold">Users</Typography>
      <DataGrid
        rows={users}
        columns={columns}
        getRowId={(row) => row.userId}
        loading={loading}
        autoHeight
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
      <UserDetailDialog
        user={selectedUser}
        open={selectedUser !== null}
        onClose={() => setSelectedUser(null)}
        onUserUpdated={fetchUsers}
      />
    </Box>
  )
}
