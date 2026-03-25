import { Box, Chip, LinearProgress, Tooltip, Typography } from '@mui/material'
import { NavLink } from 'react-router-dom'
import type { Closing } from '@/hooks/useClosings'
import { getClosingWorkflow, getVisibleSteps, getActivePhase, PHASE_LABEL } from '@/lib/closing-workflow'

function daysUntil(isoDate?: string): number | null {
  if (!isoDate) return null
  const diff = new Date(isoDate + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function ClosingCard({ closing }: { closing: Closing }) {
  const workflow = getClosingWorkflow(closing.propertyState)
  const visible = getVisibleSteps(workflow, closing)
  const completed = visible.filter((s) => s.isComplete(closing)).length
  const progress = visible.length > 0 ? Math.round((completed / visible.length) * 100) : 0
  const activePhase = getActivePhase(workflow, closing)
  const days = daysUntil(closing.deadlines?.closingDate)
  const isDone = completed === visible.length

  return (
    <NavLink
      to={`/closings/${closing.closingId}`}
      className={({ isActive }) =>
        `ms-7 flex flex-col gap-1.5 rounded-lg border px-3 py-2 transition-colors no-underline ${
          isActive
            ? 'border-primary/30 bg-primary/5'
            : 'border-grey-100 bg-background hover:border-grey-200 hover:bg-grey-50'
        }`
      }
    >
      {/* Address */}
      <Tooltip title={closing.listingAddress} arrow>
        <Typography variant="body2" className="text-text-primary min-w-0 truncate font-medium">
          {closing.listingAddress}
        </Typography>
      </Tooltip>

      {/* Phase + closing date */}
      <Box className="flex items-center justify-between gap-2">
        <Chip
          label={isDone ? 'Closed!' : PHASE_LABEL[activePhase]}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.65rem',
            fontWeight: 600,
            bgcolor: isDone ? 'success.light' : 'primary.light',
            color: isDone ? 'success.contrastText' : 'primary.contrastText',
          }}
        />
        {days !== null && !isDone && (
          <Typography variant="caption" className="text-text-secondary shrink-0">
            {days > 0 ? `${days}d to close` : days === 0 ? 'Closing today!' : 'Past closing date'}
          </Typography>
        )}
      </Box>

      {/* Progress bar */}
      <Box className="flex flex-col gap-0.5">
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 4,
            borderRadius: 2,
            bgcolor: 'grey.100',
            '& .MuiLinearProgress-bar': { borderRadius: 2 },
          }}
        />
        <Typography variant="caption" className="text-text-secondary">
          {completed} of {visible.length} steps complete
        </Typography>
      </Box>
    </NavLink>
  )
}
