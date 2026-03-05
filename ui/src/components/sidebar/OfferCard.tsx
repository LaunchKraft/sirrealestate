import { Box, Chip, Tooltip, Typography } from '@mui/material'
import type { Offer, OfferStatus } from '@/hooks/useOffers'

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  submitted: 'Submitted',
  accepted: 'Accepted',
  countered: 'Countered',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

const STATUS_COLOR: Record<OfferStatus, { bgcolor: string; color: string }> = {
  draft:     { bgcolor: 'grey.200',          color: 'text.secondary' },
  ready:     { bgcolor: 'primary.light',     color: 'primary.contrastText' },
  submitted: { bgcolor: 'warning.light',     color: 'warning.contrastText' },
  accepted:  { bgcolor: 'success.light',     color: 'success.contrastText' },
  countered: { bgcolor: 'secondary.light',   color: 'secondary.contrastText' },
  rejected:  { bgcolor: 'error.light',       color: 'error.contrastText' },
  withdrawn: { bgcolor: 'grey.300',          color: 'text.secondary' },
}

type DocStatus = 'none' | 'sent' | 'signed'

function docStatus(documentId?: string, signedAt?: string): DocStatus {
  if (!documentId) return 'none'
  return signedAt ? 'signed' : 'sent'
}

function DocPill({ label, status }: { label: string; status: DocStatus }) {
  if (status === 'none') return null
  const signed = status === 'signed'
  return (
    <Chip
      label={`${label}: ${signed ? 'Signed' : 'Sent'}`}
      size="small"
      sx={{
        height: 18,
        fontSize: '0.65rem',
        fontWeight: 600,
        bgcolor: signed ? 'success.light' : 'info.light',
        color: signed ? 'success.contrastText' : 'info.contrastText',
      }}
    />
  )
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function OfferCard({ offer }: { offer: Offer }) {
  const paStatus  = docStatus(offer.purchaseAgreementDocumentId,   offer.signedForms?.['purchase_agreement'])
  const emdStatus = docStatus(offer.earnestMoneyAgreementDocumentId, offer.signedForms?.['earnest_money_agreement'])
  const adStatus  = docStatus(offer.agencyDisclosureDocumentId,    offer.signedForms?.['agency_disclosure'])
  const hasDocActivity = paStatus !== 'none' || emdStatus !== 'none' || adStatus !== 'none' || offer.earnestMoneyPaidAt

  return (
    <Box className="ms-7 flex flex-col gap-1.5 rounded-lg border border-grey-100 bg-background px-3 py-2">
      {/* Address + status */}
      <Box className="flex items-start justify-between gap-2">
        <Tooltip title={offer.listingAddress} arrow>
          <Typography variant="body2" className="text-text-primary min-w-0 flex-1 truncate font-medium">
            {offer.listingAddress}
          </Typography>
        </Tooltip>
        <Chip
          label={STATUS_LABEL[offer.status]}
          size="small"
          sx={{ ...STATUS_COLOR[offer.status], height: 20, fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}
        />
      </Box>

      {/* Offer price + closing date */}
      {(offer.terms?.offerPrice ?? offer.terms?.closingDate) && (
        <Box className="flex flex-wrap gap-x-3 gap-y-0.5">
          {offer.terms?.offerPrice && (
            <Typography variant="caption" className="text-text-secondary">
              ${offer.terms.offerPrice.toLocaleString()}
            </Typography>
          )}
          {offer.terms?.closingDate && (
            <Typography variant="caption" className="text-text-secondary">
              Closes {fmtDate(offer.terms.closingDate)}
            </Typography>
          )}
        </Box>
      )}

      {/* Document pipeline */}
      {hasDocActivity && (
        <Box className="flex flex-wrap gap-1">
          <DocPill label="PA" status={paStatus} />
          <DocPill label="EMD" status={emdStatus} />
          <DocPill label="Agency" status={adStatus} />
          {offer.earnestMoneyPaidAt && (
            <Chip
              label="EMD Paid"
              size="small"
              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'success.light', color: 'success.contrastText' }}
            />
          )}
        </Box>
      )}
    </Box>
  )
}
