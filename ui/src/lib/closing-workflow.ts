import type { Closing } from '@/hooks/useClosings'

export type ClosingPhase = 'inspection' | 'title' | 'financing' | 'pre_close' | 'closing'

export const PHASE_LABEL: Record<ClosingPhase, string> = {
  inspection: 'Inspection',
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

// ─── Default (non-financing, no agency disclosure) ────────────────────────────

const DEFAULT_STEPS = CO_STEPS  // all states use CO steps as a base for now

// ─── Registry ─────────────────────────────────────────────────────────────────

const WORKFLOWS: Record<string, StateClosingWorkflow> = {
  CO: { state: 'CO', stateName: 'Colorado', phases: CO_PHASES, steps: CO_STEPS },
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
