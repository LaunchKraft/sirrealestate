import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Box, Chip, Divider, Typography } from '@mui/material'
import { CheckCircle2, Circle, ChevronLeft } from 'lucide-react'
import { useClosings, type Closing } from '@/hooks/useClosings'
import {
  getClosingWorkflow,
  getVisibleSteps,
  getActivePhase,
  PHASE_LABEL,
  type ClosingPhase,
} from '@/lib/closing-workflow'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null
  const diff = new Date(iso + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ─── Detail row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box className="flex gap-3">
      <Typography variant="body2" className="text-text-secondary w-44 shrink-0">{label}</Typography>
      <Typography variant="body2" className="font-medium">{value ?? '—'}</Typography>
    </Box>
  )
}

// ─── Phase step row ──────────────────────────────────────────────────────────

interface PhaseCardProps {
  phase: ClosingPhase
  closing: Closing
  steps: ReturnType<typeof getVisibleSteps>
  isActivePhase: boolean
}

function PhaseCard({ phase, closing, steps, isActivePhase }: PhaseCardProps) {
  const phaseSteps = steps.filter((s) => s.phase === phase)
  if (phaseSteps.length === 0) return null
  const allDone = phaseSteps.every((s) => s.isComplete(closing))

  return (
    <Box
      className={`rounded-2xl border p-4 ${
        isActivePhase ? 'border-primary/30 bg-primary/[0.03]' : 'border-grey-100 bg-background-paper'
      } shadow-xs`}
    >
      <Box className="flex items-center gap-2 mb-3">
        <Typography variant="subtitle2" className="font-semibold">
          {PHASE_LABEL[phase]}
        </Typography>
        {allDone && (
          <Chip
            label="Complete"
            size="small"
            sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'success.light', color: 'success.contrastText' }}
          />
        )}
        {isActivePhase && !allDone && (
          <Chip
            label="In Progress"
            size="small"
            sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'primary.light', color: 'primary.contrastText' }}
          />
        )}
      </Box>

      <Box className="flex flex-wrap gap-x-6 gap-y-3">
        {phaseSteps.map((step, idx) => {
          const done = step.isComplete(closing)
          const isNext = !done && phaseSteps.slice(0, idx).every((s) => s.isComplete(closing))
          return (
            <Box key={step.id} className="flex items-center gap-1.5 min-w-0">
              {done ? (
                <CheckCircle2 size={18} className="text-success-main shrink-0" />
              ) : isNext ? (
                <Circle size={18} className="text-primary shrink-0" strokeWidth={2.5} />
              ) : (
                <Circle size={18} className="text-grey-300 shrink-0" strokeWidth={1.5} />
              )}
              <Typography
                variant="caption"
                className={`font-medium ${
                  done ? 'text-success-main' : isNext ? 'text-primary' : 'text-text-secondary'
                }`}
              >
                {step.label}
              </Typography>
              {done && closing.milestones?.[step.id] && (
                <Typography variant="caption" className="text-text-secondary">
                  · {new Date(closing.milestones[step.id]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Typography>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClosingDetailPage() {
  const { closingId } = useParams<{ closingId: string }>()
  const { closings, isLoading, refetch } = useClosings()
  const { registerClosingsRefetch } = useSidebarRefresh()

  useEffect(() => { refetch() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => registerClosingsRefetch(refetch), [registerClosingsRefetch, refetch])

  const closing = closings.find((c) => c.closingId === closingId)
  const workflow = closing ? getClosingWorkflow(closing.propertyState) : null

  if (isLoading) {
    return (
      <Box className="flex items-center justify-center py-24">
        <Typography variant="body2" className="text-text-secondary">Loading…</Typography>
      </Box>
    )
  }

  if (!closing || !workflow) {
    return (
      <Box className="flex flex-col items-center gap-3 py-24">
        <Typography variant="body1" className="text-text-secondary">Closing not found.</Typography>
        <Link to="/chat" className="text-primary text-sm font-medium hover:underline">← Back to Chat</Link>
      </Box>
    )
  }

  const visibleSteps = getVisibleSteps(workflow, closing)
  const activePhase = getActivePhase(workflow, closing)
  const completed = visibleSteps.filter((s) => s.isComplete(closing)).length
  const days = daysUntil(closing.deadlines?.closingDate)
  const isDone = completed === visibleSteps.length

  return (
    <Box className="flex flex-col gap-6 max-w-4xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link to="/chat" className="text-text-secondary flex items-center gap-1 text-sm hover:text-primary w-fit">
        <ChevronLeft size={16} />
        Back to Chat
      </Link>

      {/* Header */}
      <Box className="flex flex-col gap-2">
        <Box className="flex flex-wrap items-center gap-3">
          <Typography variant="h5" className="font-heading font-bold">
            {closing.listingAddress}
          </Typography>
          <Chip
            label={isDone ? 'Closed!' : PHASE_LABEL[activePhase]}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              bgcolor: isDone ? 'success.light' : 'primary.light',
              color: isDone ? 'success.contrastText' : 'primary.contrastText',
            }}
          />
        </Box>
        <Box className="flex flex-wrap items-center gap-4">
          <Typography variant="body2" className="text-text-secondary">
            {workflow.stateName} · {completed} of {visibleSteps.length} steps complete
          </Typography>
          {days !== null && !isDone && (
            <Typography variant="body2" className={`font-semibold ${days <= 7 ? 'text-warning-main' : 'text-text-secondary'}`}>
              {days > 0 ? `${days} days until closing` : days === 0 ? 'Closing today!' : 'Past closing date'}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Details card */}
      <Box className="rounded-2xl border border-grey-100 bg-background-paper p-5 shadow-xs flex flex-col gap-3">
        <Typography variant="subtitle2" className="font-semibold">Closing Details</Typography>
        <Divider />
        <Box className="flex flex-col gap-2.5">
          <DetailRow label="Closing date" value={fmtDate(closing.deadlines?.closingDate)} />
          <DetailRow label="Financing" value={closing.financingType === 'cash' ? 'Cash' : 'Financed'} />
          <DetailRow label="HOA" value={closing.hasHoa ? 'Yes' : 'No'} />
          {closing.titleCompany && <DetailRow label="Title company" value={closing.titleCompany} />}
          {closing.titleContactEmail && (
            <DetailRow
              label="Title contact"
              value={<a href={`mailto:${closing.titleContactEmail}`} className="text-primary hover:underline">{closing.titleContactEmail}</a>}
            />
          )}
          {closing.escrowNumber && <DetailRow label="Escrow #" value={closing.escrowNumber} />}
          {closing.notes && <DetailRow label="Notes" value={closing.notes} />}
        </Box>

        {/* Key deadlines */}
        {Object.values(closing.deadlines ?? {}).some(Boolean) && (
          <>
            <Divider />
            <Typography variant="subtitle2" className="font-semibold">Key Deadlines</Typography>
            <Box className="flex flex-col gap-2.5">
              {closing.deadlines?.inspectionObjectionDeadline && (
                <DetailRow label="Inspection objection" value={fmtDate(closing.deadlines.inspectionObjectionDeadline)} />
              )}
              {closing.deadlines?.inspectionResolutionDeadline && (
                <DetailRow label="Inspection resolution" value={fmtDate(closing.deadlines.inspectionResolutionDeadline)} />
              )}
              {closing.deadlines?.titleObjectionDeadline && (
                <DetailRow label="Title objection" value={fmtDate(closing.deadlines.titleObjectionDeadline)} />
              )}
              {closing.deadlines?.appraisalDeadline && (
                <DetailRow label="Appraisal" value={fmtDate(closing.deadlines.appraisalDeadline)} />
              )}
              {closing.deadlines?.loanConditionsDeadline && (
                <DetailRow label="Loan conditions" value={fmtDate(closing.deadlines.loanConditionsDeadline)} />
              )}
              {closing.deadlines?.newLoanAvailabilityDeadline && (
                <DetailRow label="Loan availability" value={fmtDate(closing.deadlines.newLoanAvailabilityDeadline)} />
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Phase-grouped workflow */}
      <Box className="flex flex-col gap-3">
        <Typography variant="subtitle1" className="font-semibold">
          Closing Progress · {workflow.stateName}
        </Typography>
        {workflow.phases.map((phase) => (
          <PhaseCard
            key={phase}
            phase={phase}
            closing={closing}
            steps={visibleSteps}
            isActivePhase={phase === activePhase && !isDone}
          />
        ))}
      </Box>
    </Box>
  )
}
