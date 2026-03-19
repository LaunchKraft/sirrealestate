import { useEffect, useState } from 'react'
import { Box, Card, CardContent, CircularProgress, Typography } from '@mui/material'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { stats, type StatsResponse } from '@/services/api'

const PLATFORM_COLORS = {
  zillow: '#006AFF',
  redfin: '#CC0000',
  realtor: '#D9232D',
}

const PROFILE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4',
]

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 140 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Typography variant="caption" className="text-text-secondary block mb-1">
          {label}
        </Typography>
        <Typography variant="h4" className="font-bold leading-none">
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" className="text-text-secondary mt-0.5 block">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 280 }}>
      <CardContent>
        <Typography variant="subtitle2" className="font-semibold mb-3 block">
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    stats.get()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Box className="flex items-center justify-center" sx={{ height: 300 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !data) {
    return (
      <Typography variant="body2" className="text-text-secondary italic">
        {error ?? 'No data available.'}
      </Typography>
    )
  }

  const { stats: s, charts } = data

  return (
    <Box className="flex flex-col gap-5">
      <Typography variant="h6" className="font-semibold">
        Dashboard
      </Typography>

      {/* Stat cards */}
      <Box className="flex flex-wrap gap-3">
        <StatCard label="Search Results" value={s.searchResultsCount} />
        <StatCard label="Favorites" value={s.favoritesCount} />
        <StatCard
          label="Viewings"
          value={s.viewingsCount.total}
          sub={`${s.viewingsCount.accepted} confirmed`}
        />
        <StatCard
          label="Offers"
          value={s.offersCount.total}
          sub={s.offersCount.accepted > 0 ? `${s.offersCount.accepted} accepted` : undefined}
        />
      </Box>

      {/* Charts row 1 */}
      <Box className="flex flex-wrap gap-3">
        <ChartCard title="Listing Views by Platform">
          {charts.listingClicksChartData.length === 0 ? (
            <Typography variant="caption" className="text-text-secondary italic">
              No listing clicks yet.
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={charts.listingClicksChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="zillow" stroke={PLATFORM_COLORS.zillow} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="redfin" stroke={PLATFORM_COLORS.redfin} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="realtor" stroke={PLATFORM_COLORS.realtor} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Search Results Over Time">
          {charts.searchResultsOverTime.length === 0 ? (
            <Typography variant="caption" className="text-text-secondary italic">
              No search results yet.
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={charts.searchResultsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {charts.searchProfileIds.map((pid, i) => (
                  <Line
                    key={pid}
                    type="monotone"
                    dataKey={pid}
                    name={`Search ${i + 1}`}
                    stroke={PROFILE_COLORS[i % PROFILE_COLORS.length]}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Box>

      {/* Charts row 2 */}
      <Box className="flex flex-wrap gap-3">
        <ChartCard title="Viewings">
          {charts.viewingsChartData.length === 0 ? (
            <Typography variant="caption" className="text-text-secondary italic">
              No viewings yet.
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={charts.viewingsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="requested" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="confirmed" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Offers">
          {charts.offersChartData.length === 0 ? (
            <Typography variant="caption" className="text-text-secondary italic">
              No offers yet.
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={charts.offersChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="submitted" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="accepted" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Box>
    </Box>
  )
}
