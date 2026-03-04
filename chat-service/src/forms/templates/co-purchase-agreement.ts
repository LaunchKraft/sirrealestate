import PDFDocument from 'pdfkit'

export interface CoPurchaseAgreementData {
  generatedDate: string
  listingAddress: string
  buyers: Array<{
    fullLegalName: string
    street: string
    unit?: string
    city: string
    state: string
    zipCode: string
    phone: string
    email: string
    isPrimaryBuyer: boolean
  }>
  offerPrice: number
  earnestMoneyAmount: number
  closingDate: string
  possessionDate?: string
  financingType: 'cash' | 'financed'
  loanAmount?: number
  loanType?: string
  downPaymentAmount?: number
  lenderName?: string
  inspectionContingency: boolean
  inspectionPeriodDays?: number
  appraisalContingency: boolean
  financingContingency: boolean
  financingDeadlineDays?: number
  saleOfExistingHomeContingency?: boolean
  sellerConcessions?: number
  inclusions?: string[]
  exclusions?: string[]
}

const BLUE = '#00BFEB'
const DARK = '#1a2233'
const MUTED = '#64748b'
const RULE = '#e2e8f0'

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function rule(doc: PDFKit.PDFDocument, y?: number): void {
  const yPos = y ?? doc.y
  doc.moveTo(50, yPos).lineTo(doc.page.width - 50, yPos).lineWidth(0.5).strokeColor(RULE).stroke()
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.6)
  rule(doc)
  doc.moveDown(0.4)
  doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE).text(title.toUpperCase())
  doc.moveDown(0.3)
  doc.font('Helvetica').fillColor(DARK)
}

function row(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const labelWidth = 160
  const x = 50
  const y = doc.y
  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text(label, x, y, { width: labelWidth, lineBreak: false })
  doc.fontSize(9).font('Helvetica').fillColor(DARK).text(value, x + labelWidth, y, { width: doc.page.width - 50 - x - labelWidth })
  doc.moveDown(0.25)
}

function checklist(doc: PDFKit.PDFDocument, items: Array<{ label: string; checked: boolean; note?: string }>): void {
  for (const item of items) {
    const mark = item.checked ? '☑' : '☐'
    const note = item.note ? `  (${item.note})` : ''
    doc.fontSize(9).font('Helvetica').fillColor(DARK).text(`${mark}  ${item.label}${note}`, 60)
    doc.moveDown(0.2)
  }
}

export function generateCoPurchaseAgreement(data: CoPurchaseAgreementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'Purchase Agreement' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(16).font('Helvetica-Bold').fillColor(DARK)
      .text('RESIDENTIAL PURCHASE AGREEMENT', { align: 'center' })
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
      .text('Colorado — Generic Form (Not a CREC-Approved Form)', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })

    // ── Property ─────────────────────────────────────────────────────────────
    sectionHeader(doc, '1. Property')
    row(doc, 'Property Address', data.listingAddress)

    // ── Buyer(s) ─────────────────────────────────────────────────────────────
    sectionHeader(doc, '2. Buyer(s)')
    for (const buyer of data.buyers) {
      const addr = [buyer.street, buyer.unit, `${buyer.city}, ${buyer.state} ${buyer.zipCode}`]
        .filter(Boolean).join(' · ')
      row(doc, buyer.isPrimaryBuyer ? 'Primary Buyer' : 'Co-Buyer', buyer.fullLegalName)
      row(doc, 'Address', addr)
      row(doc, 'Phone / Email', `${buyer.phone}  |  ${buyer.email}`)
      doc.moveDown(0.2)
    }

    // ── Purchase Price ────────────────────────────────────────────────────────
    sectionHeader(doc, '3. Purchase Price')
    row(doc, 'Purchase Price', fmt(data.offerPrice))
    row(doc, 'Earnest Money Deposit', fmt(data.earnestMoneyAmount))

    // ── Financing ─────────────────────────────────────────────────────────────
    sectionHeader(doc, '4. Financing')
    row(doc, 'Financing Type', data.financingType === 'cash' ? 'All Cash' : 'Financed')
    if (data.financingType === 'financed') {
      if (data.lenderName)        row(doc, 'Lender', data.lenderName)
      if (data.loanType)          row(doc, 'Loan Type', data.loanType.toUpperCase())
      if (data.loanAmount)        row(doc, 'Loan Amount', fmt(data.loanAmount))
      if (data.downPaymentAmount) row(doc, 'Down Payment', fmt(data.downPaymentAmount))
    }

    // ── Contingencies ─────────────────────────────────────────────────────────
    sectionHeader(doc, '5. Contingencies')
    checklist(doc, [
      {
        label: 'Inspection',
        checked: data.inspectionContingency,
        note: data.inspectionContingency
          ? `${data.inspectionPeriodDays ?? 10}-day inspection period`
          : undefined,
      },
      { label: 'Appraisal', checked: data.appraisalContingency },
      {
        label: 'Financing',
        checked: data.financingContingency,
        note: data.financingContingency
          ? `loan commitment within ${data.financingDeadlineDays ?? 21} days`
          : undefined,
      },
      {
        label: 'Sale of Existing Home',
        checked: data.saleOfExistingHomeContingency ?? false,
      },
    ])

    // ── Closing & Possession ──────────────────────────────────────────────────
    sectionHeader(doc, '6. Closing & Possession')
    row(doc, 'Closing Date', fmtDate(data.closingDate))
    row(doc, 'Possession Date', data.possessionDate ? fmtDate(data.possessionDate) : 'At Closing')

    // ── Inclusions & Exclusions ───────────────────────────────────────────────
    sectionHeader(doc, '7. Inclusions & Exclusions')
    row(doc, 'Inclusions', data.inclusions?.length ? data.inclusions.join(', ') : 'None stated')
    row(doc, 'Exclusions', data.exclusions?.length ? data.exclusions.join(', ') : 'None stated')

    // ── Seller Concessions ────────────────────────────────────────────────────
    sectionHeader(doc, '8. Seller Concessions')
    row(doc, 'Seller-Paid Costs', data.sellerConcessions ? fmt(data.sellerConcessions) : 'None')

    // ── Signature Block ───────────────────────────────────────────────────────
    sectionHeader(doc, '9. Buyer Acceptance')
    doc.moveDown(0.5)
    for (const buyer of data.buyers) {
      const y = doc.y
      doc.moveTo(60, y + 30).lineTo(280, y + 30).lineWidth(0.5).strokeColor(DARK).stroke()
      doc.moveTo(310, y + 30).lineTo(530, y + 30).lineWidth(0.5).strokeColor(DARK).stroke()
      doc.moveDown(0.2)
      doc.fontSize(8).fillColor(MUTED)
        .text(buyer.fullLegalName, 60, doc.y, { width: 220, lineBreak: false })
      doc.text('Date', 310, doc.y, { width: 220 })
      doc.moveDown(1)
    }

    // ── Disclaimer ────────────────────────────────────────────────────────────
    doc.moveDown(1)
    rule(doc)
    doc.moveDown(0.4)
    doc.fontSize(7).fillColor(MUTED)
      .text(
        'IMPORTANT: This is a generic purchase agreement generated for informational purposes only. ' +
        'It has not been approved by the Colorado Real Estate Commission (CREC). ' +
        'For binding real estate transactions in Colorado, parties should use CREC-approved forms (CBS1) ' +
        'and seek qualified legal counsel.',
        { lineGap: 2 },
      )

    doc.end()
  })
}

