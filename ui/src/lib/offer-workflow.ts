import type { Offer } from '@/hooks/useOffers'

export interface WorkflowStep {
  id: string
  label: string
  description: string
  isComplete: (offer: Offer) => boolean
}

export interface StateWorkflow {
  state: string
  stateName: string
  steps: WorkflowStep[]
}

// ─── Colorado ────────────────────────────────────────────────────────────────
// CO requires an agency (brokerage relationship) disclosure before offer submission.

const CO_STEPS: WorkflowStep[] = [
  {
    id: 'offer_created',
    label: 'Offer Created',
    description: 'Offer draft has been started',
    isComplete: () => true,
  },
  {
    id: 'terms_set',
    label: 'Terms Set',
    description: 'Offer price and closing date confirmed',
    isComplete: (o) => !!(o.terms?.offerPrice && o.terms?.closingDate),
  },
  {
    id: 'agency_disclosure_signed',
    label: 'Agency Disclosure',
    description: 'Brokerage relationship disclosure signed by buyer',
    isComplete: (o) => !!o.signedForms?.['agency_disclosure'],
  },
  {
    id: 'purchase_agreement_signed',
    label: 'Purchase Agreement',
    description: 'Purchase contract signed by all buyers',
    isComplete: (o) => !!o.signedForms?.['purchase_agreement'],
  },
  {
    id: 'earnest_money_signed',
    label: 'EMD Agreement',
    description: 'Earnest money deposit agreement signed',
    isComplete: (o) => !!o.signedForms?.['earnest_money_agreement'],
  },
  {
    id: 'submitted',
    label: 'Offer Submitted',
    description: "Offer delivered to the seller's agent",
    isComplete: (o) => ['submitted', 'accepted', 'countered', 'rejected', 'withdrawn'].includes(o.status),
  },
  {
    id: 'seller_response',
    label: 'Seller Response',
    description: 'Response received from the seller',
    isComplete: (o) => ['accepted', 'countered', 'rejected'].includes(o.status),
  },
  {
    id: 'emd_transferred',
    label: 'EMD Transferred',
    description: 'Earnest money deposited into escrow',
    isComplete: (o) => !!o.earnestMoneyPaidAt,
  },
]

// ─── Default (all other states) ──────────────────────────────────────────────
// No agency disclosure requirement modeled yet; add states as needed.

const DEFAULT_STEPS: WorkflowStep[] = [
  {
    id: 'offer_created',
    label: 'Offer Created',
    description: 'Offer draft has been started',
    isComplete: () => true,
  },
  {
    id: 'terms_set',
    label: 'Terms Set',
    description: 'Offer price and closing date confirmed',
    isComplete: (o) => !!(o.terms?.offerPrice && o.terms?.closingDate),
  },
  {
    id: 'purchase_agreement_signed',
    label: 'Purchase Agreement',
    description: 'Purchase contract signed by all buyers',
    isComplete: (o) => !!o.signedForms?.['purchase_agreement'],
  },
  {
    id: 'earnest_money_signed',
    label: 'EMD Agreement',
    description: 'Earnest money deposit agreement signed',
    isComplete: (o) => !!o.signedForms?.['earnest_money_agreement'],
  },
  {
    id: 'submitted',
    label: 'Offer Submitted',
    description: "Offer delivered to the seller's agent",
    isComplete: (o) => ['submitted', 'accepted', 'countered', 'rejected', 'withdrawn'].includes(o.status),
  },
  {
    id: 'seller_response',
    label: 'Seller Response',
    description: 'Response received from the seller',
    isComplete: (o) => ['accepted', 'countered', 'rejected'].includes(o.status),
  },
  {
    id: 'emd_transferred',
    label: 'EMD Transferred',
    description: 'Earnest money deposited into escrow',
    isComplete: (o) => !!o.earnestMoneyPaidAt,
  },
]

// ─── Arizona ──────────────────────────────────────────────────────────────────
// AZ uses the AAR Residential Purchase Contract; no agency disclosure step.
// EMD is due 24–48 hours after acceptance (tracked via earnestMoneyPaidAt).

const AZ_STEPS: WorkflowStep[] = [
  {
    id: 'offer_created',
    label: 'Offer Created',
    description: 'Offer draft has been started',
    isComplete: () => true,
  },
  {
    id: 'terms_set',
    label: 'Terms Set',
    description: 'Offer price and closing date confirmed',
    isComplete: (o) => !!(o.terms?.offerPrice && o.terms?.closingDate),
  },
  {
    id: 'purchase_agreement_signed',
    label: 'Purchase Agreement',
    description: 'AAR Residential Purchase Contract signed by all buyers',
    isComplete: (o) => !!o.signedForms?.['purchase_agreement'],
  },
  {
    id: 'hoa_addendum_signed',
    label: 'HOA Addendum',
    description: 'HOA Addendum signed (if property has an HOA)',
    isComplete: (o) => !!o.signedForms?.['hoa_addendum'],
  },
  {
    id: 'submitted',
    label: 'Offer Submitted',
    description: "Offer delivered to the seller's agent",
    isComplete: (o) => ['submitted', 'accepted', 'countered', 'rejected', 'withdrawn'].includes(o.status),
  },
  {
    id: 'seller_response',
    label: 'Seller Response',
    description: 'Response received from the seller',
    isComplete: (o) => ['accepted', 'countered', 'rejected'].includes(o.status),
  },
  {
    id: 'emd_transferred',
    label: 'EMD Transferred',
    description: 'Earnest money deposited with escrow company (within 24–48 hours of acceptance)',
    isComplete: (o) => !!o.earnestMoneyPaidAt,
  },
]

// ─── Registry ─────────────────────────────────────────────────────────────────

const WORKFLOWS: Record<string, StateWorkflow> = {
  CO: { state: 'CO', stateName: 'Colorado', steps: CO_STEPS },
  AZ: { state: 'AZ', stateName: 'Arizona', steps: AZ_STEPS },
}

export function getWorkflow(propertyState?: string): StateWorkflow {
  const key = (propertyState ?? '').toUpperCase()
  return WORKFLOWS[key] ?? { state: key || 'N/A', stateName: propertyState ?? 'Unknown', steps: DEFAULT_STEPS }
}
