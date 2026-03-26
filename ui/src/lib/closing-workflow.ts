import type { Closing } from '@/hooks/useClosings'

export type ClosingPhase = 'option' | 'due_diligence' | 'inspection' | 'disclosures' | 'title' | 'financing' | 'pre_close' | 'closing'

export const PHASE_LABEL: Record<ClosingPhase, string> = {
  option: 'Option Period',
  due_diligence: 'Due Diligence',
  inspection: 'Inspection',
  disclosures: 'Disclosures',
  title: 'Title & Disclosures',
  financing: 'Financing',
  pre_close: 'Pre-Close',
  closing: 'Closing Day',
}

export interface ClosingStep {
  id: string
  label: string
  phase: ClosingPhase
  /** Return false to hide this step for this closing (e.g. cash buyer has no appraisal) */
  conditional?: (closing: Closing) => boolean
  isComplete: (closing: Closing) => boolean
}

export interface StateClosingWorkflow {
  state: string
  stateName: string
  phases: ClosingPhase[]
  steps: ClosingStep[]
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function milestone(id: string) {
  return (c: Closing) => !!c.milestones?.[id]
}

// ─── Colorado ─────────────────────────────────────────────────────────────────
// Mirrors the named deadlines in the Colorado Contract to Buy and Sell.

const CO_STEPS: ClosingStep[] = [
  // Inspection
  {
    id: 'inspection_scheduled',
    label: 'Inspection Scheduled',
    phase: 'inspection',
    isComplete: milestone('inspection_scheduled'),
  },
  {
    id: 'inspection_complete',
    label: 'Inspection Complete',
    phase: 'inspection',
    isComplete: milestone('inspection_complete'),
  },
  {
    id: 'inspection_objection_sent',
    label: 'Objection / Waiver',
    phase: 'inspection',
    isComplete: milestone('inspection_objection_sent'),
  },
  {
    id: 'inspection_resolved',
    label: 'Resolution Signed',
    phase: 'inspection',
    isComplete: milestone('inspection_resolved'),
  },

  // Title & Disclosures
  {
    id: 'title_commitment_received',
    label: 'Title Commitment',
    phase: 'title',
    isComplete: milestone('title_commitment_received'),
  },
  {
    id: 'hoa_docs_received',
    label: 'HOA Docs',
    phase: 'title',
    conditional: (c) => c.hasHoa,
    isComplete: milestone('hoa_docs_received'),
  },

  // Financing (skipped for cash buyers)
  {
    id: 'appraisal_ordered',
    label: 'Appraisal Ordered',
    phase: 'financing',
    conditional: (c) => c.financingType === 'financed',
    isComplete: milestone('appraisal_ordered'),
  },
  {
    id: 'appraisal_complete',
    label: 'Appraisal Complete',
    phase: 'financing',
    conditional: (c) => c.financingType === 'financed',
    isComplete: milestone('appraisal_complete'),
  },
  {
    id: 'loan_conditions_met',
    label: 'Loan Conditions Met',
    phase: 'financing',
    conditional: (c) => c.financingType === 'financed',
    isComplete: milestone('loan_conditions_met'),
  },
  {
    id: 'clear_to_close',
    label: 'Clear to Close',
    phase: 'financing',
    conditional: (c) => c.financingType === 'financed',
    isComplete: milestone('clear_to_close'),
  },

  // Pre-Close
  {
    id: 'insurance_bound',
    label: 'Insurance Bound',
    phase: 'pre_close',
    isComplete: milestone('insurance_bound'),
  },
  {
    id: 'closing_disclosure_reviewed',
    label: 'Closing Disclosure',
    phase: 'pre_close',
    conditional: (c) => c.financingType === 'financed',
    isComplete: milestone('closing_disclosure_reviewed'),
  },
  {
    id: 'final_walkthrough_complete',
    label: 'Final Walkthrough',
    phase: 'pre_close',
    isComplete: milestone('final_walkthrough_complete'),
  },
  {
    id: 'funds_wired',
    label: 'Funds Wired',
    phase: 'pre_close',
    isComplete: milestone('funds_wired'),
  },

  // Closing Day
  {
    id: 'documents_signed',
    label: 'Documents Signed',
    phase: 'closing',
    isComplete: milestone('documents_signed'),
  },
  {
    id: 'deed_recorded',
    label: 'Deed Recorded',
    phase: 'closing',
    isComplete: milestone('deed_recorded'),
  },
  {
    id: 'keys_received',
    label: 'Keys Received 🏡',
    phase: 'closing',
    isComplete: milestone('keys_received'),
  },
]

const CO_PHASES: ClosingPhase[] = ['inspection', 'title', 'financing', 'pre_close', 'closing']

// ─── Arizona ──────────────────────────────────────────────────────────────────
// Mirrors the AAR Residential Purchase Contract workflow.
// Adds a Disclosures phase (SPDS, CLUE report, HOA docs) and BINSR steps.

const AZ_STEPS: ClosingStep[] = [
  // Inspection
  { id: 'inspection_complete', label: 'Inspection Complete', phase: 'inspection', isComplete: milestone('inspection_complete') },
  { id: 'binsr_sent', label: 'BINSR Sent', phase: 'inspection', isComplete: milestone('binsr_sent') },
  { id: 'binsr_resolved', label: 'BINSR Resolved', phase: 'inspection', isComplete: milestone('binsr_resolved') },

  // Disclosures
  { id: 'spds_reviewed', label: 'SPDS Reviewed', phase: 'disclosures', isComplete: milestone('spds_reviewed') },
  { id: 'clue_report_reviewed', label: 'CLUE Report', phase: 'disclosures', isComplete: milestone('clue_report_reviewed') },
  { id: 'hoa_docs_received', label: 'HOA Docs', phase: 'disclosures', conditional: (c) => c.hasHoa, isComplete: milestone('hoa_docs_received') },

  // Title
  { id: 'title_commitment_received', label: 'Title Commitment', phase: 'title', isComplete: milestone('title_commitment_received') },
  { id: 'escrow_opened', label: 'Escrow Opened', phase: 'title', isComplete: milestone('escrow_opened') },

  // Financing
  { id: 'appraisal_ordered', label: 'Appraisal Ordered', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_ordered') },
  { id: 'appraisal_complete', label: 'Appraisal Complete', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_complete') },
  { id: 'loan_conditions_met', label: 'Loan Conditions Met', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('loan_conditions_met') },
  { id: 'clear_to_close', label: 'Clear to Close', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('clear_to_close') },

  // Pre-Close
  { id: 'insurance_bound', label: 'Insurance Bound', phase: 'pre_close', isComplete: milestone('insurance_bound') },
  { id: 'closing_disclosure_reviewed', label: 'Closing Disclosure', phase: 'pre_close', conditional: (c) => c.financingType === 'financed', isComplete: milestone('closing_disclosure_reviewed') },
  { id: 'final_walkthrough_complete', label: 'Final Walkthrough', phase: 'pre_close', isComplete: milestone('final_walkthrough_complete') },
  { id: 'funds_wired', label: 'Funds Wired', phase: 'pre_close', isComplete: milestone('funds_wired') },

  // Closing Day
  { id: 'documents_signed', label: 'Documents Signed', phase: 'closing', isComplete: milestone('documents_signed') },
  { id: 'deed_recorded', label: 'Deed Recorded', phase: 'closing', isComplete: milestone('deed_recorded') },
  { id: 'keys_received', label: 'Keys Received 🏡', phase: 'closing', isComplete: milestone('keys_received') },
]

const AZ_PHASES: ClosingPhase[] = ['inspection', 'disclosures', 'title', 'financing', 'pre_close', 'closing']

// ─── Texas ────────────────────────────────────────────────────────────────────
// TX has an option period (unrestricted right to terminate) during which inspection occurs.
// No separate inspection phase — it is folded into the option period.
// No separate disclosures phase — Seller's Disclosure Notice is a title-phase milestone.

const TX_STEPS: ClosingStep[] = [
  // Option Period — buyer has unrestricted right to terminate; inspection happens here
  { id: 'option_fee_delivered', label: 'Option Fee Delivered', phase: 'option', isComplete: milestone('option_fee_delivered') },
  { id: 'inspection_complete', label: 'Inspection Complete', phase: 'option', isComplete: milestone('inspection_complete') },
  { id: 'amendment_negotiated', label: 'Amendment to Contract', phase: 'option', isComplete: milestone('amendment_negotiated') },
  { id: 'option_period_expired', label: 'Option Period Expired', phase: 'option', isComplete: milestone('option_period_expired') },

  // Title & Disclosures
  { id: 'title_commitment_received', label: 'Title Commitment', phase: 'title', isComplete: milestone('title_commitment_received') },
  { id: 'survey_received', label: 'Survey / T-47', phase: 'title', isComplete: milestone('survey_received') },
  { id: 'seller_disclosure_reviewed', label: "Seller's Disclosure Notice", phase: 'title', isComplete: milestone('seller_disclosure_reviewed') },
  { id: 'hoa_docs_received', label: 'HOA Docs', phase: 'title', conditional: (c) => c.hasHoa, isComplete: milestone('hoa_docs_received') },

  // Financing
  { id: 'appraisal_ordered', label: 'Appraisal Ordered', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_ordered') },
  { id: 'appraisal_complete', label: 'Appraisal Complete', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_complete') },
  { id: 'loan_conditions_met', label: 'Loan Conditions Met', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('loan_conditions_met') },
  { id: 'clear_to_close', label: 'Clear to Close', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('clear_to_close') },

  // Pre-Close
  { id: 'insurance_bound', label: 'Insurance Bound', phase: 'pre_close', isComplete: milestone('insurance_bound') },
  { id: 'closing_disclosure_reviewed', label: 'Closing Disclosure', phase: 'pre_close', conditional: (c) => c.financingType === 'financed', isComplete: milestone('closing_disclosure_reviewed') },
  { id: 'final_walkthrough_complete', label: 'Final Walkthrough', phase: 'pre_close', isComplete: milestone('final_walkthrough_complete') },
  { id: 'funds_wired', label: 'Funds Wired', phase: 'pre_close', isComplete: milestone('funds_wired') },

  // Closing Day
  { id: 'documents_signed', label: 'Documents Signed', phase: 'closing', isComplete: milestone('documents_signed') },
  { id: 'deed_recorded', label: 'Deed Recorded', phase: 'closing', isComplete: milestone('deed_recorded') },
  { id: 'keys_received', label: 'Keys Received 🏡', phase: 'closing', isComplete: milestone('keys_received') },
]

const TX_PHASES: ClosingPhase[] = ['option', 'title', 'financing', 'pre_close', 'closing']

// ─── Nevada ────────────────────────────────────────────────────────────────────
// NV has a Due Diligence Period (10–15 days) during which inspection, SRPD review,
// and HOA doc review all happen. Buyer can cancel for any reason during this period.
// No separate inspection phase — folded into due diligence.

const NV_STEPS: ClosingStep[] = [
  // Due Diligence — buyer can cancel for any reason; inspection happens here
  { id: 'inspection_complete', label: 'Inspection Complete', phase: 'due_diligence', isComplete: milestone('inspection_complete') },
  { id: 'srpd_reviewed', label: "Seller's Disclosure (SRPD)", phase: 'due_diligence', isComplete: milestone('srpd_reviewed') },
  { id: 'hoa_docs_received', label: 'HOA Docs', phase: 'due_diligence', conditional: (c) => c.hasHoa, isComplete: milestone('hoa_docs_received') },
  { id: 'addendum_negotiated', label: 'Addendum Signed', phase: 'due_diligence', isComplete: milestone('addendum_negotiated') },
  { id: 'due_diligence_expired', label: 'Due Diligence Expired', phase: 'due_diligence', isComplete: milestone('due_diligence_expired') },

  // Title
  { id: 'title_commitment_received', label: 'Title Commitment', phase: 'title', isComplete: milestone('title_commitment_received') },
  { id: 'escrow_opened', label: 'Escrow Opened', phase: 'title', isComplete: milestone('escrow_opened') },

  // Financing
  { id: 'appraisal_ordered', label: 'Appraisal Ordered', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_ordered') },
  { id: 'appraisal_complete', label: 'Appraisal Complete', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_complete') },
  { id: 'loan_conditions_met', label: 'Loan Conditions Met', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('loan_conditions_met') },
  { id: 'clear_to_close', label: 'Clear to Close', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('clear_to_close') },

  // Pre-Close
  { id: 'insurance_bound', label: 'Insurance Bound', phase: 'pre_close', isComplete: milestone('insurance_bound') },
  { id: 'closing_disclosure_reviewed', label: 'Closing Disclosure', phase: 'pre_close', conditional: (c) => c.financingType === 'financed', isComplete: milestone('closing_disclosure_reviewed') },
  { id: 'final_walkthrough_complete', label: 'Final Walkthrough', phase: 'pre_close', isComplete: milestone('final_walkthrough_complete') },
  { id: 'funds_wired', label: 'Funds Wired', phase: 'pre_close', isComplete: milestone('funds_wired') },

  // Closing Day
  { id: 'documents_signed', label: 'Documents Signed', phase: 'closing', isComplete: milestone('documents_signed') },
  { id: 'deed_recorded', label: 'Deed Recorded', phase: 'closing', isComplete: milestone('deed_recorded') },
  { id: 'keys_received', label: 'Keys Received 🏡', phase: 'closing', isComplete: milestone('keys_received') },
]

const NV_PHASES: ClosingPhase[] = ['due_diligence', 'title', 'financing', 'pre_close', 'closing']

// ─── Utah ─────────────────────────────────────────────────────────────────────
// UT has a Due Diligence Deadline (default 14 days) — same concept as NV.
// Inspection and SPCD review happen during due diligence.

const UT_STEPS: ClosingStep[] = [
  // Due Diligence
  { id: 'inspection_complete', label: 'Inspection Complete', phase: 'due_diligence', isComplete: milestone('inspection_complete') },
  { id: 'spcd_reviewed', label: 'Seller Disclosure (SPCD)', phase: 'due_diligence', isComplete: milestone('spcd_reviewed') },
  { id: 'hoa_docs_received', label: 'HOA Docs', phase: 'due_diligence', conditional: (c) => c.hasHoa, isComplete: milestone('hoa_docs_received') },
  { id: 'due_diligence_expired', label: 'Due Diligence Expired', phase: 'due_diligence', isComplete: milestone('due_diligence_expired') },

  // Title
  { id: 'title_commitment_received', label: 'Title Commitment', phase: 'title', isComplete: milestone('title_commitment_received') },

  // Financing
  { id: 'appraisal_ordered', label: 'Appraisal Ordered', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_ordered') },
  { id: 'appraisal_complete', label: 'Appraisal Complete', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('appraisal_complete') },
  { id: 'loan_conditions_met', label: 'Loan Conditions Met', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('loan_conditions_met') },
  { id: 'clear_to_close', label: 'Clear to Close', phase: 'financing', conditional: (c) => c.financingType === 'financed', isComplete: milestone('clear_to_close') },

  // Pre-Close
  { id: 'insurance_bound', label: 'Insurance Bound', phase: 'pre_close', isComplete: milestone('insurance_bound') },
  { id: 'closing_disclosure_reviewed', label: 'Closing Disclosure', phase: 'pre_close', conditional: (c) => c.financingType === 'financed', isComplete: milestone('closing_disclosure_reviewed') },
  { id: 'final_walkthrough_complete', label: 'Final Walkthrough', phase: 'pre_close', isComplete: milestone('final_walkthrough_complete') },
  { id: 'funds_wired', label: 'Funds Wired', phase: 'pre_close', isComplete: milestone('funds_wired') },

  // Closing Day
  { id: 'documents_signed', label: 'Documents Signed', phase: 'closing', isComplete: milestone('documents_signed') },
  { id: 'deed_recorded', label: 'Deed Recorded', phase: 'closing', isComplete: milestone('deed_recorded') },
  { id: 'keys_received', label: 'Keys Received 🏡', phase: 'closing', isComplete: milestone('keys_received') },
]

const UT_PHASES: ClosingPhase[] = ['due_diligence', 'title', 'financing', 'pre_close', 'closing']

// ─── Default (non-financing, no agency disclosure) ────────────────────────────

const DEFAULT_STEPS = CO_STEPS  // all states use CO steps as a base for now

// ─── Registry ─────────────────────────────────────────────────────────────────

const WORKFLOWS: Record<string, StateClosingWorkflow> = {
  CO: { state: 'CO', stateName: 'Colorado', phases: CO_PHASES, steps: CO_STEPS },
  AZ: { state: 'AZ', stateName: 'Arizona', phases: AZ_PHASES, steps: AZ_STEPS },
  TX: { state: 'TX', stateName: 'Texas', phases: TX_PHASES, steps: TX_STEPS },
  NV: { state: 'NV', stateName: 'Nevada', phases: NV_PHASES, steps: NV_STEPS },
  UT: { state: 'UT', stateName: 'Utah', phases: UT_PHASES, steps: UT_STEPS },
}

export function getClosingWorkflow(propertyState?: string): StateClosingWorkflow {
  const key = (propertyState ?? '').toUpperCase()
  return WORKFLOWS[key] ?? {
    state: key || 'N/A',
    stateName: propertyState ?? 'Unknown',
    phases: CO_PHASES,
    steps: DEFAULT_STEPS,
  }
}

/** Returns the steps visible for this specific closing (conditional steps filtered) */
export function getVisibleSteps(workflow: StateClosingWorkflow, closing: Closing): ClosingStep[] {
  return workflow.steps.filter((s) => !s.conditional || s.conditional(closing))
}

/** Returns the label of the current active phase */
export function getActivePhase(workflow: StateClosingWorkflow, closing: Closing): ClosingPhase {
  const visible = getVisibleSteps(workflow, closing)
  for (const phase of workflow.phases) {
    const phaseSteps = visible.filter((s) => s.phase === phase)
    if (phaseSteps.length > 0 && phaseSteps.some((s) => !s.isComplete(closing))) {
      return phase
    }
  }
  return workflow.phases[workflow.phases.length - 1]
}
