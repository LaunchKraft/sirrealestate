import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl, InputLabel,
  FormControlLabel, Checkbox, Typography, Box, Divider,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, CircularProgress,
} from '@mui/material'
import { api, type AdminUser } from '@/services/api'

interface SearchCriteria {
  city?: string
  state?: string
  bedrooms?: number
  bathrooms?: number
  minPrice?: number
  maxPrice?: number
}

interface SearchProfile {
  profileId: string
  name: string
  isDefault: boolean
  monitoring: boolean
  criteria?: SearchCriteria
}

interface ProfileForm {
  firstName: string
  lastName: string
  phone: string
  buyerStatus: string
  preApproved: boolean
  preApprovalAmount: string
  firstTimeHomeBuyer: boolean
  currentCity: string
  currentState: string
  desiredCity: string
  desiredState: string
  listingViewingPreference: string
}

function emptyForm(): ProfileForm {
  return {
    firstName: '', lastName: '', phone: '',
    buyerStatus: '', preApproved: false, preApprovalAmount: '',
    firstTimeHomeBuyer: false,
    currentCity: '', currentState: '',
    desiredCity: '', desiredState: '',
    listingViewingPreference: '',
  }
}

function profileToForm(profile: Record<string, unknown>): ProfileForm {
  return {
    firstName: (profile.firstName as string) ?? '',
    lastName: (profile.lastName as string) ?? '',
    phone: (profile.phone as string) ?? '',
    buyerStatus: (profile.buyerStatus as string) ?? '',
    preApproved: (profile.preApproved as boolean) ?? false,
    preApprovalAmount: profile.preApprovalAmount !== undefined && profile.preApprovalAmount !== null
      ? String(profile.preApprovalAmount) : '',
    firstTimeHomeBuyer: (profile.firstTimeHomeBuyer as boolean) ?? false,
    currentCity: (profile.currentCity as string) ?? '',
    currentState: (profile.currentState as string) ?? '',
    desiredCity: (profile.desiredCity as string) ?? '',
    desiredState: (profile.desiredState as string) ?? '',
    listingViewingPreference: (profile.listingViewingPreference as string) ?? '',
  }
}

function formatPrice(v?: number) {
  if (v === undefined || v === null) return ''
  return `$${v.toLocaleString()}`
}

function formatPriceRange(min?: number, max?: number) {
  if (!min && !max) return '—'
  if (min && max) return `${formatPrice(min)} – ${formatPrice(max)}`
  if (min) return `≥ ${formatPrice(min)}`
  return `≤ ${formatPrice(max)}`
}

interface UserDetailDialogProps {
  user: AdminUser | null
  open: boolean
  onClose: () => void
  onUserUpdated?: (userId: string) => void
}

export default function UserDetailDialog({ user, open, onClose, onUserUpdated }: UserDetailDialogProps) {
  const [form, setForm] = useState<ProfileForm>(emptyForm())
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([])
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    if (user.profile) {
      setForm(profileToForm(user.profile))
      setSearchProfiles((user.profile.searchProfiles as SearchProfile[]) ?? [])
    } else {
      setForm(emptyForm())
      setSearchProfiles([])
    }
    setError(null)
  }, [user])

  const handleChange = (field: keyof ProfileForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        phone: form.phone || null,
        buyerStatus: form.buyerStatus || null,
        preApproved: form.preApproved,
        preApprovalAmount: form.preApproved && form.preApprovalAmount ? Number(form.preApprovalAmount) : null,
        firstTimeHomeBuyer: form.firstTimeHomeBuyer,
        currentCity: form.currentCity || null,
        currentState: form.currentState || null,
        desiredCity: form.desiredCity || null,
        desiredState: form.desiredState || null,
        listingViewingPreference: form.listingViewingPreference || null,
      }
      await api.profile.update(user.userId, payload)
      onUserUpdated?.(user.userId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProfile = async (profileId: string) => {
    if (!user) return
    setDeletingId(profileId)
    setError(null)
    try {
      await api.profile.deleteSearchProfile(user.userId, profileId)
      setSearchProfiles((prev) => prev.filter((p) => p.profileId !== profileId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete search profile')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Typography variant="h6" className="font-heading font-bold">{user?.email}</Typography>
        <Typography variant="body2" className="text-text-muted">{user?.userId}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Typography color="error" className="mb-4">{error}</Typography>
        )}

        <Typography variant="subtitle1" className="font-semibold mb-3">Profile</Typography>
        {!user?.profile && (
          <Typography className="text-text-muted mb-4">No profile on file. Fields below will create one on save.</Typography>
        )}

        <Box className="grid grid-cols-2 gap-4 mb-6">
          <TextField
            label="First Name"
            size="small"
            value={form.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
          />
          <TextField
            label="Last Name"
            size="small"
            value={form.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
          />
          <TextField
            label="Phone"
            size="small"
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
          />
          <FormControl size="small">
            <InputLabel>Buyer Status</InputLabel>
            <Select
              label="Buyer Status"
              value={form.buyerStatus}
              onChange={(e) => handleChange('buyerStatus', e.target.value)}
            >
              <MenuItem value="">—</MenuItem>
              <MenuItem value="browsing">Browsing</MenuItem>
              <MenuItem value="actively_looking">Actively Looking</MenuItem>
              <MenuItem value="ready_to_offer">Ready to Offer</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Current City"
            size="small"
            value={form.currentCity}
            onChange={(e) => handleChange('currentCity', e.target.value)}
          />
          <TextField
            label="Current State"
            size="small"
            value={form.currentState}
            onChange={(e) => handleChange('currentState', e.target.value)}
          />
          <TextField
            label="Desired City"
            size="small"
            value={form.desiredCity}
            onChange={(e) => handleChange('desiredCity', e.target.value)}
          />
          <TextField
            label="Desired State"
            size="small"
            value={form.desiredState}
            onChange={(e) => handleChange('desiredState', e.target.value)}
          />
          <FormControl size="small">
            <InputLabel>Listing Preference</InputLabel>
            <Select
              label="Listing Preference"
              value={form.listingViewingPreference}
              onChange={(e) => handleChange('listingViewingPreference', e.target.value)}
            >
              <MenuItem value="">—</MenuItem>
              <MenuItem value="zillow">Zillow</MenuItem>
              <MenuItem value="redfin">Redfin</MenuItem>
              <MenuItem value="realtor">Realtor.com</MenuItem>
            </Select>
          </FormControl>
          <Box className="flex flex-col gap-1 justify-center">
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={form.preApproved}
                  onChange={(e) => handleChange('preApproved', e.target.checked)}
                />
              }
              label="Pre-Approved"
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={form.firstTimeHomeBuyer}
                  onChange={(e) => handleChange('firstTimeHomeBuyer', e.target.checked)}
                />
              }
              label="First-Time Home Buyer"
            />
          </Box>
          {form.preApproved && (
            <TextField
              label="Pre-Approval Amount"
              size="small"
              type="number"
              value={form.preApprovalAmount}
              onChange={(e) => handleChange('preApprovalAmount', e.target.value)}
            />
          )}
        </Box>

        <Divider className="mb-4" />

        <Typography variant="subtitle1" className="font-semibold mb-3">Search Profiles</Typography>
        {searchProfiles.length === 0 ? (
          <Typography className="text-text-muted">No search profiles.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Default</TableCell>
                <TableCell>Monitoring</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Beds / Baths</TableCell>
                <TableCell>Price Range</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {searchProfiles.map((p) => (
                <TableRow key={p.profileId}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={p.isDefault ? 'Yes' : 'No'}
                      size="small"
                      color={p.isDefault ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={p.monitoring ? 'On' : 'Off'}
                      size="small"
                      color={p.monitoring ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {[p.criteria?.city, p.criteria?.state].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    {[p.criteria?.bedrooms, p.criteria?.bathrooms]
                      .filter((v) => v !== undefined && v !== null)
                      .join(' / ') || '—'}
                  </TableCell>
                  <TableCell>
                    {formatPriceRange(p.criteria?.minPrice, p.criteria?.maxPrice)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      color="error"
                      disabled={deletingId === p.profileId}
                      onClick={() => handleDeleteProfile(p.profileId)}
                    >
                      {deletingId === p.profileId ? <CircularProgress size={14} /> : 'Delete'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Save Profile'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
