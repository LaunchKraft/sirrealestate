/**
 * Form taxonomy — defines every document the platform can generate or request.
 *
 * Each entry describes:
 *   - which state(s) it applies to ('*' = universal)
 *   - whether it requires an e-signature (routed through Dropbox Sign)
 *   - who the signers are
 *   - the fields needed, with descriptions the AI can use to prompt the user
 *     and offerPath hints so the generator can auto-fill from the Offer model
 *
 * Adding a new form = one new entry here + one new template file.
 */

export type FormType =
  | 'purchase_agreement'
  | 'earnest_money_agreement'
  | 'agency_disclosure'

export type SignerRole = 'buyer' | 'seller' | 'agent'

export interface FormFieldDef {
  key: string
  label: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'string[]'
  description: string
  required: boolean
  /** Dot-notation path into the Offer object where this value can be auto-filled from. */
  offerPath?: string
}

export interface FormTaxonomyEntry {
  formType: FormType
  displayName: string
  description: string
  /** State codes this form applies to, or ['*'] for all states. */
  states: string[]
  requiresSignature: boolean
  signers: SignerRole[]
  fields: FormFieldDef[]
}

export const FORM_TAXONOMY: FormTaxonomyEntry[] = [
  {
    formType: 'purchase_agreement',
    displayName: 'Purchase Agreement',
    description:
      'Residential real estate purchase contract defining the price, terms, contingencies, ' +
      'and closing details for the sale of a property.',
    states: ['CO'],
    requiresSignature: true,
    signers: ['buyer'],
    fields: [
      // Property
      { key: 'listingAddress',      label: 'Property Address',      type: 'string',   required: true,  offerPath: 'listingAddress',                           description: 'Full street address of the property being purchased.' },
      // Buyers
      { key: 'buyerNames',          label: 'Buyer Legal Name(s)',   type: 'string[]', required: true,  offerPath: 'buyers[*].fullLegalName',                  description: 'Full legal name(s) of all buyers as they should appear on the contract.' },
      { key: 'buyerAddresses',      label: 'Buyer Address(es)',     type: 'string[]', required: true,  offerPath: 'buyers[*].street',                         description: 'Mailing address(es) of all buyers.' },
      // Price and earnest money
      { key: 'offerPrice',          label: 'Purchase Price',        type: 'number',   required: true,  offerPath: 'terms.offerPrice',                         description: 'Agreed purchase price in dollars.' },
      { key: 'earnestMoneyAmount',  label: 'Earnest Money',         type: 'number',   required: true,  offerPath: 'terms.earnestMoneyAmount',                 description: 'Earnest money deposit amount in dollars.' },
      // Closing
      { key: 'closingDate',         label: 'Closing Date',          type: 'date',     required: true,  offerPath: 'terms.closingDate',                        description: 'Target closing date (YYYY-MM-DD).' },
      { key: 'possessionDate',      label: 'Possession Date',       type: 'date',     required: false, offerPath: 'terms.possessionDate',                     description: 'Date buyer takes possession. Defaults to closing date if not specified.' },
      // Financing
      { key: 'financingType',       label: 'Financing Type',        type: 'string',   required: true,  offerPath: 'financing.type',                           description: '"cash" or "financed".' },
      { key: 'loanAmount',          label: 'Loan Amount',           type: 'number',   required: false, offerPath: 'financing.loanAmount',                     description: 'For financed offers: loan amount in dollars.' },
      { key: 'loanType',            label: 'Loan Type',             type: 'string',   required: false, offerPath: 'financing.loanType',                       description: 'For financed offers: conventional, fha, va, usda, or jumbo.' },
      { key: 'lenderName',          label: 'Lender',                type: 'string',   required: false, offerPath: 'financing.lenderName',                     description: 'For financed offers: name of the lending institution.' },
      { key: 'downPaymentAmount',   label: 'Down Payment',          type: 'number',   required: false, offerPath: 'financing.downPaymentAmount',               description: 'For financed offers: down payment in dollars.' },
      // Contingencies
      { key: 'inspectionContingency',    label: 'Inspection Contingency',       type: 'boolean', required: true,  offerPath: 'terms.contingencies.inspection',           description: 'Whether the offer includes an inspection contingency.' },
      { key: 'inspectionPeriodDays',     label: 'Inspection Period (days)',      type: 'number',  required: false, offerPath: 'terms.contingencies.inspectionPeriodDays', description: 'Number of days for inspection. Colorado default is 10.' },
      { key: 'appraisalContingency',     label: 'Appraisal Contingency',        type: 'boolean', required: true,  offerPath: 'terms.contingencies.appraisal',            description: 'Whether the offer includes an appraisal contingency.' },
      { key: 'financingContingency',     label: 'Financing Contingency',        type: 'boolean', required: true,  offerPath: 'terms.contingencies.financing',            description: 'Whether the offer includes a financing contingency.' },
      { key: 'financingDeadlineDays',    label: 'Financing Deadline (days)',    type: 'number',  required: false, offerPath: 'terms.contingencies.financingDeadlineDays', description: 'Days to secure loan commitment. Colorado default is 21.' },
      { key: 'saleOfExistingHome',       label: 'Sale of Existing Home',        type: 'boolean', required: false, offerPath: 'terms.contingencies.saleOfExistingHome',   description: 'Whether the offer is contingent on the buyer selling their current home.' },
      // Additional terms
      { key: 'sellerConcessions',   label: 'Seller Concessions',    type: 'number',   required: false, offerPath: 'terms.sellerConcessions',                  description: 'Dollar amount of seller-paid closing cost contribution.' },
      { key: 'inclusions',          label: 'Inclusions',            type: 'string[]', required: false, offerPath: 'terms.inclusions',                         description: 'Items included in the sale (appliances, fixtures, etc.).' },
      { key: 'exclusions',          label: 'Exclusions',            type: 'string[]', required: false, offerPath: 'terms.exclusions',                         description: 'Items the seller is keeping and not included in the sale.' },
    ],
  },

  {
    formType: 'earnest_money_agreement',
    displayName: 'Earnest Money Deposit Agreement',
    description:
      'Agreement documenting the earnest money deposit amount, due date, and escrow holder.',
    states: ['*'],
    requiresSignature: true,
    signers: ['buyer'],
    fields: [
      { key: 'listingAddress',     label: 'Property Address',   type: 'string', required: true,  offerPath: 'listingAddress',          description: 'Address of the property.' },
      { key: 'buyerNames',         label: 'Buyer Name(s)',      type: 'string[]', required: true, offerPath: 'buyers[*].fullLegalName', description: 'Full legal name(s) of all buyers.' },
      { key: 'earnestMoneyAmount', label: 'Deposit Amount',     type: 'number', required: true,  offerPath: 'terms.earnestMoneyAmount', description: 'Earnest money deposit in dollars.' },
      { key: 'closingDate',        label: 'Closing Date',       type: 'date',   required: true,  offerPath: 'terms.closingDate',        description: 'Target closing date (YYYY-MM-DD).' },
    ],
  },

  {
    formType: 'agency_disclosure',
    displayName: 'Agency Disclosure',
    description:
      'Discloses the brokerage relationship between the agent and the buyer prior to writing an offer. ' +
      'Must be signed before an offer can be submitted in Colorado.',
    states: ['CO'],
    requiresSignature: true,
    signers: ['buyer', 'agent'],
    fields: [
      { key: 'buyerNames', label: 'Buyer Name(s)', type: 'string[]', required: true, offerPath: 'buyers[*].fullLegalName', description: 'Full legal name(s) of all buyers.' },
      { key: 'brokerageName', label: 'Brokerage Name', type: 'string', required: true, description: 'Name of the brokerage representing the buyer.' },
      { key: 'agentName',     label: 'Agent Name',     type: 'string', required: true, description: 'Name of the licensed agent.' },
    ],
  },
]

/** Returns all form types applicable to a given state, in order they should be completed. */
export function getFormsForState(state: string): FormTaxonomyEntry[] {
  return FORM_TAXONOMY.filter(
    (entry) => entry.states.includes('*') || entry.states.includes(state.toUpperCase()),
  )
}

/** Look up a single form entry by type. */
export function getFormEntry(formType: FormType): FormTaxonomyEntry | undefined {
  return FORM_TAXONOMY.find((e) => e.formType === formType)
}
