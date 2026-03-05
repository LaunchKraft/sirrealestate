import PDFDocument from 'pdfkit'

export interface EarnestMoneyAgreementData {
  generatedDate: string
  /** 2-letter state code — included for future state-specific templates. Defaults to 'CO'. */
  propertyState: string
  listingAddress: string
  buyers: Array<{
    fullLegalName: string
    isPrimaryBuyer: boolean
  }>
  earnestMoneyAmount: number
  /** Date the deposit is due — typically 1–3 business days after acceptance. */
  depositDueDate?: string
  escrowHolderName?: string
  closingDate: string
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

export function generateEarnestMoneyAgreement(data: EarnestMoneyAgreementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'Earnest Money Deposit Agreement' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(16).font('Helvetica-Bold').fillColor(DARK)
      .text('EARNEST MONEY DEPOSIT AGREEMENT', { align: 'center' })
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
      .text('Generic Form — Not State-Commission-Approved', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })

    // ── Property ─────────────────────────────────────────────────────────────
    sectionHeader(doc, '1. Property')
    row(doc, 'Property Address', data.listingAddress)
    row(doc, 'State', data.propertyState)

    // ── Buyer(s) ─────────────────────────────────────────────────────────────
    sectionHeader(doc, '2. Buyer(s)')
    for (const buyer of data.buyers) {
      row(doc, buyer.isPrimaryBuyer ? 'Primary Buyer' : 'Co-Buyer', buyer.fullLegalName)
    }

    // ── Deposit Terms ─────────────────────────────────────────────────────────
    sectionHeader(doc, '3. Earnest Money Deposit')
    row(doc, 'Deposit Amount', fmt(data.earnestMoneyAmount))
    row(doc, 'Deposit Due Date', data.depositDueDate ? fmtDate(data.depositDueDate) : 'Within 3 business days of acceptance')
    row(doc, 'Payment Method', 'Digital transfer via Earnnest (earnest.com)')

    // ── Escrow ────────────────────────────────────────────────────────────────
    sectionHeader(doc, '4. Escrow Holder')
    row(doc, 'Escrow Holder', data.escrowHolderName ?? 'To be designated by mutual agreement')
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'The Escrow Holder shall hold the earnest money deposit in a neutral escrow account ' +
        'until closing or until the parties provide written instructions for disbursement.',
        50, doc.y, { width: doc.page.width - 100 },
      )

    // ── Closing ────────────────────────────────────────────────────────────────
    sectionHeader(doc, '5. Closing')
    row(doc, 'Target Closing Date', fmtDate(data.closingDate))
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'Upon successful closing, the earnest money deposit shall be applied toward the purchase ' +
        'price or closing costs as directed by the parties.',
        50, doc.y, { width: doc.page.width - 100 },
      )

    // ── Release Conditions ────────────────────────────────────────────────────
    sectionHeader(doc, '6. Release of Earnest Money')
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
    const conditions = [
      'Returned to Buyer if the transaction fails due to a contingency expressly stated in the Purchase Agreement.',
      'Forfeited to Seller if Buyer defaults without a valid contingency basis.',
      'Disbursed per written mutual release agreement signed by all parties.',
      'Disbursed per court order or binding arbitration decision if disputed.',
    ]
    for (const condition of conditions) {
      doc.text(`• ${condition}`, 60, doc.y, { width: doc.page.width - 110 })
      doc.moveDown(0.3)
    }

    // ── Signature Block ───────────────────────────────────────────────────────
    sectionHeader(doc, '7. Buyer Acknowledgment')
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
        'IMPORTANT: This is a generic earnest money deposit agreement generated for informational ' +
        'purposes only. It is not approved by any state real estate commission. For binding real ' +
        'estate transactions, parties should use commission-approved forms and seek qualified legal counsel.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
