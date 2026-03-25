import PDFDocument from 'pdfkit'

export interface CoInspectionResolutionData {
  generatedDate: string
  listingAddress: string
  buyers: Array<{ fullLegalName: string; email: string }>
  resolutionType: 'agreement' | 'waiver'
  agreedRemedies?: string[]   // if resolutionType === 'agreement'
  sellerCredit?: number        // credit in lieu of repairs (optional)
  waivedItems?: string[]       // specific items being waived even if agreement
}

const BLUE = '#00BFEB'
const DARK = '#1a2233'
const MUTED = '#64748b'
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

export function generateCoInspectionResolution(data: CoInspectionResolutionData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    doc.fontSize(18).font('Helvetica-Bold').fillColor(BLUE).text('INSPECTION RESOLUTION', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica').fillColor(MUTED).text('Colorado Contract to Buy and Sell Real Estate (CBS2) — Section 10.3', { align: 'center' })
    doc.moveDown(0.5)
    rule(doc)
    doc.moveDown(0.5)

    // Property + date
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('Property Address:  ', { continued: true })
    doc.font('Helvetica').text(data.listingAddress)
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').text('Date Generated:  ', { continued: true })
    doc.font('Helvetica').text(fmtDate(data.generatedDate))

    // Buyers
    sectionHeader(doc, 'Buyer(s)')
    data.buyers.forEach((b) => {
      doc.text(`${b.fullLegalName}  (${b.email})`)
      doc.moveDown(0.2)
    })

    // Resolution
    sectionHeader(doc, 'Resolution')

    if (data.resolutionType === 'waiver') {
      doc.text(
        'Buyer(s) hereby withdraw their inspection objection(s) and waive all inspection objection rights. ' +
        'Buyer(s) accept the property in its current condition with respect to inspected items.',
      )
    } else {
      doc.text('The parties hereby agree to the following resolution of the inspection objections:')
      doc.moveDown(0.5)

      if (data.agreedRemedies && data.agreedRemedies.length > 0) {
        doc.font('Helvetica-Bold').text('Agreed Remedies:')
        doc.font('Helvetica')
        data.agreedRemedies.forEach((remedy, i) => {
          doc.moveDown(0.2)
          doc.text(`${i + 1}.  ${remedy}`)
        })
      }

      if (data.sellerCredit) {
        doc.moveDown(0.4)
        doc.font('Helvetica-Bold').text('Seller Credit:  ', { continued: true })
        doc.font('Helvetica').text(`${fmt(data.sellerCredit)} at closing in lieu of repairs`)
      }

      if (data.waivedItems && data.waivedItems.length > 0) {
        doc.moveDown(0.4)
        doc.font('Helvetica-Bold').text('Items Waived:')
        doc.font('Helvetica')
        data.waivedItems.forEach((item, i) => {
          doc.moveDown(0.2)
          doc.text(`${i + 1}.  ${item}`)
        })
      }

      doc.moveDown(0.5)
      doc.fontSize(9).fillColor(MUTED).text(
        'Buyer(s) waive all remaining inspection objections not expressly addressed above.',
      )
      doc.fontSize(10).fillColor(DARK)
    }

    // Signature block — buyer and seller
    sectionHeader(doc, 'Signatures')
    doc.moveDown(1)
    // Buyer
    doc.moveTo(50, doc.y).lineTo(280, doc.y).lineWidth(0.5).strokeColor(DARK).stroke()
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED).text('Buyer Signature / Date', { width: 230 })
    doc.moveDown(2)
    // Seller
    doc.moveTo(50, doc.y).lineTo(280, doc.y).lineWidth(0.5).strokeColor(DARK).stroke()
    doc.moveDown(0.3)
    doc.text('Seller Signature / Date', { width: 230 })

    doc.end()
  })
}
