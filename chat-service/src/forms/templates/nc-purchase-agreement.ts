import PDFDocument from 'pdfkit'

export interface NcPurchaseAgreementData {
  generatedDate: string
  listingAddress: string
  purchasePrice: number
  earnestMoneyAmount: number
  /** Non-refundable due diligence fee paid directly to seller — NC-specific */
  dueDiligenceFee: number
  closingDate: string
  /** Due diligence period in calendar days — typically 14–21 */
  dueDiligenceDays: number
  possessionDate?: string
  buyers: Array<{ fullLegalName: string; street: string; city: string; state: string; zipCode: string; phone: string; email: string }>
  financing: { type: 'cash' | 'financed'; loanType?: string; loanAmount?: number; downPaymentAmount?: number }
  inclusions?: string[]
  exclusions?: string[]
  sellerConcessions?: number
  hasHoa: boolean
  contingencies: { appraisal: boolean; financing: boolean }
  titleCompany?: string
}

const BLUE = '#00BFEB'
const DARK = '#1a2233'
const MUTED = '#6b7280'
const RULE = '#e2e8f0'

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function rule(doc: PDFKit.PDFDocument): void {
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).strokeColor(RULE).stroke()
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.6)
  rule(doc)
  doc.moveDown(0.4)
  doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE).text(title.toUpperCase())
  doc.moveDown(0.3)
  doc.fontSize(10).font('Helvetica').fillColor(DARK)
}

function row(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const labelWidth = 175
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

export function generateNcPurchaseAgreement(data: NcPurchaseAgreementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'North Carolina Offer to Purchase and Contract' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
      .text('NORTH CAROLINA OFFER TO PURCHASE AND CONTRACT', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text(
        'Based on NC Realtors / NC Bar Association Form 2-T — For Educational/Reference Purposes. ' +
        'Your agent will complete the official jointly-approved form.',
        { align: 'center' },
      )
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })
    doc.moveDown(0.3)

    // ── 1. Property ───────────────────────────────────────────────────────
    sectionHeader(doc, '1. Property & Parties')
    row(doc, 'Property Address', data.listingAddress)
    row(doc, 'Date Generated', fmtDate(data.generatedDate))

    // ── 2. Buyer(s) ───────────────────────────────────────────────────────
    sectionHeader(doc, '2. Buyer(s)')
    for (let i = 0; i < data.buyers.length; i++) {
      const buyer = data.buyers[i]
      row(doc, i === 0 ? 'Primary Buyer' : 'Co-Buyer', buyer.fullLegalName)
      row(doc, 'Address', `${buyer.street}, ${buyer.city}, ${buyer.state} ${buyer.zipCode}`)
      row(doc, 'Phone / Email', `${buyer.phone}  |  ${buyer.email}`)
      doc.moveDown(0.2)
    }

    // ── 3. Purchase Price ─────────────────────────────────────────────────
    sectionHeader(doc, '3. Purchase Price')
    if (data.financing.type === 'financed' && data.financing.loanAmount && data.financing.downPaymentAmount) {
      row(doc, 'Down Payment', fmt(data.financing.downPaymentAmount))
      row(doc, 'Loan Amount', fmt(data.financing.loanAmount))
      row(doc, 'Purchase Price', fmt(data.purchasePrice))
    } else {
      row(doc, 'Purchase Price', fmt(data.purchasePrice))
    }

    // ── 4. Due Diligence (NC-specific) ────────────────────────────────────
    sectionHeader(doc, '4. Due Diligence Period (North Carolina)')
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'IMPORTANT: North Carolina uses a unique Due Diligence structure. The buyer pays a ' +
        'Due Diligence Fee directly to the Seller at the time the offer is accepted. ' +
        'This fee is NON-REFUNDABLE if the buyer terminates before the end of the Due Diligence Period, ' +
        'but is credited toward the purchase price at closing.',
        60, doc.y, { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.4)
    row(doc, 'Due Diligence Fee', `${fmt(data.dueDiligenceFee)}  (paid directly to Seller — NON-REFUNDABLE)`)
    row(doc, 'Due Diligence Period', `${data.dueDiligenceDays} calendar days from acceptance`)
    row(doc, 'Earnest Money Deposit', `${fmt(data.earnestMoneyAmount)}  (held in escrow by closing attorney)`)
    doc.moveDown(0.2)
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'During the Due Diligence Period, Buyer has the right to conduct all inspections and investigations ' +
        'and may terminate for any reason with loss of only the Due Diligence Fee. ' +
        'After the Due Diligence Period ends, the Earnest Money Deposit also becomes at risk.',
        60, doc.y, { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.4)

    // ── 5. Financing ──────────────────────────────────────────────────────
    sectionHeader(doc, '5. Financing')
    row(doc, 'Financing Type', data.financing.type === 'cash' ? 'All Cash' : 'Financed')
    if (data.financing.type === 'financed') {
      if (data.financing.loanType)          row(doc, 'Loan Type', data.financing.loanType.toUpperCase())
      if (data.financing.loanAmount)        row(doc, 'Loan Amount', fmt(data.financing.loanAmount))
      if (data.financing.downPaymentAmount) row(doc, 'Down Payment', fmt(data.financing.downPaymentAmount))
    } else {
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text('This is a cash purchase. No financing contingency applies.', 60)
      doc.moveDown(0.3)
    }

    // ── 6. Key Dates ──────────────────────────────────────────────────────
    sectionHeader(doc, '6. Key Dates')
    row(doc, 'Settlement Date (Closing)', fmtDate(data.closingDate))
    row(doc, 'Possession Date', data.possessionDate ? fmtDate(data.possessionDate) : 'At Closing')

    // ── 7. Contingencies ──────────────────────────────────────────────────
    sectionHeader(doc, '7. Contingencies')
    doc.fontSize(8).font('Helvetica').fillColor(MUTED)
      .text('Note: In NC, inspection is covered by the Due Diligence Period rather than a separate contingency.', 60)
    doc.moveDown(0.3)
    checklist(doc, [
      { label: 'Appraisal', checked: data.contingencies.appraisal },
      { label: 'Financing', checked: data.contingencies.financing },
    ])

    // ── 8. HOA ────────────────────────────────────────────────────────────
    if (data.hasHoa) {
      sectionHeader(doc, '8. HOA')
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(
          'This property is subject to a Homeowners Association. ' +
          'Seller must provide all HOA documents, rules, and financial statements. ' +
          'Buyer should review all HOA documents during the Due Diligence Period.',
        )
      doc.moveDown(0.3)
    }

    // ── Title & Attorney ──────────────────────────────────────────────────
    if (data.titleCompany) {
      sectionHeader(doc, 'Closing Attorney')
      row(doc, 'Closing Attorney / Firm', data.titleCompany)
    }

    // ── Inclusions & Exclusions ───────────────────────────────────────────
    if ((data.inclusions && data.inclusions.length > 0) || (data.exclusions && data.exclusions.length > 0)) {
      sectionHeader(doc, 'Inclusions & Exclusions')
      row(doc, 'Inclusions', data.inclusions?.length ? data.inclusions.join(', ') : 'None stated')
      row(doc, 'Exclusions', data.exclusions?.length ? data.exclusions.join(', ') : 'None stated')
    }

    // ── Seller Concessions ────────────────────────────────────────────────
    if (data.sellerConcessions) {
      sectionHeader(doc, 'Seller Concessions')
      row(doc, 'Seller-Paid Costs', fmt(data.sellerConcessions))
    }

    // ── Seller Disclosure ─────────────────────────────────────────────────
    sectionHeader(doc, "Seller's Residential Property Disclosure")
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'Per NC G.S. § 47E, the Seller is required to provide a Residential Property Disclosure Statement. ' +
        'Buyer should review the disclosure and raise any concerns during the Due Diligence Period.',
      )
    doc.moveDown(0.3)

    // ── Buyer Signature Block ─────────────────────────────────────────────
    sectionHeader(doc, 'Buyer Offer')
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

    // ── Disclaimer ────────────────────────────────────────────────────────
    doc.moveDown(1)
    rule(doc)
    doc.moveDown(0.4)
    doc.fontSize(7).fillColor(MUTED)
      .text(
        'IMPORTANT: This is a system-generated summary for reference purposes only, based on the NC Realtors / NC Bar Association Form 2-T structure. ' +
        'It is not a legally binding document. Your real estate agent will prepare the official jointly-approved NC form for your signature. ' +
        'North Carolina real estate transactions must be closed by a licensed NC attorney. ' +
        'Consult a qualified real estate attorney for legal advice.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
