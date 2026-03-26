import PDFDocument from 'pdfkit'

export interface GaPurchaseAgreementData {
  generatedDate: string
  listingAddress: string
  purchasePrice: number
  earnestMoneyAmount: number
  closingDate: string
  /** Due diligence period in calendar days — typically 10 business days */
  dueDiligenceDays: number
  possessionDate?: string
  /** Binding Agreement Date — GA term for when the final party signs */
  bindingAgreementDate?: string
  buyers: Array<{ fullLegalName: string; street: string; city: string; state: string; zipCode: string; phone: string; email: string }>
  financing: { type: 'cash' | 'financed'; loanType?: string; loanAmount?: number; downPaymentAmount?: number }
  inclusions?: string[]
  exclusions?: string[]
  sellerConcessions?: number
  specialStipulations?: string[]
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
  const labelWidth = 175
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

export function generateGaPurchaseAgreement(data: GaPurchaseAgreementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, info: { Title: 'Georgia Purchase and Sale Agreement' } })
    const buffers: Buffer[] = []
    doc.on('data', (b: Buffer) => buffers.push(b))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(15).font('Helvetica-Bold').fillColor(DARK)
      .text('GEORGIA PURCHASE AND SALE AGREEMENT', { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor(MUTED)
      .text(
        'Based on GAR Form F20 — For Educational/Reference Purposes. ' +
        'Your agent will complete the official GAR form.',
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
    if (data.bindingAgreementDate) {
      row(doc, 'Binding Agreement Date', fmtDate(data.bindingAgreementDate))
    }

    // ── 2. Buyer(s) ───────────────────────────────────────────────────────
    sectionHeader(doc, '2. Buyer(s)')
    for (let i = 0; i < data.buyers.length; i++) {
      const buyer = data.buyers[i]
      row(doc, i === 0 ? 'Primary Buyer' : 'Co-Buyer', buyer.fullLegalName)
      row(doc, 'Address', `${buyer.street}, ${buyer.city}, ${buyer.state} ${buyer.zipCode}`)
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
    row(doc, 'Held By', data.titleCompany ?? 'Escrow Agent (to be designated)')
    row(doc, 'EMD Deadline', 'Within 3 banking days of Binding Agreement Date')
    doc.moveDown(0.2)
    doc.fontSize(8).font('Helvetica').fillColor(DARK)
      .text(
        'In Georgia, the "Binding Agreement Date" is the date the final party signs and communicates acceptance. ' +
        'All deadlines run from this date.',
        60, doc.y, { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.4)

    // ── 5. Financing ──────────────────────────────────────────────────────
    sectionHeader(doc, '5. Financing')
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

    // ── 6. Due Diligence / Inspection ─────────────────────────────────────
    sectionHeader(doc, '6. Due Diligence Period')
    row(doc, 'Due Diligence Period', `${data.dueDiligenceDays} days from Binding Agreement Date`)
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        `Buyer has ${data.dueDiligenceDays} days from the Binding Agreement Date to conduct all desired ` +
        'inspections and investigations of the property. Buyer may request repairs or credits, or terminate ' +
        'the agreement within this period.',
        60, doc.y, { width: doc.page.width - 120, lineGap: 2 },
      )
    doc.moveDown(0.4)

    // ── 7. Key Dates ──────────────────────────────────────────────────────
    sectionHeader(doc, '7. Key Dates')
    row(doc, 'Closing Date', fmtDate(data.closingDate))
    row(doc, 'Possession Date', data.possessionDate ? fmtDate(data.possessionDate) : 'At Closing')

    // ── 8. Contingencies ──────────────────────────────────────────────────
    sectionHeader(doc, '8. Contingencies')
    checklist(doc, [
      {
        label: 'Due Diligence / Inspection',
        checked: data.contingencies.inspection,
        note: data.contingencies.inspection ? `${data.dueDiligenceDays} days from Binding Agreement Date` : undefined,
      },
      { label: 'Appraisal', checked: data.contingencies.appraisal },
      { label: 'Financing', checked: data.contingencies.financing },
    ])

    // ── HOA ───────────────────────────────────────────────────────────────
    if (data.hasHoa) {
      sectionHeader(doc, 'HOA')
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(
          'This property is subject to a Homeowners Association. ' +
          'Seller must provide all HOA documents, rules, and financial statements. ' +
          'Buyer has the right to review HOA documents during the Due Diligence Period.',
        )
      doc.moveDown(0.3)
    }

    // ── Title & Closing ───────────────────────────────────────────────────
    if (data.titleCompany) {
      sectionHeader(doc, 'Title & Closing')
      row(doc, 'Closing Attorney / Title', data.titleCompany)
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

    // ── Special Stipulations (GA-specific) ────────────────────────────────
    if (data.specialStipulations && data.specialStipulations.length > 0) {
      sectionHeader(doc, 'Special Stipulations')
      for (let i = 0; i < data.specialStipulations.length; i++) {
        const y = doc.y
        doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
          .text(`${i + 1}.`, 50, y, { width: 20, lineBreak: false })
        doc.fontSize(9).font('Helvetica').fillColor(DARK)
          .text(data.specialStipulations[i], 72, y, { width: doc.page.width - 122, lineGap: 2 })
        doc.moveDown(0.4)
      }
    }

    // ── Seller Disclosure ─────────────────────────────────────────────────
    sectionHeader(doc, "Seller's Property Disclosure")
    doc.fontSize(9).font('Helvetica').fillColor(DARK)
      .text(
        'Seller\'s Property Disclosure Statement is provided as a convenience. ' +
        'Buyer should review the disclosure and raise any concerns during the Due Diligence Period.',
      )
    doc.moveDown(0.3)

    // ── Buyer Signature Block ─────────────────────────────────────────────
    sectionHeader(doc, 'Buyer Offer')
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
        'IMPORTANT: This is a system-generated summary for reference purposes only, based on the GAR Form F20 structure. ' +
        'It is not a legally binding document. Your real estate agent will prepare the official GAR form for your signature. ' +
        'Consult a qualified real estate attorney for legal advice.',
        { lineGap: 2 },
      )

    doc.end()
  })
}
