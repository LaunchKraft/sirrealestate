import PDFDocument from 'pdfkit'

export interface TxOneToFourData {
  generatedDate: string
  listingAddress: string
  purchasePrice: number
  earnestMoneyAmount: number
  optionFee: number
  optionPeriodDays: number
  closingDate: string
  possessionDate?: string
  buyers: Array<{ fullLegalName: string; street: string; city: string; state: string; zipCode: string; phone: string; email: string }>
  financing: { type: 'cash' | 'financed'; loanType?: string; loanAmount?: number; downPaymentAmount?: number }
  inclusions?: string[]
  exclusions?: string[]
  sellerConcessions?: number
  hasHoa: boolean
  contingencies: { inspection: boolean; appraisal: boolean; financing: boolean }
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

export function generateTxOneToFour(data: TxOneToFourData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'TREC One to Four Family Residential Contract' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
      .text('TREC ONE TO FOUR FAMILY RESIDENTIAL CONTRACT (RESALE)', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text(
        'Based on TREC Form 20-16 — For Educational/Reference Purposes. ' +
        'Your agent will complete the official TREC-promulgated form.',
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

    // ── 3. Sales Price ────────────────────────────────────────────────────
    sectionHeader(doc, '3. Sales Price')
    if (data.financing.type === 'financed' && data.financing.loanAmount && data.financing.downPaymentAmount) {
      row(doc, 'Cash Portion (Down Payment)', fmt(data.financing.downPaymentAmount))
      row(doc, 'Sum of All Financing', fmt(data.financing.loanAmount))
      row(doc, 'Sales Price', fmt(data.purchasePrice))
    } else {
      row(doc, 'Sales Price', fmt(data.purchasePrice))
    }

    // ── 4. Earnest Money ──────────────────────────────────────────────────
    sectionHeader(doc, '4. Earnest Money')
    row(doc, 'Earnest Money Amount', fmt(data.earnestMoneyAmount))
    row(doc, 'Delivered To', data.titleCompany ?? 'Title Company (to be designated)')
    row(doc, 'EMD Deadline', 'Within 3 business days of contract execution')

    // ── 5. Option Period ──────────────────────────────────────────────────
    // This is TX-unique — give it a prominent section
    sectionHeader(doc, '5. Option Period')
    doc.moveDown(0.2)
    // Highlight box background
    const optionBoxY = doc.y
    doc.rect(50, optionBoxY, doc.page.width - 100, 72).fill('#f0f9ff')
    doc.fillColor(DARK)
    doc.moveDown(0.1)

    row(doc, 'Option Fee', fmt(data.optionFee))
    row(doc, 'Option Period', `${data.optionPeriodDays} days from contract execution date`)
    row(doc, 'Option Period Expiration', `${data.optionPeriodDays} days from contract execution date`)
    doc.moveDown(0.3)
    doc.fontSize(8).font('Helvetica').fillColor(DARK)
      .text(
        'Buyer has an unrestricted right to terminate during the option period by providing written notice to Seller. ' +
        'The option fee is non-refundable but is credited toward the purchase price at closing.',
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
        label: 'Inspection',
        checked: data.contingencies.inspection,
        note: data.contingencies.inspection ? 'Inspection occurs during option period' : undefined,
      },
      { label: 'Appraisal', checked: data.contingencies.appraisal },
      { label: 'Financing / Third Party Financing Addendum', checked: data.contingencies.financing },
    ])

    // ── 9. Title Company ──────────────────────────────────────────────────
    if (data.titleCompany) {
      sectionHeader(doc, '9. Title Company')
      row(doc, 'Title Company', data.titleCompany)
    }

    // ── 10. HOA ───────────────────────────────────────────────────────────
    if (data.hasHoa) {
      sectionHeader(doc, data.titleCompany ? '10. HOA' : '9. HOA')
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(
          'This property is subject to a Homeowners Association. Buyer has the right to review HOA documents ' +
          'during the option period. Seller must provide HOA addendum documents within the timeframe specified in the contract.',
        )
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
        'IMPORTANT: This is a system-generated summary for reference purposes only, based on TREC Form 20-16 structure. ' +
        'It is not a legally binding document. Your real estate agent will prepare the official TREC-promulgated form for your signature. ' +
        'TREC forms are legally required for real estate transactions in Texas. ' +
        'Consult a qualified real estate attorney for legal advice.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
