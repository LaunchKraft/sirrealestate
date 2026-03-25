import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Box,
  Chip,
  Divider,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material'
import { CheckCircle2, Circle, ChevronLeft } from 'lucide-react'
import { useOffers, type Offer, type OfferStatus } from '@/hooks/useOffers'
import { getWorkflow } from '@/lib/offer-workflow'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'

// ─── Status display helpers ───────────────────────────────────────────────────

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Draft',
  ready: 'Ready to Submit',
  submitted: 'Submitted',
  accepted: 'Accepted',
  countered: 'Countered',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

const STATUS_COLOR: Record<OfferStatus, { bgcolor: string; color: string }> = {
  draft:     { bgcolor: 'grey.200',        color: 'text.secondary' },
  ready:     { bgcolor: 'primary.light',   color: 'primary.contrastText' },
  submitted: { bgcolor: 'warning.light',   color: 'warning.contrastText' },
  accepted:  { bgcolor: 'success.light',   color: 'success.contrastText' },
  countered: { bgcolor: 'secondary.light', color: 'secondary.contrastText' },
  rejected:  { bgcolor: 'error.light',     color: 'error.contrastText' },
  withdrawn: { bgcolor: 'grey.300',        color: 'text.secondary' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// ─── Detail row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box className="flex gap-3">
      <Typography variant="body2" className="text-text-secondary w-40 shrink-0">{label}</Typography>
      <Typography variant="body2" className="font-medium">{value}</Typography>
    </Box>
  )
}

// ─── Step icon ───────────────────────────────────────────────────────────────

function StepIcon({ completed, active }: { completed: boolean; active: boolean }) {
  if (completed) return <CheckCircle2 size={22} className="text-success-main" />
  if (active) return <Circle size={22} className="text-primary" strokeWidth={2.5} />
  return <Circle size={22} className="text-grey-300" strokeWidth={1.5} />
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OfferDetailPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const { offers, isLoading, refetch } = useOffers()
  const { registerOffersRefetch } = useSidebarRefresh()

  useEffect(() => { refetch() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => registerOffersRefetch(refetch), [registerOffersRefetch, refetch])

  const offer: Offer | undefined = offers.find((o) => o.offerId === offerId)
  const workflow = offer ? getWorkflow(offer.propertyState) : null

  if (isLoading) {
    return (
      <Box className="flex items-center justify-center py-24">
        <Typography variant="body2" className="text-text-secondary">Loading…</Typography>
      </Box>
    )
  }

  if (!offer || !workflow) {
    return (
      <Box className="flex flex-col items-center gap-3 py-24">
        <Typography variant="body1" className="text-text-secondary">Offer not found.</Typography>
        <Link to="/chat" className="text-primary text-sm font-medium hover:underline">← Back to Chat</Link>
      </Box>
    )
  }

  // Find active step index: last incomplete step, or all complete
  const steps = workflow.steps
  const completedCount = steps.filter((s) => s.isComplete(offer)).length
  const activeStep = completedCount < steps.length ? completedCount : steps.length

  const paStatus  = offer.purchaseAgreementDocumentId
    ? (offer.signedForms?.['purchase_agreement'] ? 'Signed' : 'Sent — awaiting signature')
    : null
  const emdStatus = offer.earnestMoneyAgreementDocumentId
    ? (offer.signedForms?.['earnest_money_agreement'] ? 'Signed' : 'Sent — awaiting signature')
    : null
  const adStatus  = offer.agencyDisclosureDocumentId
    ? (offer.signedForms?.['agency_disclosure'] ? 'Signed' : 'Sent — awaiting signature')
    : null

  return (
    <Box className="flex flex-col gap-6 max-w-4xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link
        to="/chat"
        className="text-text-secondary flex items-center gap-1 text-sm hover:text-primary w-fit"
      >
        <ChevronLeft size={16} />
        Back to Chat
      </Link>

      {/* Header */}
      <Box className="flex flex-col gap-2">
        <Box className="flex flex-wrap items-center gap-3">
          <Typography variant="h5" className="font-heading font-bold">
            {offer.listingAddress}
          </Typography>
          <Chip
            label={STATUS_LABEL[offer.status]}
            size="small"
            sx={{ ...STATUS_COLOR[offer.status], fontWeight: 600, fontSize: '0.75rem' }}
          />
        </Box>
        <Typography variant="body2" className="text-text-secondary">
          {workflow.stateName} · Offer #{offer.offerId.slice(-8).toUpperCase()}
        </Typography>
      </Box>

      {/* Details card */}
      <Box className="rounded-2xl border border-grey-100 bg-background-paper p-5 shadow-xs flex flex-col gap-3">
        <Typography variant="subtitle2" className="font-semibold text-text-primary">Offer Details</Typography>
        <Divider />
        <Box className="flex flex-col gap-2.5">
          <DetailRow label="Offer date" value={fmtDate(offer.createdAt)} />
          {offer.terms?.offerPrice && (
            <DetailRow label="Offer price" value={fmtCurrency(offer.terms.offerPrice)} />
          )}
          {offer.terms?.earnestMoneyAmount && (
            <DetailRow label="Earnest money" value={fmtCurrency(offer.terms.earnestMoneyAmount)} />
          )}
          {offer.terms?.closingDate && (
            <DetailRow label="Closing date" value={fmtDate(offer.terms.closingDate)} />
          )}
          {offer.terms?.possessionDate && (
            <DetailRow label="Possession date" value={fmtDate(offer.terms.possessionDate)} />
          )}
          <DetailRow label="State" value={offer.propertyState || '—'} />
          {offer.earnestMoneyPaidAt && (
            <DetailRow label="EMD transferred" value={fmtDate(offer.earnestMoneyPaidAt)} />
          )}
        </Box>

        {/* Documents sub-section */}
        {(paStatus || emdStatus || adStatus) && (
          <>
            <Divider />
            <Typography variant="subtitle2" className="font-semibold text-text-primary">Documents</Typography>
            <Box className="flex flex-col gap-2.5">
              {adStatus  && <DetailRow label="Agency disclosure" value={adStatus} />}
              {paStatus  && <DetailRow label="Purchase agreement" value={paStatus} />}
              {emdStatus && <DetailRow label="EMD agreement" value={emdStatus} />}
            </Box>
          </>
        )}
      </Box>

      {/* Workflow stepper */}
      <Box className="rounded-2xl border border-grey-100 bg-background-paper p-5 shadow-xs">
        <Typography variant="subtitle2" className="font-semibold text-text-primary mb-4">
          Offer Progress · {workflow.stateName}
        </Typography>

        <Stepper
          activeStep={activeStep}
          alternativeLabel
          sx={{
            '& .MuiStepConnector-line': {
              borderColor: 'var(--grey-100)',
            },
            '& .MuiStepLabel-label': {
              fontSize: '0.72rem',
              marginTop: '6px !important',
              color: 'var(--text-secondary)',
              fontWeight: 500,
            },
            '& .MuiStepLabel-label.Mui-completed': {
              color: 'var(--success-main)',
              fontWeight: 600,
            },
            '& .MuiStepLabel-label.Mui-active': {
              color: 'hsl(var(--primary))',
              fontWeight: 600,
            },
          }}
        >
          {steps.map((step, index) => {
            const completed = step.isComplete(offer)
            const active = !completed && index === activeStep

            return (
              <Step key={step.id} completed={completed}>
                <StepLabel
                  StepIconComponent={() => <StepIcon completed={completed} active={active} />}
                  title={step.description}
                >
                  {step.label}
                </StepLabel>
              </Step>
            )
          })}
        </Stepper>
      </Box>
    </Box>
  )
}
