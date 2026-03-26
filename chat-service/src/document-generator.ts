/**
 * Async background task Lambda.
 * Invoked fire-and-forget from the chat Lambda to avoid the 30-second
 * API Gateway timeout during PDF generation + S3 upload + Dropbox Sign calls,
 * and offer submission (SES emails + DynamoDB write).
 */
import * as GeneratePurchaseAgreement from './tools/generate-purchase-agreement'
import * as GenerateAgencyDisclosure from './tools/generate-agency-disclosure'
import * as GenerateEarnestMoneyAgreement from './tools/generate-earnest-money-agreement'
import * as SubmitOffer from './tools/submit-offer'
import * as GenerateInspectionObjection from './tools/generate-inspection-objection'
import * as GenerateInspectionResolution from './tools/generate-inspection-resolution'
import * as GenerateTestPreApproval from './tools/generate-test-pre-approval'
import * as GenerateAzRpc from './tools/generate-az-rpc'
import * as GenerateAzBinsr from './tools/generate-az-binsr'
import * as GenerateTxPurchaseAgreement from './tools/generate-tx-purchase-agreement'
import * as GenerateTxFinancingAddendum from './tools/generate-tx-financing-addendum'
import * as GenerateTxAmendment from './tools/generate-tx-amendment'
import * as GenerateNvPurchaseAgreement from './tools/generate-nv-purchase-agreement'
import * as GenerateNvAddendum from './tools/generate-nv-addendum'
import * as GenerateUtRepc from './tools/generate-ut-repc'
import * as GenerateIdPurchaseAgreement from './tools/generate-id-purchase-agreement'
import * as GenerateIdAddendum from './tools/generate-id-addendum'
import * as GenerateMtPurchaseAgreement from './tools/generate-mt-purchase-agreement'
import * as GenerateMtAddendum from './tools/generate-mt-addendum'
import * as GenerateOrPurchaseAgreement from './tools/generate-or-purchase-agreement'
import * as GenerateOrAddendum from './tools/generate-or-addendum'
import * as GenerateWaPurchaseAgreement from './tools/generate-wa-purchase-agreement'
import * as GenerateWaAddendum from './tools/generate-wa-addendum'
import * as GenerateNcPurchaseAgreement from './tools/generate-nc-purchase-agreement'
import * as GenerateNcAddendum from './tools/generate-nc-addendum'
import * as GenerateGaPurchaseAgreement from './tools/generate-ga-purchase-agreement'
import * as GenerateGaAddendum from './tools/generate-ga-addendum'
import * as GenerateTnPurchaseAgreement from './tools/generate-tn-purchase-agreement'
import * as GenerateTnAddendum from './tools/generate-tn-addendum'
import * as GenerateScPurchaseAgreement from './tools/generate-sc-purchase-agreement'
import * as GenerateScAddendum from './tools/generate-sc-addendum'
import * as GenerateFlPurchaseAgreement from './tools/generate-fl-purchase-agreement'
import * as GenerateFlAddendum from './tools/generate-fl-addendum'
import * as GenerateMnPurchaseAgreement from './tools/generate-mn-purchase-agreement'
import * as GenerateMnAddendum from './tools/generate-mn-addendum'

interface DocumentGeneratorEvent {
  toolName: string
  userId: string
  userEmail?: string
  input: unknown
}

export async function handler(event: DocumentGeneratorEvent): Promise<void> {
  const { toolName, userId, userEmail, input } = event
  console.log(`document-generator started: toolName=${toolName} userId=${userId}`)

  try {
    switch (toolName) {
      case 'generate_purchase_agreement':
        await GeneratePurchaseAgreement.execute(
          userId,
          input as Parameters<typeof GeneratePurchaseAgreement.execute>[1],
        )
        break
      case 'generate_agency_disclosure':
        await GenerateAgencyDisclosure.execute(
          userId,
          input as Parameters<typeof GenerateAgencyDisclosure.execute>[1],
        )
        break
      case 'generate_earnest_money_agreement':
        await GenerateEarnestMoneyAgreement.execute(
          userId,
          input as Parameters<typeof GenerateEarnestMoneyAgreement.execute>[1],
        )
        break
      case 'submit_offer':
        await SubmitOffer.execute(
          userId,
          input as Parameters<typeof SubmitOffer.execute>[1],
          userEmail ?? '',
        )
        break
      case 'generate_inspection_objection':
        await GenerateInspectionObjection.execute(userId, input as Parameters<typeof GenerateInspectionObjection.execute>[1])
        break
      case 'generate_inspection_resolution':
        await GenerateInspectionResolution.execute(userId, input as Parameters<typeof GenerateInspectionResolution.execute>[1])
        break
      case 'generate_test_pre_approval':
        await GenerateTestPreApproval.execute(userId, input as Parameters<typeof GenerateTestPreApproval.execute>[1])
        break
      case 'generate_az_rpc':
        await GenerateAzRpc.execute(userId, input as Parameters<typeof GenerateAzRpc.execute>[1])
        break
      case 'generate_az_binsr':
        await GenerateAzBinsr.execute(userId, input as Parameters<typeof GenerateAzBinsr.execute>[1])
        break
      case 'generate_tx_purchase_agreement':
        await GenerateTxPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateTxPurchaseAgreement.execute>[1])
        break
      case 'generate_tx_financing_addendum':
        await GenerateTxFinancingAddendum.execute(userId, input as Parameters<typeof GenerateTxFinancingAddendum.execute>[1])
        break
      case 'generate_tx_amendment':
        await GenerateTxAmendment.execute(userId, input as Parameters<typeof GenerateTxAmendment.execute>[1])
        break
      case 'generate_nv_purchase_agreement':
        await GenerateNvPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateNvPurchaseAgreement.execute>[1])
        break
      case 'generate_nv_addendum':
        await GenerateNvAddendum.execute(userId, input as Parameters<typeof GenerateNvAddendum.execute>[1])
        break
      case 'generate_ut_repc':
        await GenerateUtRepc.execute(userId, input as Parameters<typeof GenerateUtRepc.execute>[1])
        break
      case 'generate_id_purchase_agreement':
        await GenerateIdPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateIdPurchaseAgreement.execute>[1])
        break
      case 'generate_id_addendum':
        await GenerateIdAddendum.execute(userId, input as Parameters<typeof GenerateIdAddendum.execute>[1])
        break
      case 'generate_mt_purchase_agreement':
        await GenerateMtPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateMtPurchaseAgreement.execute>[1])
        break
      case 'generate_mt_addendum':
        await GenerateMtAddendum.execute(userId, input as Parameters<typeof GenerateMtAddendum.execute>[1])
        break
      case 'generate_or_purchase_agreement':
        await GenerateOrPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateOrPurchaseAgreement.execute>[1])
        break
      case 'generate_or_addendum':
        await GenerateOrAddendum.execute(userId, input as Parameters<typeof GenerateOrAddendum.execute>[1])
        break
      case 'generate_wa_purchase_agreement':
        await GenerateWaPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateWaPurchaseAgreement.execute>[1])
        break
      case 'generate_wa_addendum':
        await GenerateWaAddendum.execute(userId, input as Parameters<typeof GenerateWaAddendum.execute>[1])
        break
      case 'generate_nc_purchase_agreement':
        await GenerateNcPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateNcPurchaseAgreement.execute>[1])
        break
      case 'generate_nc_addendum':
        await GenerateNcAddendum.execute(userId, input as Parameters<typeof GenerateNcAddendum.execute>[1])
        break
      case 'generate_ga_purchase_agreement':
        await GenerateGaPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateGaPurchaseAgreement.execute>[1])
        break
      case 'generate_ga_addendum':
        await GenerateGaAddendum.execute(userId, input as Parameters<typeof GenerateGaAddendum.execute>[1])
        break
      case 'generate_tn_purchase_agreement':
        await GenerateTnPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateTnPurchaseAgreement.execute>[1])
        break
      case 'generate_tn_addendum':
        await GenerateTnAddendum.execute(userId, input as Parameters<typeof GenerateTnAddendum.execute>[1])
        break
      case 'generate_sc_purchase_agreement':
        await GenerateScPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateScPurchaseAgreement.execute>[1])
        break
      case 'generate_sc_addendum':
        await GenerateScAddendum.execute(userId, input as Parameters<typeof GenerateScAddendum.execute>[1])
        break
      case 'generate_fl_purchase_agreement':
        await GenerateFlPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateFlPurchaseAgreement.execute>[1])
        break
      case 'generate_fl_addendum':
        await GenerateFlAddendum.execute(userId, input as Parameters<typeof GenerateFlAddendum.execute>[1])
        break
      case 'generate_mn_purchase_agreement':
        await GenerateMnPurchaseAgreement.execute(userId, input as Parameters<typeof GenerateMnPurchaseAgreement.execute>[1])
        break
      case 'generate_mn_addendum':
        await GenerateMnAddendum.execute(userId, input as Parameters<typeof GenerateMnAddendum.execute>[1])
        break
      default:
        console.error(`document-generator: unknown toolName=${toolName}`)
    }
    console.log(`document-generator completed: toolName=${toolName} userId=${userId}`)
  } catch (err) {
    console.error(`document-generator failed: toolName=${toolName} userId=${userId}`, err)
  }
}
