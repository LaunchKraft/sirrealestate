export type DocumentType = 'pre_approval_letter' | 'unknown'

export interface TaxonomyField {
  key: string
  label: string
  type: 'string' | 'string[]' | 'number' | 'date'
  description: string
}

export interface TaxonomyEntry {
  type: DocumentType
  displayName: string
  description: string
  fields: TaxonomyField[]
  /** Key of the field that contains person names (string[]) — used for name-matching checks */
  nameField?: string
}

export const TAXONOMY: TaxonomyEntry[] = [
  {
    type: 'pre_approval_letter',
    displayName: 'Pre-Approval Letter',
    description: 'A letter from a mortgage lender confirming a borrower is pre-approved for a home loan up to a specified amount.',
    fields: [
      { key: 'approvedAmount',           label: 'Approved Amount',       type: 'number',   description: 'Maximum loan amount approved, as a number in dollars (no symbols)' },
      { key: 'expirationDate',           label: 'Expiration Date',       type: 'date',     description: 'Date the pre-approval expires, ISO 8601 (YYYY-MM-DD)' },
      { key: 'lenderName',               label: 'Lender',                type: 'string',   description: 'Full name of the lending institution' },
      { key: 'borrowerNames',            label: 'Borrower(s)',           type: 'string[]', description: 'Full names of all borrowers on the letter' },
      { key: 'loanType',                 label: 'Loan Type',             type: 'string',   description: 'Loan program (conventional, FHA, VA, USDA, jumbo)' },
      { key: 'propertyTypeRestrictions', label: 'Property Restrictions', type: 'string[]', description: 'Restrictions on eligible property types; empty array if none stated' },
    ],
    nameField: 'borrowerNames',
  },
]
