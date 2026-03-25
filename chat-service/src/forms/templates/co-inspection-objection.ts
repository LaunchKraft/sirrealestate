import PDFDocument from 'pdfkit'

export interface CoInspectionObjectionData {
  generatedDate: string          // YYYY-MM-DD
  listingAddress: string
  buyers: Array<{ fullLegalName: string; email: string }>
  inspectionDate: string         // YYYY-MM-DD
  objections: string[]           // list of items being objected to
  requestedRemedies?: string     // free text: what buyer is requesting
  inspectionObjectionDeadline?: string  // YYYY-MM-DD
}

// Colors and helpers same as purchase agreement
const BLUE = '#00BFEB'
const DARK = '#1a2233'
const MUTED = '#64748b'
const RULE = '#e2e8f0'

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

export function generateCoInspectionObjection(data: CoInspectionObjectionData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    doc.fontSize(18).font('Helvetica-Bold').fillColor(BLUE).text('INSPECTION NOTICE — OBJECTION', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica').fillColor(MUTED).text('Colorado Contract to Buy and Sell Real Estate (CBS2) — Section 10', { align: 'center' })
    doc.moveDown(0.5)
    rule(doc)
    doc.moveDown(0.5)

    // Property + dates
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('Property Address:  ', { continued: true })
    doc.font('Helvetica').text(data.listingAddress)
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').text('Date Generated:  ', { continued: true })
    doc.font('Helvetica').text(fmtDate(data.generatedDate))
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').text('Inspection Date:  ', { continued: true })
    doc.font('Helvetica').text(fmtDate(data.inspectionDate))
    if (data.inspectionObjectionDeadline) {
      doc.moveDown(0.3)
      doc.font('Helvetica-Bold').text('Objection Deadline:  ', { continued: true })
      doc.font('Helvetica').text(fmtDate(data.inspectionObjectionDeadline))
    }

    // Buyers
    sectionHeader(doc, 'Buyer(s)')
    data.buyers.forEach((b) => {
      doc.text(`${b.fullLegalName}  (${b.email})`)
      doc.moveDown(0.2)
    })

    // Objections list
    sectionHeader(doc, 'Inspection Items Objected To')
    doc.fontSize(9).fillColor(MUTED).text(
      'Pursuant to Section 10 of the Contract to Buy and Sell Real Estate, Buyer(s) hereby object to the following inspection items:',
    )
    doc.moveDown(0.4)
    doc.fontSize(10).fillColor(DARK)
    data.objections.forEach((item, i) => {
      doc.font('Helvetica-Bold').text(`${i + 1}.  `, { continued: true })
      doc.font('Helvetica').text(item)
      doc.moveDown(0.3)
    })

    // Requested remedies
    if (data.requestedRemedies) {
      sectionHeader(doc, 'Requested Remedies')
      doc.text(data.requestedRemedies)
    }

    // Signature block
    sectionHeader(doc, 'Buyer Signature')
    doc.moveDown(1)
    doc.moveTo(50, doc.y).lineTo(280, doc.y).lineWidth(0.5).strokeColor(DARK).stroke()
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED).text('Buyer Signature / Date', { width: 230 })
    doc.moveDown(1.5)
    doc.moveTo(50, doc.y).lineTo(280, doc.y).lineWidth(0.5).strokeColor(DARK).stroke()
    doc.moveDown(0.3)
    doc.text('Printed Name / Date', { width: 230 })

    doc.end()
  })
}
