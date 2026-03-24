/**
 * Async document generation Lambda.
 * Invoked fire-and-forget from the chat Lambda to avoid the 30-second
 * API Gateway timeout during PDF generation + S3 upload + Dropbox Sign calls.
 */
import * as GeneratePurchaseAgreement from './tools/generate-purchase-agreement'
import * as GenerateAgencyDisclosure from './tools/generate-agency-disclosure'
import * as GenerateEarnestMoneyAgreement from './tools/generate-earnest-money-agreement'

interface DocumentGeneratorEvent {
  toolName: string
  userId: string
  input: unknown
}

export async function handler(event: DocumentGeneratorEvent): Promise<void> {
  const { toolName, userId, input } = event
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
      default:
        console.error(`document-generator: unknown toolName=${toolName}`)
    }
    console.log(`document-generator completed: toolName=${toolName} userId=${userId}`)
  } catch (err) {
    console.error(`document-generator failed: toolName=${toolName} userId=${userId}`, err)
  }
}
