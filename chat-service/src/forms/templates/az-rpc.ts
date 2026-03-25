import PDFDocument from 'pdfkit'

export interface AzRpcData {
  generatedDate: string
  listingAddress: string
  purchasePrice: number
  earnestMoneyAmount: number
  closingDate: string
  inspectionPeriodDays: number          // default 10
  possessionDate?: string
  buyers: Array<{ fullLegalName: string; street: string; city: string; state: string; zipCode: string; phone: string; email: string }>
  financing: { type: 'cash' | 'financed'; loanType?: string; loanAmount?: number; downPaymentAmount?: number }
  inclusions?: string[]
  exclusions?: string[]
  sellerConcessions?: number
  hasHoa: boolean
  contingencies: { inspection: boolean; appraisal: boolean; financing: boolean }
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

export function generateAzRpc(data: AzRpcData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'Arizona Residential Purchase Contract' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(16).font('Helvetica-Bold').fillColor(DARK)
      .text('ARIZONA RESIDENTIAL PURCHASE CONTRACT', { align: 'center' })
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
      .text('AAR Form — For Educational/Reference Purposes', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })
    doc.moveDown(0.3)

    // Watermark note
    rule(doc)
    doc.moveDown(0.3)
    doc.fontSize(8).font('Helvetica').fillColor(MUTED)
      .text(
        'Note: This is a system-generated summary based on AAR form structure. ' +
        'Your agent will review and complete the official AAR form.',
        { align: 'center' },
      )
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

    // ── 3. Purchase Price & Earnest Money ─────────────────────────────────
    sectionHeader(doc, '3. Purchase Price & Earnest Money')
    row(doc, 'Purchase Price', fmt(data.purchasePrice))
    row(doc, 'Earnest Money Deposit', fmt(data.earnestMoneyAmount))
    row(doc, 'EMD Due', 'Within 24–48 hours of acceptance (deposited with escrow company)')

    // ── 4. Financing ──────────────────────────────────────────────────────
    sectionHeader(doc, '4. Financing')
    row(doc, 'Financing Type', data.financing.type === 'cash' ? 'All Cash' : 'Financed')
    if (data.financing.type === 'financed') {
      if (data.financing.loanType)          row(doc, 'Loan Type', data.financing.loanType.toUpperCase())
      if (data.financing.loanAmount)        row(doc, 'Loan Amount', fmt(data.financing.loanAmount))
      if (data.financing.downPaymentAmount) row(doc, 'Down Payment', fmt(data.financing.downPaymentAmount))
    }

    // ── 5. Key Dates ──────────────────────────────────────────────────────
    sectionHeader(doc, '5. Key Dates')
    row(doc, 'Inspection Period', `${data.inspectionPeriodDays} days from acceptance`)
    row(doc, 'Closing Date', fmtDate(data.closingDate))
    row(doc, 'Possession Date', data.possessionDate ? fmtDate(data.possessionDate) : 'At Closing')

    // ── 6. Contingencies ──────────────────────────────────────────────────
    sectionHeader(doc, '6. Contingencies')
    checklist(doc, [
      {
        label: 'Inspection',
        checked: data.contingencies.inspection,
        note: data.contingencies.inspection ? `${data.inspectionPeriodDays}-day inspection period` : undefined,
      },
      { label: 'Appraisal', checked: data.contingencies.appraisal },
      { label: 'Financing', checked: data.contingencies.financing },
    ])

    // ── 7. HOA ────────────────────────────────────────────────────────────
    if (data.hasHoa) {
      sectionHeader(doc, '7. HOA')
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text('This property is subject to a Homeowners Association. Buyer has the right to review all HOA documents during the inspection period. An HOA Addendum is required.')
    }

    // ── 8. Inclusions & Exclusions ────────────────────────────────────────
    if ((data.inclusions && data.inclusions.length > 0) || (data.exclusions && data.exclusions.length > 0)) {
      sectionHeader(doc, '8. Inclusions & Exclusions')
      row(doc, 'Inclusions', data.inclusions?.length ? data.inclusions.join(', ') : 'None stated')
      row(doc, 'Exclusions', data.exclusions?.length ? data.exclusions.join(', ') : 'None stated')
    }

    // ── 9. Seller Concessions ─────────────────────────────────────────────
    if (data.sellerConcessions) {
      sectionHeader(doc, '9. Seller Concessions')
      row(doc, 'Seller-Paid Costs', fmt(data.sellerConcessions))
    }

    // ── 10. Buyer Signature Block ─────────────────────────────────────────
    sectionHeader(doc, '10. Buyer Acceptance')
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
        'IMPORTANT: This is a system-generated summary for reference purposes only, based on the AAR Residential Purchase Contract form structure. ' +
        'It is not a legally binding document. Your real estate agent will prepare the official AAR-approved form for your signature. ' +
        'Consult a qualified real estate attorney for legal advice.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
