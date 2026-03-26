import PDFDocument from 'pdfkit'

export interface TxFinancingAddendumData {
  generatedDate: string
  listingAddress: string
  purchasePrice: number
  buyers: Array<{ fullLegalName: string }>
  loanType: string        // 'conventional' | 'fha' | 'va' | 'usda' | 'jumbo' | 'other'
  loanAmount: number
  downPaymentAmount: number
  lenderName?: string
  financingDeadlineDays?: number   // days from execution to obtain financing commitment (default 21)
  appraisalDeadlineDays?: number   // days from execution for appraisal (default 21)
}

const BLUE = '#00BFEB'
const DARK = '#1a2233'
const MUTED = '#6b7280'
const RULE = '#e2e8f0'

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
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

export function generateTxFinancingAddendum(data: TxFinancingAddendumData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'TREC Third Party Financing Addendum' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const financingDays = data.financingDeadlineDays ?? 21
    const appraisalDays = data.appraisalDeadlineDays ?? 21
    const ltv = data.purchasePrice > 0 ? (data.loanAmount / data.purchasePrice) * 100 : 0

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
      .text('TREC THIRD PARTY FINANCING ADDENDUM', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text('Based on TREC Form 40-10 — For Educational/Reference Purposes', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })
    doc.moveDown(0.3)

    rule(doc)
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('Property Address:  ', { continued: true })
    doc.font('Helvetica').text(data.listingAddress)
    doc.moveDown(0.3)

    // ── 1. Loan Details ───────────────────────────────────────────────────
    sectionHeader(doc, '1. Loan Details')
    row(doc, 'Loan Type', data.loanType.toUpperCase())
    row(doc, 'Loan Amount', fmt(data.loanAmount))
    row(doc, 'Down Payment', fmt(data.downPaymentAmount))
    row(doc, 'Purchase Price', fmt(data.purchasePrice))
    row(doc, 'Loan-to-Value (LTV)', fmtPct(ltv))
    if (data.lenderName) {
      row(doc, 'Lender', data.lenderName)
    }

    // ── 2. Financing Deadline ─────────────────────────────────────────────
    sectionHeader(doc, '2. Financing Deadline')
    row(doc, 'Financing Deadline', `${financingDays} days from contract execution date`)
    doc.moveDown(0.2)
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        `Buyer must obtain a written financing commitment from a third party lender within ${financingDays} days ` +
        'of the contract execution date. If Buyer cannot obtain financing, Buyer may terminate the contract and ' +
        'receive a refund of the earnest money.',
        60,
        doc.y,
        { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.4)

    // ── 3. Appraisal ──────────────────────────────────────────────────────
    sectionHeader(doc, '3. Appraisal')
    row(doc, 'Appraisal Deadline', `${appraisalDays} days from contract execution date`)
    doc.moveDown(0.2)
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'If the property does not appraise at or above the purchase price within the specified period, ' +
        'Buyer may: (1) terminate the contract and receive a refund of the earnest money, ' +
        '(2) proceed with the purchase at the agreed price, or (3) negotiate a price reduction with Seller.',
        60,
        doc.y,
        { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.4)

    // ── 4. Lender Information ─────────────────────────────────────────────
    if (data.lenderName) {
      sectionHeader(doc, '4. Lender Information')
      row(doc, 'Lender Name', data.lenderName)
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text('Buyer is responsible for promptly applying for and diligently pursuing financing.', 60)
      doc.moveDown(0.3)
    }

    // ── Buyer Signature Block ─────────────────────────────────────────────
    sectionHeader(doc, 'Buyer Signature(s)')
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
        'IMPORTANT: This is a system-generated summary for reference purposes only, based on TREC Form 40-10 structure. ' +
        'It is not a legally binding document. Your real estate agent will prepare the official TREC-promulgated form for your signature. ' +
        'This addendum must accompany the TREC One to Four Family Residential Contract for all financed purchases. ' +
        'Consult a qualified real estate attorney for legal advice.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
