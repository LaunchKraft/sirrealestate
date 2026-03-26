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

// ─── Texas ────────────────────────────────────────────────────────────────────
// TX uses TREC-promulgated forms. Agents are legally required to use them.
// Includes IABS disclosure and buyer representation agreement requirements.

const TX_STEPS: WorkflowStep[] = [
  {
    id: 'offer_created',
    label: 'Offer Created',
    description: 'Offer draft has been started',
    isComplete: () => true,
  },
  {
    id: 'terms_set',
    label: 'Terms Set',
    description: 'Offer price, option fee, option period days, and closing date confirmed',
    isComplete: (o) => !!(o.terms?.offerPrice && o.terms?.closingDate),
  },
  {
    id: 'iabs_acknowledged',
    label: 'IABS Acknowledged',
    description: 'Information About Brokerage Services disclosure acknowledged by buyer (required by TX law before substantive discussions)',
    isComplete: (o) => !!o.signedForms?.['iabs'],
  },
  {
    id: 'buyer_rep_signed',
    label: 'Buyer Rep Agreement',
    description: 'Written buyer representation agreement signed (required by TREC rules)',
    isComplete: (o) => !!o.signedForms?.['buyer_rep'],
  },
  {
    id: 'purchase_agreement_signed',
    label: 'Purchase Agreement',
    description: 'TREC One to Four Family Residential Contract signed by all buyers',
    isComplete: (o) => !!o.signedForms?.['purchase_agreement'],
  },
  {
    id: 'financing_addendum_signed',
    label: 'Financing Addendum',
    description: 'TREC Third Party Financing Addendum signed (required for all financed offers)',
    isComplete: (o) => !!o.signedForms?.['financing_addendum'],
  },
  {
    id: 'submitted',
    label: 'Offer Submitted',
    description: "Offer package delivered to the seller's agent",
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
    description: 'Earnest money delivered to title company within 3 business days of contract execution',
    isComplete: (o) => !!o.earnestMoneyPaidAt,
  },
]

// ─── Nevada ───────────────────────────────────────────────────────────────────
// NV uses the NVAR Residential Purchase Agreement.
// Key buyer protection: Due Diligence Period (typically 10–15 days) — buyer may cancel for any reason.
// No agency disclosure step; SRPD (Seller's Real Property Disclosure) reviewed during due diligence.

const NV_STEPS: WorkflowStep[] = [
  {
    id: 'offer_created',
    label: 'Offer Created',
    description: 'Offer draft has been started',
    isComplete: () => true,
  },
  {
    id: 'terms_set',
    label: 'Terms Set',
    description: 'Offer price, due diligence days, and closing date confirmed',
    isComplete: (o) => !!(o.terms?.offerPrice && o.terms?.closingDate),
  },
  {
    id: 'purchase_agreement_signed',
    label: 'Purchase Agreement',
    description: 'NVAR Residential Purchase Agreement signed by all buyers',
    isComplete: (o) => !!o.signedForms?.['purchase_agreement'],
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
    description: 'Earnest money deposited with escrow company within 3 business days of acceptance',
    isComplete: (o) => !!o.earnestMoneyPaidAt,
  },
]

// ─── Utah ─────────────────────────────────────────────────────────────────────
// UT uses the UAR Real Estate Purchase Contract (REPC).
// Key buyer protection: Due Diligence Deadline (default 14 days) — buyer may cancel for any reason.
// Earnest money is due within 3 business days of acceptance.

const UT_STEPS: WorkflowStep[] = [
  {
    id: 'offer_created',
    label: 'Offer Created',
    description: 'Offer draft has been started',
    isComplete: () => true,
  },
  {
    id: 'terms_set',
    label: 'Terms Set',
    description: 'Offer price, due diligence days, and settlement deadline confirmed',
    isComplete: (o) => !!(o.terms?.offerPrice && o.terms?.closingDate),
  },
  {
    id: 'purchase_agreement_signed',
    label: 'REPC Signed',
    description: 'Utah Real Estate Purchase Contract (REPC) signed by all buyers',
    isComplete: (o) => !!o.signedForms?.['purchase_agreement'],
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
    description: 'Earnest money deposited within 3 business days of acceptance',
    isComplete: (o) => !!o.earnestMoneyPaidAt,
  },
]

// ─── Registry ─────────────────────────────────────────────────────────────────

const WORKFLOWS: Record<string, StateWorkflow> = {
  CO: { state: 'CO', stateName: 'Colorado', steps: CO_STEPS },
  AZ: { state: 'AZ', stateName: 'Arizona', steps: AZ_STEPS },
  TX: { state: 'TX', stateName: 'Texas', steps: TX_STEPS },
  NV: { state: 'NV', stateName: 'Nevada', steps: NV_STEPS },
  UT: { state: 'UT', stateName: 'Utah', steps: UT_STEPS },
}

export function getWorkflow(propertyState?: string): StateWorkflow {
  const key = (propertyState ?? '').toUpperCase()
  return WORKFLOWS[key] ?? { state: key || 'N/A', stateName: propertyState ?? 'Unknown', steps: DEFAULT_STEPS }
}
