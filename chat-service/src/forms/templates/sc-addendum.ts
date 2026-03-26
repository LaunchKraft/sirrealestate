import PDFDocument from 'pdfkit'

export interface ScAddendumData {
  generatedDate: string
  listingAddress: string
  originalContractDate: string
  buyers: Array<{ fullLegalName: string }>
  amendments: Array<{ description: string }>
  sellerCredit?: number
  newClosingDate?: string
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

export function generateScAddendum(data: ScAddendumData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'South Carolina Amendment to Contract of Sale' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
      .text('SOUTH CAROLINA AMENDMENT TO CONTRACT OF SALE', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text('Based on SCR Amendment Form — For Educational/Reference Purposes', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(MUTED)
      .text(`Generated: ${fmtDate(data.generatedDate)}`, { align: 'right' })
    doc.moveDown(0.3)

    rule(doc)
    doc.moveDown(0.3)
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text('Property Address:  ', { continued: true })
    doc.font('Helvetica').text(data.listingAddress)
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').text('Original Contract Date:  ', { continued: true })
    doc.font('Helvetica').text(fmtDate(data.originalContractDate))
    doc.moveDown(0.3)

    rule(doc)
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'The parties agree to amend the Contract of Sale as follows. All other terms and conditions ' +
        'of the original agreement remain in full force and effect.',
        { lineGap: 2 },
      )
    doc.moveDown(0.4)

    sectionHeader(doc, '1. Agreed Amendments')
    for (let i = 0; i < data.amendments.length; i++) {
      const amendment = data.amendments[i]
      const y = doc.y
      doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
        .text(`${i + 1}.`, 50, y, { width: 20, lineBreak: false })
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(amendment.description, 72, y, { width: doc.page.width - 122, lineGap: 2 })
      doc.moveDown(0.4)
    }

    if (data.sellerCredit) {
      sectionHeader(doc, '2. Seller Credit')
      row(doc, 'Total Seller Credit', fmt(data.sellerCredit))
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(
          'Seller agrees to provide the above credit to Buyer at closing toward Buyer\'s closing costs and/or prepaid items.',
          60, doc.y, { width: doc.page.width - 120, lineGap: 2 },
        )
      doc.moveDown(0.3)
    }

    if (data.newClosingDate) {
      sectionHeader(doc, data.sellerCredit ? '3. Amended Closing Date' : '2. Amended Closing Date')
      row(doc, 'New Closing Date', fmtDate(data.newClosingDate))
      doc.moveDown(0.3)
    }

    doc.moveDown(0.3)
    rule(doc)
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
      .text('All other terms of the Contract of Sale remain unchanged.')
    doc.moveDown(0.5)

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

    sectionHeader(doc, 'Seller Signature(s)')
    doc.moveDown(0.5)
    for (let i = 0; i < 2; i++) {
      const y = doc.y
      doc.moveTo(60, y + 30).lineTo(280, y + 30).lineWidth(0.5).strokeColor(DARK).stroke()
      doc.moveTo(310, y + 30).lineTo(530, y + 30).lineWidth(0.5).strokeColor(DARK).stroke()
      doc.moveDown(0.2)
      doc.fontSize(8).fillColor(MUTED)
        .text(`Seller ${i + 1}`, 60, doc.y, { width: 220, lineBreak: false })
      doc.text('Date', 310, doc.y, { width: 220 })
      doc.moveDown(1)
    }

    doc.moveDown(1)
    rule(doc)
    doc.moveDown(0.4)
    doc.fontSize(7).fillColor(MUTED)
      .text(
        'IMPORTANT: This is a system-generated summary for reference purposes only, based on the SCR Amendment form structure. ' +
        'It is not a legally binding document. Your real estate agent will prepare the official SCR form for your signature. ' +
        'South Carolina requires all residential closings to be conducted by a licensed SC attorney. ' +
        'Both buyer and seller must sign amendments for them to be binding. ' +
        'Consult a qualified real estate attorney for legal advice.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
