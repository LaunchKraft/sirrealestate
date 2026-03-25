import PDFDocument from 'pdfkit'

export interface PreApprovalLetterData {
  borrowerName: string
  lenderName: string
  approvedAmount: number
  /** ISO date string — defaults to 60 days from now if omitted */
  expirationDate?: string
  /** Date letter was generated — defaults to today */
  generatedDate?: string
}

const BLUE = '#00BFEB'
const DARK = '#1a2233'
const MUTED = '#64748b'
const RULE = '#e2e8f0'

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function rule(doc: PDFKit.PDFDocument): void {
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).strokeColor(RULE).stroke()
}

function row(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const labelWidth = 180
  const x = 50
  const y = doc.y
  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text(label, x, y, { width: labelWidth, lineBreak: false })
  doc.fontSize(9).font('Helvetica').fillColor(DARK).text(value, x + labelWidth, y, { width: doc.page.width - 50 - x - labelWidth })
  doc.moveDown(0.3)
}

export function generatePreApprovalLetter(data: PreApprovalLetterData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const today = data.generatedDate ?? new Date().toISOString().split('T')[0]
    const expiry = data.expirationDate ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() + 60)
      return d.toISOString().split('T')[0]
    })()

    // ── Letterhead ──────────────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').fillColor(BLUE).text(data.lenderName, 50, 50)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED).text('Mortgage Division')
    doc.moveDown(0.2)
    doc.fontSize(8).fillColor(MUTED)
      .text('1234 Lending Way, Suite 100  •  Denver, CO 80203')
      .text('Tel: (800) 555-0199  •  NMLS #000000')
    doc.moveDown(1)
    rule(doc)
    doc.moveDown(0.8)

    // ── Date & heading ───────────────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(fmtDate(today))
    doc.moveDown(1.2)
    doc.fontSize(16).font('Helvetica-Bold').fillColor(DARK)
      .text('PRE-APPROVAL LETTER', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text('Conditional Mortgage Pre-Approval', { align: 'center' })
    doc.moveDown(1.2)

    // ── Salutation ───────────────────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica').fillColor(DARK)
      .text(`Dear ${data.borrowerName},`)
    doc.moveDown(0.6)

    doc.fontSize(9).font('Helvetica').fillColor(DARK).text(
      `We are pleased to inform you that ${data.lenderName} has conditionally pre-approved your ` +
      `mortgage application. Based on the information provided and a preliminary review of your ` +
      `financial profile, you are pre-approved for a home loan up to the amount shown below.`,
      { lineGap: 3 },
    )
    doc.moveDown(1)

    // ── Approval details ─────────────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE).text('APPROVAL DETAILS')
    doc.moveDown(0.4)
    rule(doc)
    doc.moveDown(0.5)

    row(doc, 'Borrower', data.borrowerName)
    row(doc, 'Pre-Approved Amount', fmt(data.approvedAmount))
    row(doc, 'Loan Type', 'Conventional')
    row(doc, 'Loan Term', '30-Year Fixed')
    row(doc, 'Estimated Rate', '6.875% (subject to lock)')
    row(doc, 'Letter Date', fmtDate(today))
    row(doc, 'Expiration Date', fmtDate(expiry))

    doc.moveDown(1)

    // ── Conditions ───────────────────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE).text('CONDITIONS')
    doc.moveDown(0.4)
    rule(doc)
    doc.moveDown(0.5)

    const conditions = [
      'Verification of income, assets, and employment as stated in your application.',
      'Satisfactory appraisal of the subject property at or above the purchase price.',
      'Clear title and acceptable title insurance commitment.',
      'No material changes to your financial situation prior to closing.',
      'Final underwriting approval upon receipt of a fully executed purchase agreement.',
    ]
    conditions.forEach((c) => {
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(`• ${c}`, 60, doc.y, { width: doc.page.width - 110, lineGap: 2 })
      doc.moveDown(0.3)
    })

    doc.moveDown(0.8)
    doc.fontSize(9).font('Helvetica').fillColor(DARK).text(
      'This pre-approval is not a commitment to lend and is subject to satisfactory completion of the ' +
      'above conditions. Final loan approval is contingent upon full underwriting review.',
      { lineGap: 3 },
    )
    doc.moveDown(1.2)

    // ── Signature ────────────────────────────────────────────────────────────
    rule(doc)
    doc.moveDown(0.8)
    doc.fontSize(9).font('Helvetica').fillColor(DARK).text('Sincerely,')
    doc.moveDown(1.5)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK).text('Alex Morgan')
    doc.fontSize(8).font('Helvetica').fillColor(MUTED).text(`Loan Officer — ${data.lenderName}`)
    doc.text('NMLS #123456')

    // ── Test watermark footer ────────────────────────────────────────────────
    const footerY = doc.page.height - 60
    doc
      .moveTo(50, footerY - 8)
      .lineTo(doc.page.width - 50, footerY - 8)
      .lineWidth(0.5).strokeColor('#fbbf24').stroke()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#b45309')
      .text('FOR TESTING PURPOSES ONLY — NOT A REAL PRE-APPROVAL LETTER', 50, footerY, {
        width: doc.page.width - 100,
        align: 'center',
      })

    doc.end()
  })
}
