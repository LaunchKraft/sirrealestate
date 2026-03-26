import PDFDocument from 'pdfkit'

export interface NvPurchaseAgreementData {
  generatedDate: string
  listingAddress: string
  purchasePrice: number
  earnestMoneyAmount: number
  closingDate: string
  dueDiligenceDays: number           // default 10; buyer may cancel for any reason during this period
  possessionDate?: string
  buyers: Array<{ fullLegalName: string; street: string; city: string; state: string; zipCode: string; phone: string; email: string }>
  financing: { type: 'cash' | 'financed'; loanType?: string; loanAmount?: number; downPaymentAmount?: number }
  inclusions?: string[]
  exclusions?: string[]
  sellerConcessions?: number
  hasHoa: boolean
  contingencies: { inspection: boolean; appraisal: boolean; financing: boolean }
  escrowCompany?: string
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

export function generateNvPurchaseAgreement(data: NvPurchaseAgreementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'NVAR Residential Purchase Agreement' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
      .text('NEVADA RESIDENTIAL PURCHASE AGREEMENT', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text(
        'Based on NVAR Residential Purchase Agreement — For Educational/Reference Purposes. ' +
        'Your agent will complete the official NVAR form.',
        { align: 'center' },
      )
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })
    doc.moveDown(0.3)

    // ── 1. Property & Parties ─────────────────────────────────────────────
    sectionHeader(doc, '1. Property & Parties')
    row(doc, 'Property Address', data.listingAddress)
    row(doc, 'Date Generated', fmtDate(data.generatedDate))

    // ── 2. Buyer(s) ───────────────────────────────────────────────────────
    sectionHeader(doc, '2. Buyer(s)')
    for (let i = 0; i < data.buyers.length; i++) {
      const buyer = data.buyers[i]
      const addr = `${buyer.street}, ${buyer.city}, ${buyer.state} ${buyer.zipCode}`
      row(doc, i === 0 ? 'Primary Buyer' : 'Co-Buyer', buyer.fullLegalName)
      row(doc, 'Address', addr)
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

    // ── 4. Earnest Money Deposit ──────────────────────────────────────────
    sectionHeader(doc, '4. Earnest Money Deposit')
    row(doc, 'Earnest Money Amount', fmt(data.earnestMoneyAmount))
    row(doc, 'Held By', data.escrowCompany ?? 'Escrow/Title Company (to be designated)')
    row(doc, 'EMD Deadline', 'Within 3 business days of acceptance')
    doc.moveDown(0.2)
    doc.fontSize(8).font('Helvetica').fillColor(DARK)
      .text(
        'The earnest money deposit is refundable if the buyer cancels during the Due Diligence Period or if a ' +
        'contingency is not satisfied. After the Due Diligence Period expires, the deposit may be at risk if ' +
        'buyer cancels without a remaining contingency.',
        60,
        doc.y,
        { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.4)

    // ── 5. Due Diligence Period ───────────────────────────────────────────
    // NV-unique — buyer has unconditional right to cancel during this period
    sectionHeader(doc, '5. Due Diligence Period')
    doc.moveDown(0.2)
    const ddBoxY = doc.y
    doc.rect(50, ddBoxY, doc.page.width - 100, 72).fill('#f0f9ff')
    doc.fillColor(DARK)
    doc.moveDown(0.1)

    row(doc, 'Due Diligence Period', `${data.dueDiligenceDays} days from acceptance`)
    doc.moveDown(0.3)
    doc.fontSize(8).font('Helvetica').fillColor(DARK)
      .text(
        `Buyer has ${data.dueDiligenceDays} calendar days from the date of acceptance to conduct inspections, ` +
        'review HOA documents, obtain financing approval, and evaluate any other matters. ' +
        'Buyer may cancel for any reason during this period and receive a full refund of the earnest money deposit.',
        60,
        doc.y,
        { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.5)

    // ── 6. Financing ──────────────────────────────────────────────────────
    sectionHeader(doc, '6. Financing')
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

    // ── 7. Key Dates ──────────────────────────────────────────────────────
    sectionHeader(doc, '7. Key Dates')
    row(doc, 'Closing Date', fmtDate(data.closingDate))
    row(doc, 'Possession Date', data.possessionDate ? fmtDate(data.possessionDate) : 'At Closing')

    // ── 8. Contingencies ──────────────────────────────────────────────────
    sectionHeader(doc, '8. Contingencies')
    checklist(doc, [
      {
        label: 'Inspection / Due Diligence',
        checked: data.contingencies.inspection,
        note: data.contingencies.inspection ? 'Inspection occurs during Due Diligence Period' : undefined,
      },
      { label: 'Appraisal', checked: data.contingencies.appraisal },
      { label: 'Financing', checked: data.contingencies.financing },
    ])

    // ── 9. Escrow / Title ─────────────────────────────────────────────────
    if (data.escrowCompany) {
      sectionHeader(doc, '9. Escrow Company')
      row(doc, 'Escrow Company', data.escrowCompany)
    }

    // ── 10. HOA ───────────────────────────────────────────────────────────
    if (data.hasHoa) {
      sectionHeader(doc, data.escrowCompany ? '10. HOA' : '9. HOA')
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(
          'This property is subject to a Homeowners Association (per NRS Chapter 116). ' +
          'Seller must provide HOA documents within the statutory timeframe. ' +
          'Buyer has the right to review HOA documents during the Due Diligence Period. ' +
          'Resale package fees are typically paid by the seller.',
        )
      doc.moveDown(0.3)
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

    // ── Seller Disclosure Notice ──────────────────────────────────────────
    sectionHeader(doc, "Seller's Real Property Disclosure (SRPD)")
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'Per NRS 113.130, the Seller is required to provide a Seller\'s Real Property Disclosure form. ' +
        'Buyer should review the SRPD and raise any concerns during the Due Diligence Period.',
      )
    doc.moveDown(0.3)

    // ── Buyer Signature Block ─────────────────────────────────────────────
    sectionHeader(doc, 'Buyer Acceptance')
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
        'IMPORTANT: This is a system-generated summary for reference purposes only, based on the NVAR Residential Purchase Agreement structure. ' +
        'It is not a legally binding document. Your real estate agent will prepare the official NVAR form for your signature. ' +
        'Nevada law (NRS 645) requires real estate licensees to use approved forms. ' +
        'Consult a qualified real estate attorney for legal advice.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
