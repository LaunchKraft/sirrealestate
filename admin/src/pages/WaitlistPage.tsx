import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { api, type WaitlistEntry } from '@/services/api'

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success'> = {
  waitlist: 'warning',
  invited_beta: 'info',
  accepted_beta: 'success',
}

const STATUS_LABELS: Record<string, string> = {
  waitlist: 'Waitlist',
  invited_beta: 'Invited (Beta)',
  accepted_beta: 'Accepted (Beta)',
}

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioningEmail, setActioningEmail] = useState<string | null>(null)

  const fetchEntries = () => {
    setLoading(true)
    api.waitlist
      .list()
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchEntries() }, [])

  const handleInvite = async (email: string) => {
    setActioningEmail(email)
    try {
      await api.waitlist.invite(email)
      setEntries((prev) =>
        prev.map((e) => e.email === email ? { ...e, status: 'invited_beta' } : e),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invite')
    } finally {
      setActioningEmail(null)
    }
  }

  const handleStatusChange = async (email: string, status: string) => {
    setActioningEmail(email)
    try {
      await api.waitlist.updateStatus(email, status)
      setEntries((prev) =>
        prev.map((e) => e.email === email ? { ...e, status: status as WaitlistEntry['status'] } : e),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setActioningEmail(null)
    }
  }

  const handleDelete = async (email: string) => {
    setActioningEmail(email)
    try {
      await api.waitlist.delete(email)
      setEntries((prev) => prev.filter((e) => e.email !== email))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete entry')
    } finally {
      setActioningEmail(null)
    }
  }

  const columns: GridColDef<WaitlistEntry>[] = [
    { field: 'email', headerName: 'Email', flex: 2, minWidth: 220 },
    {
      field: 'status',
      headerName: 'Status',
      width: 180,
      renderCell: ({ row }) => (
        <Chip
          label={STATUS_LABELS[row.status] ?? row.status}
          size="small"
          color={STATUS_COLORS[row.status] ?? 'default'}
        />
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Joined',
      flex: 1,
      minWidth: 140,
      valueFormatter: (value: string) => value ? new Date(value).toLocaleDateString() : '—',
    },
    {
      field: 'actions',
      headerName: '',
      width: 300,
      sortable: false,
      renderCell: ({ row }) => {
        const busy = actioningEmail === row.email
        return (
          <Box className="flex items-center gap-2">
            {row.status === 'waitlist' && (
              <Button
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => handleInvite(row.email)}
              >
                {busy ? <CircularProgress size={14} /> : 'Invite'}
              </Button>
            )}
            <Select
              size="small"
              value={row.status}
              disabled={busy}
              onChange={(e: SelectChangeEvent) => handleStatusChange(row.email, e.target.value)}
              sx={{ fontSize: '0.75rem', height: 30 }}
            >
              <MenuItem value="waitlist">Waitlist</MenuItem>
              <MenuItem value="invited_beta">Invited (Beta)</MenuItem>
              <MenuItem value="accepted_beta">Accepted (Beta)</MenuItem>
            </Select>
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={busy}
              onClick={() => handleDelete(row.email)}
            >
              Delete
            </Button>
          </Box>
        )
      },
    },
  ]

  if (error) return <Typography color="error">{error}</Typography>

  return (
    <Box className="flex flex-col gap-4">
      <Box className="flex items-center justify-between">
        <Typography variant="h5" className="font-heading font-bold">Waitlist</Typography>
        <Typography variant="body2" className="text-text-secondary">{entries.length} entries</Typography>
      </Box>
      <DataGrid
        rows={entries}
        columns={columns}
        getRowId={(row) => row.email}
        loading={loading}
        autoHeight
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  )
}
