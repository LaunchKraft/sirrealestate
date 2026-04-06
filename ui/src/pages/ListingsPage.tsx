import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Typography,
  type SelectChangeEvent,
} from '@mui/material'
import { useSearchResults } from '@/hooks/useSearchResults'
import { useUserProfile } from '@/hooks/useUserProfile'
import ListingsTable from './listings/ListingsTable'
import ListingsMap from './listings/ListingsMap'
import ListingDetailDialog from './listings/ListingDetailDialog'
import type { SearchResult } from '@/hooks/useSearchResults'

type View = 'list' | 'map'

const SLIDER_MAX = 3_000_000
const SLIDER_STEP = 25_000

const PROPERTY_TYPE_OPTIONS = [
  { value: 'single_family', label: 'House / Single Family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'multi_family', label: 'Multi-Family' },
  { value: 'land', label: 'Land' },
  { value: 'mobile', label: 'Mobile / Manufactured' },
]

const BED_BATH_OPTIONS = [
  { value: 0, label: 'Any' },
  { value: 1, label: '1+' },
  { value: 2, label: '2+' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
  { value: 5, label: '5+' },
]

function fmtPrice(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  return `$${Math.round(v / 1000)}k`
}

interface FilterState {
  priceRange: [number, number]
  minBeds: number
  minBaths: number
  propertyTypes: string[]
}

function defaultFilter(criteria?: { minPrice?: number; maxPrice?: number; bedrooms?: number; bathrooms?: number; propertyType?: string }): FilterState {
  return {
    priceRange: [criteria?.minPrice ?? 0, criteria?.maxPrice ?? SLIDER_MAX],
    minBeds: criteria?.bedrooms ?? 0,
    minBaths: criteria?.bathrooms ?? 0,
    propertyTypes: criteria?.propertyType ? [criteria.propertyType] : [],
  }
}

function filtersEqual(a: FilterState, b: FilterState): boolean {
  return (
    a.priceRange[0] === b.priceRange[0] &&
    a.priceRange[1] === b.priceRange[1] &&
    a.minBeds === b.minBeds &&
    a.minBaths === b.minBaths &&
    a.propertyTypes.length === b.propertyTypes.length &&
    a.propertyTypes.every((t) => b.propertyTypes.includes(t))
  )
}

const fieldSx = { bgcolor: 'white', borderRadius: 1, minWidth: 110 }

export default function ListingsPage() {
  const { profileId } = useParams<{ profileId: string }>()
  const { grouped, refetch } = useSearchResults()
  const { profile, refetch: refetchProfile } = useUserProfile()

  const [view, setView] = useState<View>('list')
  const [selectedListing, setSelectedListing] = useState<SearchResult | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [draft, setDraft] = useState<FilterState>(() => defaultFilter())
  const [applied, setApplied] = useState<FilterState>(() => defaultFilter())
  const initializedForProfile = useRef<string | undefined>(undefined)

  useEffect(() => {
    refetch()
    refetchProfile()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const results = grouped[profileId ?? ''] ?? []
  const searchProfile = profile?.searchProfiles.find((p) => p.profileId === profileId)

  // Initialize filter from search profile criteria (once per profile)
  useEffect(() => {
    if (!searchProfile || initializedForProfile.current === profileId) return
    initializedForProfile.current = profileId
    const init = defaultFilter(searchProfile.criteria)
    setDraft(init)
    setApplied(init)
  }, [searchProfile, profileId])

  const isDirty = !filtersEqual(draft, applied)

  const filtered = useMemo(() => {
    return results.filter((r) => {
      const l = r.listingData
      if (applied.priceRange[0] > 0 && l.price < applied.priceRange[0]) return false
      if (applied.priceRange[1] < SLIDER_MAX && l.price > applied.priceRange[1]) return false
      if (applied.minBeds > 0 && l.bedrooms < applied.minBeds) return false
      if (applied.minBaths > 0 && l.bathrooms < applied.minBaths) return false
      if (applied.propertyTypes.length > 0 && l.propertyType && !applied.propertyTypes.includes(l.propertyType)) return false
      return true
    })
  }, [results, applied])

  function handleListingSelect(result: SearchResult) {
    setSelectedListing(result)
    setDialogOpen(true)
  }

  const criteriaPills: string[] = []
  if (searchProfile) {
    const c = searchProfile.criteria
    if (c.bedrooms) criteriaPills.push(`${c.bedrooms} bed`)
    if (c.bathrooms) criteriaPills.push(`${c.bathrooms} bath`)
    if (c.city && c.state) criteriaPills.push(`${c.city}, ${c.state}`)
    else if (c.city) criteriaPills.push(c.city)
    else if (c.state) criteriaPills.push(c.state)
    if (c.minPrice) criteriaPills.push(`from $${Math.round(c.minPrice / 1000)}k`)
    if (c.maxPrice) criteriaPills.push(`up to $${Math.round(c.maxPrice / 1000)}k`)
    if (c.propertyType) criteriaPills.push(c.propertyType.replace(/_/g, ' '))
  }

  const priceLabel = (() => {
    const [lo, hi] = draft.priceRange
    if (lo === 0 && hi >= SLIDER_MAX) return 'Any price'
    if (lo === 0) return `Up to ${fmtPrice(hi)}`
    if (hi >= SLIDER_MAX) return `${fmtPrice(lo)}+`
    return `${fmtPrice(lo)} – ${fmtPrice(hi)}`
  })()

  return (
    <Box className="flex flex-col gap-4">
      {/* Page header */}
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex flex-col gap-1">
          <Typography variant="h6" className="font-semibold">
            {searchProfile?.name ?? 'Listings'}
          </Typography>
          <Box className="flex flex-wrap gap-1">
            {criteriaPills.map((pill) => (
              <Chip key={pill} label={pill} size="small" variant="outlined" sx={{ bgcolor: 'white' }} />
            ))}
          </Box>
        </Box>
        <Box className="flex items-center gap-3">
          <Typography variant="body2" className="text-text-secondary">
            {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
            {filtered.length !== results.length && ` (${results.length} total)`}
          </Typography>
          <ButtonGroup size="small" variant="outlined" color="grey">
            <Button
              variant={view === 'list' ? 'contained' : 'outlined'}
              color={view === 'list' ? 'primary' : 'grey'}
              onClick={() => setView('list')}
            >
              List
            </Button>
            <Button
              variant={view === 'map' ? 'contained' : 'outlined'}
              color={view === 'map' ? 'primary' : 'grey'}
              onClick={() => setView('map')}
            >
              Map
            </Button>
          </ButtonGroup>
        </Box>
      </Box>

      {/* Filter bar */}
      <Paper elevation={0} variant="outlined" sx={{ borderRadius: 2, bgcolor: 'hsl(var(--background))' }}>
        <Box className="flex flex-wrap items-end gap-4 p-4">

          {/* Price range slider */}
          <Box sx={{ minWidth: 220, flex: '1 1 220px' }}>
            <Typography variant="caption" className="text-text-secondary block mb-1">
              Price — <span className="font-medium text-text-primary">{priceLabel}</span>
            </Typography>
            <Slider
              value={draft.priceRange}
              min={0}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              onChange={(_, val) => setDraft((d) => ({ ...d, priceRange: val as [number, number] }))}
              valueLabelDisplay="auto"
              valueLabelFormat={fmtPrice}
              sx={{ color: 'hsl(var(--primary))', mx: 0.5 }}
            />
          </Box>

          {/* Min beds */}
          <FormControl size="small" sx={fieldSx}>
            <InputLabel>Beds</InputLabel>
            <Select
              label="Beds"
              value={draft.minBeds}
              onChange={(e: SelectChangeEvent<number>) =>
                setDraft((d) => ({ ...d, minBeds: Number(e.target.value) }))
              }
            >
              {BED_BATH_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Min baths */}
          <FormControl size="small" sx={fieldSx}>
            <InputLabel>Baths</InputLabel>
            <Select
              label="Baths"
              value={draft.minBaths}
              onChange={(e: SelectChangeEvent<number>) =>
                setDraft((d) => ({ ...d, minBaths: Number(e.target.value) }))
              }
            >
              {BED_BATH_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Property type multi-select */}
          <FormControl size="small" sx={{ ...fieldSx, minWidth: 160 }}>
            <InputLabel>Type</InputLabel>
            <Select<string[]>
              label="Type"
              multiple
              value={draft.propertyTypes}
              onChange={(e) => {
                const val = e.target.value
                setDraft((d) => ({ ...d, propertyTypes: typeof val === 'string' ? [val] : val }))
              }}
              renderValue={(selected: string[]) =>
                selected.length === 0
                  ? 'Any'
                  : selected
                      .map((v) => PROPERTY_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v)
                      .join(', ')
              }
            >
              {PROPERTY_TYPE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value} dense>
                  <Checkbox checked={draft.propertyTypes.includes(o.value)} size="small" sx={{ py: 0 }} />
                  <ListItemText primary={o.label} primaryTypographyProps={{ variant: 'body2' }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Apply button — only visible when dirty */}
          {isDirty && (
            <Button
              variant="contained"
              size="small"
              onClick={() => setApplied(draft)}
              sx={{ height: 40, px: 3, whiteSpace: 'nowrap' }}
            >
              Apply
            </Button>
          )}
        </Box>
      </Paper>

      {/* Content */}
      {view === 'list' ? (
        <Box sx={{ height: 'calc(100vh - 22rem)', minHeight: 300 }}>
          <ListingsTable results={filtered} onListingClick={handleListingSelect} />
        </Box>
      ) : (
        <Box sx={{ height: 'calc(100vh - 22rem)', minHeight: 300 }}>
          <ListingsMap results={filtered} onListingClick={handleListingSelect} />
        </Box>
      )}

      <ListingDetailDialog
        result={selectedListing}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </Box>
  )
}
