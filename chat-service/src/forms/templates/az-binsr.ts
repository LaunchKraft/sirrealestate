import PDFDocument from 'pdfkit'

export interface AzBinsrData {
  generatedDate: string
  listingAddress: string
  buyers: Array<{ fullLegalName: string }>
  inspectionDate: string
  inspectionItems: Array<{
    description: string          // what the buyer found / requests
    requestedAction: string      // e.g. "Repair", "Credit", "Replace"
  }>
  requestedCreditTotal?: number  // total $ credit requested if any
  binsrDeadline: string          // inspection period deadline date
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

export function generateAzBinsr(data: AzBinsrData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'BINSR — Buyer\'s Inspection Notice and Seller\'s Response' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── 1. Header ────────────────────────────────────────────────────────
    doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
      .text("BUYER'S INSPECTION NOTICE AND SELLER'S RESPONSE (BINSR)", { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
      .text('Arizona — AAR Residential Purchase Contract', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })
    doc.moveDown(0.5)
    rule(doc)
    doc.moveDown(0.5)

    // Property address
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('Property Address:  ', { continued: true })
    doc.font('Helvetica').text(data.listingAddress)
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').text('Inspection Date:  ', { continued: true })
    doc.font('Helvetica').text(fmtDate(data.inspectionDate))
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').text('BINSR Deadline:  ', { continued: true })
    doc.font('Helvetica').text(fmtDate(data.binsrDeadline))

    // ── 2. Notice Paragraph ───────────────────────────────────────────────
    sectionHeader(doc, 'Buyer Notice')
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        `Pursuant to the AAR Residential Purchase Contract for the property located at ${data.listingAddress}, ` +
        `the undersigned Buyer(s) hereby deliver this Buyer's Inspection Notice to Seller. ` +
        `This notice is delivered on or before the Inspection Period Deadline of ${fmtDate(data.binsrDeadline)}. ` +
        `Buyer requests that Seller respond to each item listed below within 5 days of receipt.`,
        { lineGap: 2 },
      )

    // ── 3. Inspection Items Table ─────────────────────────────────────────
    sectionHeader(doc, 'Inspection Items')

    // Table header
    const tableX = 50
    const colItemW = 35
    const colDescW = 340
    const colActionW = 120
    const tableWidth = colItemW + colDescW + colActionW

    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLUE)
    doc.text('Item #', tableX, doc.y, { width: colItemW, lineBreak: false })
    doc.text('Description / Requested Action', tableX + colItemW, doc.y, { width: colDescW, lineBreak: false })
    doc.text('Action', tableX + colItemW + colDescW, doc.y, { width: colActionW })
    doc.moveDown(0.3)
    doc.moveTo(tableX, doc.y).lineTo(tableX + tableWidth, doc.y).lineWidth(0.5).strokeColor(RULE).stroke()
    doc.moveDown(0.3)

    doc.fontSize(9).font('Helvetica').fillColor(DARK)
    data.inspectionItems.forEach((item, i) => {
      const rowY = doc.y
      doc.text(String(i + 1), tableX, rowY, { width: colItemW, lineBreak: false })
      doc.text(item.description, tableX + colItemW, rowY, { width: colDescW, lineBreak: false })
      doc.text(item.requestedAction, tableX + colItemW + colDescW, rowY, { width: colActionW })
      doc.moveDown(0.4)
    })

    if (data.requestedCreditTotal) {
      doc.moveDown(0.3)
      doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
        .text(`Total Requested Credit: ${fmt(data.requestedCreditTotal)}`, { align: 'right' })
    }

    // ── 4. Buyer Signature Block ──────────────────────────────────────────
    sectionHeader(doc, 'Buyer Signature')
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(`Buyer hereby delivers this notice on ${fmtDate(data.generatedDate)}.`)
    doc.moveDown(1)

    for (const buyer of data.buyers) {
      const y = doc.y
      doc.moveTo(60, y + 25).lineTo(300, y + 25).lineWidth(0.5).strokeColor(DARK).stroke()
      doc.moveTo(320, y + 25).lineTo(530, y + 25).lineWidth(0.5).strokeColor(DARK).stroke()
      doc.moveDown(0.2)
      doc.fontSize(8).fillColor(MUTED)
        .text(buyer.fullLegalName, 60, doc.y, { width: 240, lineBreak: false })
      doc.text('Date', 320, doc.y, { width: 210 })
      doc.moveDown(1.2)
    }

    // ── Divider ───────────────────────────────────────────────────────────
    doc.moveDown(0.5)
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(1).strokeColor(DARK).stroke()
    doc.moveDown(0.5)

    // ── 5. Seller Response Section ────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK)
      .text('SELLER RESPONSE SECTION', { align: 'center' })
    doc.moveDown(0.5)

    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        `Seller must respond by ${fmtDate(data.binsrDeadline)}. For each item, seller may: ` +
        '(1) Agree to repair/remedy, (2) Offer a credit in lieu of repairs, (3) Decline to remedy.',
        { lineGap: 2 },
      )
    doc.moveDown(0.5)

    // Response table header
    const colRespItemW = 35
    const colRespW = 200
    const colNotesW = 270
    const respTableWidth = colRespItemW + colRespW + colNotesW

    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLUE)
    doc.text('Item #', tableX, doc.y, { width: colRespItemW, lineBreak: false })
    doc.text('Seller Response (Agree / Credit / Decline)', tableX + colRespItemW, doc.y, { width: colRespW, lineBreak: false })
    doc.text('Notes', tableX + colRespItemW + colRespW, doc.y, { width: colNotesW })
    doc.moveDown(0.3)
    doc.moveTo(tableX, doc.y).lineTo(tableX + respTableWidth, doc.y).lineWidth(0.5).strokeColor(RULE).stroke()
    doc.moveDown(0.3)

    // Empty response rows
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
    data.inspectionItems.forEach((_item, i) => {
      const rowY = doc.y
      doc.text(String(i + 1), tableX, rowY, { width: colRespItemW, lineBreak: false })
      doc.text('_____________________________', tableX + colRespItemW, rowY, { width: colRespW, lineBreak: false })
      doc.text('_____________________________', tableX + colRespItemW + colRespW, rowY, { width: colNotesW })
      doc.moveDown(0.6)
    })

    // Seller signature block
    doc.moveDown(0.5)
    const sellerY = doc.y
    doc.moveTo(60, sellerY + 25).lineTo(300, sellerY + 25).lineWidth(0.5).strokeColor(DARK).stroke()
    doc.moveTo(320, sellerY + 25).lineTo(530, sellerY + 25).lineWidth(0.5).strokeColor(DARK).stroke()
    doc.moveDown(0.2)
    doc.fontSize(8).fillColor(MUTED)
      .text('Seller Signature', 60, doc.y, { width: 240, lineBreak: false })
    doc.text('Date', 320, doc.y, { width: 210 })

    doc.end()
  })
}
