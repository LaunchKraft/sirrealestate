// ci trigger 8
import Anthropic from '@anthropic-ai/sdk'
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type { MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import * as GetUserProfile from './tools/get-user-profile'
import * as UpdateUserDetails from './tools/update-user-details'
import * as UpsertSearchProfile from './tools/upsert-search-profile'
import * as GetSearchResults from './tools/get-search-results'
import * as ScheduleViewing from './tools/schedule-viewing'
import * as UpdateAvailability from './tools/update-availability'
import * as GetPendingFeedback from './tools/get-pending-feedback'
import * as SaveViewingFeedback from './tools/save-viewing-feedback'
import * as GetDocuments from './tools/get-documents'
import * as CreateOfferDraft from './tools/create-offer-draft'
import * as UpdateOffer from './tools/update-offer'
import * as GetOffers from './tools/get-offers'
import * as GeneratePurchaseAgreement from './tools/generate-purchase-agreement'
import * as GenerateEarnestMoneyAgreement from './tools/generate-earnest-money-agreement'
import * as GenerateAgencyDisclosure from './tools/generate-agency-disclosure'
import * as SubmitOffer from './tools/submit-offer'
import * as DeleteSearchProfile from './tools/delete-search-profile'
import * as RequestLocation from './tools/request-location'
import * as SaveBetaFeedback from './tools/save-beta-feedback'
import * as CreateClosing from './tools/create-closing'
import * as GetClosings from './tools/get-closings'
import * as UpdateClosingMilestone from './tools/update-closing-milestone'
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
import type { ConversationMessage } from './types'

const SYSTEM_PROMPT =
  'You are SirRealtor, an expert AI real estate agent. You help users find properties by ' +
  'understanding their needs through natural conversation. You can save search profiles, ' +
  'show recent property matches, schedule viewings, and collect feedback — all via tool use. ' +
  'At the start of each conversation, call get_user_profile to see what the user already has set up, ' +
  'and call get_pending_feedback to check for any viewings needing feedback. ' +
  'Be concise, proactive, and data-driven. When the user describes what they want, save a search ' +
  'profile and ask if they want to enable daily monitoring. ' +
  'AVAILABILITY: The user\'s viewing availability windows are stored in their profile (see get_user_profile). ' +
  'If the user asks to schedule a viewing and their profile has no availability windows, ask them to share ' +
  'the date/time ranges when they are free, then call update_availability to save those windows. ' +
  'Once saved, immediately call schedule_viewing — do NOT ask for availability again. ' +
  'If the user wants to update or clear their availability, call update_availability with the new windows. ' +
  'The user\'s email address is already known (provided in the User context below) — never ask for it. ' +
  'When the user shares their name, phone number, buyer status, or pre-approval details, call ' +
  'update_user_details immediately to save that information. ' +
  'If the user asks to delete or remove a saved search, call delete_search_profile with the profileId. ' +
  'First confirm which search they mean by showing them the list from get_user_profile if needed. ' +
  'If the user\'s firstName and lastName are not yet set, ask for their name before creating a search profile. ' +
  'Ask about whether they are a first-time home buyer, their current city/state, their desired city/state, ' +
  'and their preferred listing platform (Zillow, Redfin, or Realtor.com) — save all via update_user_details. ' +
  'Call get_documents when the user asks about their documents or budget, or when creating/updating a search profile. ' +
  'If a pre-approval letter is found, use its approvedAmount as the maxPrice ceiling when setting up search criteria. ' +
  'OFFER WORKFLOW: When the user books their first viewing, proactively say: "To be ready to make an offer if you love ' +
  'one of these homes, I\'ll start gathering what we\'ll need. Can you confirm the full legal name(s) of everyone who ' +
  'will be on the offer, and your current mailing address?" Save any name/address info via update_user_details. ' +
  'At the start of each conversation where viewings exist, call get_offers to check for open offer drafts and see ' +
  'what information is still missing. When the user expresses intent to offer on a listing, immediately call ' +
  'create_offer_draft — do not wait until all details are collected. Then use update_offer progressively as the user ' +
  'provides each piece of information. A complete offer requires: all buyers\' full legal name, street address, city, ' +
  'state, zip, phone, and email; financing type (cash requires proof-of-funds documents, financed requires a ' +
  'pre-approval letter plus lender name and loan type); offer price, earnest money amount, closing date, and ' +
  'contingency elections. For financed offers, call get_documents to check for an uploaded pre-approval letter and ' +
  'use its approvedAmount as the offer price ceiling. Set status to "ready" via update_offer once all required fields ' +
  'are complete. Guide the conversation toward completing one missing field at a time — do not ask for everything at once. ' +
  'Once the offer status is "ready", offer to generate the purchase agreement by calling generate_purchase_agreement. ' +
  'Explain that this will create a PDF and send it to the buyer(s) via Dropbox Sign for e-signature. ' +
  'Only call generate_purchase_agreement after the user explicitly confirms they want to proceed. ' +
  'ARIZONA OFFERS: ' +
  'Use the AAR Residential Purchase Contract. Generate with generate_az_rpc. ' +
  'If the property has an HOA, an HOA Addendum must also be signed (track with hoa_addendum in signedForms). ' +
  'Earnest money deadline is 24-48 hours after acceptance — remind the buyer promptly after offer is accepted. ' +
  'After the purchase agreement is signed, offer to generate the earnest money deposit agreement by calling ' +
  'generate_earnest_money_agreement. Ask the buyer for the deposit due date and escrow holder name if not yet known. ' +
  'TEXAS OFFERS: ' +
  'Texas uses TREC-promulgated forms — agents are legally required to use them. ' +
  'Always collect optionFee (typically $100–500, negotiable) and optionPeriodDays (typically 5–10) before generating the TX contract. ' +
  'Generate the TREC One to Four contract with generate_tx_purchase_agreement. ' +
  'For financed buyers, ALWAYS also generate the TREC Third Party Financing Addendum with generate_tx_financing_addendum — it is a required separate document. ' +
  'Earnest money must reach the title company within 3 business days of contract execution. ' +
  'The IABS (Information About Brokerage Services) and a written buyer representation agreement are required by TREC rules. ' +
  'In Colorado, an agency disclosure (brokerage relationship disclosure) must be signed before an offer is submitted. ' +
  'When the offer status reaches "ready", check whether agencyDisclosureDocumentId is set on the offer. ' +
  'If not, call generate_agency_disclosure before proceeding — ask the user for the brokerage name and agent name ' +
  'if not already known. The relationship type defaults to transaction_broker. ' +
  'SUBMISSION: Once all documents are signed — at minimum the purchase agreement (signedForms.purchase_agreement set) ' +
  'and the agency disclosure (agencyDisclosureDocumentId set) — offer to submit the offer to the seller\'s agent. ' +
  'Before calling submit_offer, ensure agentEmail is set on the offer. Ask the user: "What is the seller\'s agent ' +
  'email address?" if not already known, then call update_offer to save it. ' +
  'Call submit_offer only after the user explicitly confirms they are ready to submit. ' +
  'After submission, inform the user that the seller\'s agent has been emailed and typically responds within 24–48 hours. ' +
  'If the user later asks about the offer status, call get_offers and report the sellerResponse.status field. ' +
  'CLOSING WORKFLOW: Once an offer status is "accepted" and signedForms.purchase_agreement is set, ' +
  'proactively call create_closing to initialize the closing record — do not wait for the user to ask. ' +
  'Ask whether they are paying cash or financing, and whether the property has an HOA, if not already known. ' +
  'Seed the closingDate deadline from the offer terms. ' +
  'At the start of conversations where accepted offers exist, call get_closings to check closing status. ' +
  'As the user reports completing closing steps — inspection scheduled, title commitment received, ' +
  'clear to close, etc. — call update_closing_milestone to record each one. ' +
  'You can also update title company, escrow number, and deadlines via update_closing_milestone. ' +
  'Guide the user through the next pending milestone one step at a time. ' +
  'During the inspection phase, offer to generate the Inspection Objection form by calling generate_inspection_objection when the user has completed their inspection and wants to formally object to items. ' +
  'After the Inspection Objection is signed, help the user and seller reach a resolution, then call generate_inspection_resolution to document the agreed remedies or buyer waiver. ' +
  'Always call update_closing_milestone after generating these forms: inspection_objection_sent after objection, inspection_resolved after resolution. ' +
  'ARIZONA CLOSING WORKFLOW: ' +
  'Inspection period is 10 days by default. After inspection, generate the BINSR (generate_az_binsr) listing all items the buyer wants repaired or credited. ' +
  'The seller has 5 days to respond to the BINSR. Track the binsrResponseDeadline. ' +
  'Disclosures phase: remind the buyer to review the SPDS (Seller Property Disclosure Statement) and CLUE report provided by the seller/escrow company. ' +
  'Earnest money must be deposited with the escrow company within 24-48 hours of offer acceptance — much tighter than other states. ' +
  'When creating an AZ closing, always set inspectionPeriodDeadline (acceptance + 10 days) and binsrResponseDeadline (inspectionPeriodDeadline + 5 days). ' +
  'TEXAS CLOSING WORKFLOW: ' +
  'The option period is TX-unique: the buyer pays a small option fee for an unrestricted right to terminate. The inspection always happens during the option period. ' +
  'After inspection, if repairs or credits are needed, generate a TREC Amendment to Contract with generate_tx_amendment. Both parties must sign. ' +
  'After the option period expires, the earnest money becomes at risk — the buyer can no longer terminate without cause. ' +
  'Track optionPeriodDeadline closely — send reminder at 3 days and 1 day before expiration. ' +
  'surveyDeadline: Texas buyers typically need either a new survey or a T-47 affidavit from the seller confirming no changes to an existing survey. Track this as the survey_received milestone. ' +
  "The Seller's Disclosure Notice (SDN) is required by TX Property Code §5.008 — track as seller_disclosure_reviewed milestone. " +
  'When creating a TX closing, always set optionPeriodDeadline (acceptance date + optionPeriodDays) and surveyDeadline (typically 5 days before closing). ' +
  'NEVADA OFFERS: ' +
  'Nevada uses NVAR forms. The key buyer protection is the Due Diligence Period (typically 10–15 days) — the buyer may cancel for any reason and receive a full EMD refund. ' +
  'Always confirm dueDiligenceDays with the buyer before generating the contract. ' +
  'Generate the purchase agreement with generate_nv_purchase_agreement. ' +
  'Earnest money must be deposited with the escrow/title company within 3 business days of acceptance. ' +
  'The Seller\'s Real Property Disclosure (SRPD) is required by NRS 113.130 — remind the buyer to review it during due diligence. ' +
  'NEVADA CLOSING WORKFLOW: ' +
  'The Due Diligence Period is the main inspection/review window — inspection, SRPD review, HOA docs, and financing all happen here. ' +
  'After inspection, if repairs or credits are needed, generate an NVAR Addendum to Purchase Agreement with generate_nv_addendum. Both parties must sign. ' +
  'HOA resale package fees are typically paid by the seller (per NRS Chapter 116). ' +
  'When creating a NV closing, always set dueDiligenceDeadline (acceptance + dueDiligenceDays). ' +
  'UTAH OFFERS: ' +
  'Utah uses the UAR Real Estate Purchase Contract (REPC). Generate with generate_ut_repc. ' +
  'The key buyer protection is the Due Diligence Deadline (default 14 calendar days) — the buyer may cancel for any reason and receive a full EMD refund during this period. ' +
  'Earnest money is due within 3 business days of acceptance. ' +
  'The Seller Property Condition Disclosure (SPCD) is required under the Utah Seller Disclosure Act (Utah Code §57-27) — remind the buyer to review it during due diligence. ' +
  'Always confirm dueDiligenceDays with the buyer before generating the contract. ' +
  'UTAH CLOSING WORKFLOW: ' +
  'The Due Diligence Deadline is the main review window — inspection, SPCD review, HOA documents, and financing all happen here. ' +
  'After the Due Diligence Deadline passes without cancellation, the earnest money becomes at risk. ' +
  'When creating a UT closing, always set dueDiligenceDeadline (acceptance date + dueDiligenceDays). ' +
  'IDAHO OFFERS: ' +
  'Idaho uses IREC forms. Generate the Purchase and Sale Agreement with generate_id_purchase_agreement. ' +
  'Inspection period defaults to 10 business days — confirm with the buyer before generating. ' +
  'Earnest money is due within 3 business days of acceptance. ' +
  'The Seller must provide an Idaho Property Condition Disclosure (Idaho Code § 55-2501) — remind buyer to review during inspection period. ' +
  'IDAHO CLOSING WORKFLOW: ' +
  'After inspection, if repairs or credits are needed, generate an Idaho Addendum with generate_id_addendum. Both parties must sign. ' +
  'When creating an ID closing, always set inspectionDeadline (acceptance date + inspectionDays business days). ' +
  'MONTANA OFFERS: ' +
  'Montana uses MAR Buy-Sell Agreement forms. Generate with generate_mt_purchase_agreement. ' +
  'Ask the buyer whether the property has associated water rights before generating — water rights are a key Montana-specific disclosure. ' +
  'Inspection period defaults to 10 business days — confirm with the buyer before generating. ' +
  'Earnest money is due within 2 business days of acceptance. ' +
  'The Seller must provide a Montana Seller\'s Property Disclosure Statement (MCA § 37-51-313) — remind buyer to review during inspection period. ' +
  'MONTANA CLOSING WORKFLOW: ' +
  'After inspection, if repairs or credits are needed, generate a Montana Addendum with generate_mt_addendum. Both parties must sign. ' +
  'When creating an MT closing, always set inspectionDeadline (acceptance date + inspectionDays business days). ' +
  'OREGON OFFERS: ' +
  'Oregon uses Oregon Realtors OREF-001 forms. Generate the Sale Agreement with generate_or_purchase_agreement. ' +
  'Inspection period defaults to 10 business days — confirm with the buyer before generating. ' +
  'Earnest money is due within 2 business days of acceptance. ' +
  'The Seller must provide an OREF 020 Seller\'s Property Disclosure Statement (ORS 105.465) — buyer has 5 business days to review after receipt. ' +
  'OREGON CLOSING WORKFLOW: ' +
  'After inspection, if repairs or credits are needed, generate an Oregon Repair/Remedy Addendum with generate_or_addendum. Both parties must sign. ' +
  'Seller has 5 business days to respond to repair requests. ' +
  'When creating an OR closing, always set inspectionDeadline (acceptance date + inspectionDays business days). ' +
  'WASHINGTON OFFERS: ' +
  'Washington uses NWMLS Form 21. Generate the Purchase and Sale Agreement with generate_wa_purchase_agreement. ' +
  'Washington uses "mutual acceptance date" — the date both parties have signed — as the start of all deadlines. ' +
  'Inspection period defaults to 10 business days from mutual acceptance — confirm with the buyer before generating. ' +
  'Earnest money is due within 2 business days of mutual acceptance. ' +
  'The Seller must provide a Seller Disclosure Statement (NWMLS Form 17) per RCW 64.06.013 — buyer has 3 business days to revoke after receipt. ' +
  'WASHINGTON CLOSING WORKFLOW: ' +
  'After inspection, if repairs or credits are needed, generate a Washington Inspection Response / Addendum with generate_wa_addendum. Both parties must sign. ' +
  'When creating a WA closing, always set mutualAcceptanceDate and inspectionDeadline (mutual acceptance + inspectionDays business days). ' +
  'NORTH CAROLINA OFFERS: ' +
  'NC uses Form 2-T (jointly approved by NC Realtors and NC Bar Association). Generate with generate_nc_purchase_agreement. ' +
  'NC is UNIQUE: the buyer pays a non-refundable Due Diligence Fee (DD Fee) DIRECTLY to the seller at acceptance — always confirm this amount. ' +
  'The DD Fee is credited toward the purchase price at closing but is forfeited if the buyer terminates during the Due Diligence Period. ' +
  'The Due Diligence Period is typically 14–21 calendar days — confirm with the buyer. ' +
  'Earnest money is held in escrow and ALSO becomes at risk after the Due Diligence Period ends. ' +
  'Seller must provide a Residential Property Disclosure (NC G.S. § 47E). ' +
  'NC closings MUST be conducted by a licensed NC attorney. ' +
  'NORTH CAROLINA CLOSING WORKFLOW: ' +
  'After inspection, use generate_nc_addendum (Form 310-T) to document agreed repairs or credits. Both parties must sign. ' +
  'When creating an NC closing, always set dueDiligenceDeadline (acceptance date + dueDiligenceDays). ' +
  'GEORGIA OFFERS: ' +
  'Georgia uses GAR Form F20. Generate with generate_ga_purchase_agreement. ' +
  'In Georgia, the "Binding Agreement Date" is when the LAST party signs — all deadlines run from this date. ' +
  'EMD is due within 3 BANKING days of the Binding Agreement Date. ' +
  'Ask if the buyer has any special stipulations to include (GA forms have a dedicated special stipulations section). ' +
  'Due diligence period defaults to 10 days from Binding Agreement Date — confirm with the buyer. ' +
  'GEORGIA CLOSING WORKFLOW: ' +
  'After the due diligence period, use generate_ga_addendum to document agreed amendments. Both parties must sign. ' +
  'When creating a GA closing, always set bindingAgreementDate and dueDiligenceDeadline. ' +
  'TENNESSEE OFFERS: ' +
  'Tennessee uses Tennessee Realtors Purchase and Sale Agreement. Generate with generate_tn_purchase_agreement. ' +
  'Inspection period defaults to 10 business days — confirm with the buyer. ' +
  'EMD is due within 5 days of acceptance. ' +
  'Seller must provide a Residential Property Condition Disclosure (TCA § 66-5-201). ' +
  'TENNESSEE CLOSING WORKFLOW: ' +
  'After inspection, use generate_tn_addendum to document agreed amendments. Both parties must sign. ' +
  'When creating a TN closing, always set inspectionDeadline (acceptance date + inspectionDays business days). ' +
  'SOUTH CAROLINA OFFERS: ' +
  'South Carolina uses SCR Form 400. Generate with generate_sc_purchase_agreement. ' +
  'SC is an ATTORNEY STATE — all residential closings MUST be conducted by a licensed SC attorney. Always ask the buyer if they have a closing attorney selected. ' +
  'EMD is due within 5 days of acceptance and is held by the closing attorney. ' +
  'Inspection period defaults to 10 business days — confirm with the buyer. ' +
  'Seller must provide a Residential Property Condition Disclosure (SC Code § 27-50-10). ' +
  'SOUTH CAROLINA CLOSING WORKFLOW: ' +
  'After inspection, use generate_sc_addendum to document agreed amendments. Both parties must sign. ' +
  'When creating an SC closing, always set inspectionDeadline (acceptance date + inspectionDays business days). ' +
  'FLORIDA OFFERS: ' +
  'Florida uses the FAR/BAR Contract for Residential Sale and Purchase (CRSP) or AS IS variant. Generate with generate_fl_purchase_agreement. ' +
  'Ask the buyer whether they want the standard CRSP or the AS IS variant — AS IS is common for cash/investor deals or properties needing work. ' +
  'All Florida deadlines run from the "Effective Date" — when the LAST party signs. ' +
  'EMD is due within 3 calendar days of the Effective Date. ' +
  'Inspection period defaults to 15 calendar days — confirm with the buyer before generating. ' +
  'For financed buyers, confirm loanApprovalDays (default 30 days from Effective Date). ' +
  'Seller must provide Johnson v. Davis disclosures and a FREC-mandated property disclosure. ' +
  'If the property has an HOA, the buyer has 3 business days to review HOA documents and may cancel (FL Statute § 720). ' +
  'FLORIDA CLOSING WORKFLOW: ' +
  'In an AS IS contract, the seller is NOT obligated to make repairs — the buyer\'s only remedy is to cancel and receive a full EMD refund during the inspection period. ' +
  'In a standard CRSP contract, after inspection use generate_fl_addendum to document agreed repairs or credits. Both parties must sign. ' +
  'When creating a FL closing, always set inspectionDeadline (Effective Date + inspectionDays calendar days) and, for financed offers, loanApprovalDeadline. ' +
  'MINNESOTA OFFERS: ' +
  'Minnesota uses the Minnesota Realtors Purchase Agreement. Generate with generate_mn_purchase_agreement. ' +
  'Inspection period defaults to 10 business days — confirm with the buyer before generating. ' +
  'EMD is due upon acceptance (same day or next business day) — much tighter than most states. ' +
  'The Seller must provide a Seller\'s Disclosure of Material Facts (MN § 513.55). ' +
  'If located in Minneapolis, note that a Truth-in-Housing report may be required by the city. ' +
  'If the property has an HOA, the seller must provide an HOA resale certificate (MN § 515B.4-107). ' +
  'MINNESOTA CLOSING WORKFLOW: ' +
  'Buyer has the right to a final walk-through within 24 hours before closing. ' +
  'After inspection, if repairs or credits are needed, use generate_mn_addendum to document agreed modifications. Both parties must sign. ' +
  'When creating an MN closing, always set inspectionDeadline (acceptance date + inspectionDays business days). ' +
  'LOCATION: If the user asks to find properties "in my area", "near me", or any location-relative phrase, ' +
  'first ask: "Do you mind if I request your device\'s location?" ' +
  'Only call request_location after the user explicitly agrees. ' +
  'The tool result will contain { latitude, longitude, city, state } on success, or { error } if denied. ' +
  'On success, immediately call update_user_details to save currentCity and currentState, ' +
  'then proceed with the location-based search. ' +
  'On error, apologize and ask the user to type their city and state instead.'

const secretsManager = new SecretsManagerClient({})
const dynamo = new DynamoDBClient({})
const lambdaClient = new LambdaClient({})
let anthropic: Anthropic | null = null

async function getClient(): Promise<Anthropic> {
  if (anthropic) return anthropic
  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_API_KEY_SECRET_ARN! }),
  )
  anthropic = new Anthropic({ apiKey: SecretString! })
  return anthropic
}

const TOOLS: Anthropic.Tool[] = [
  GetUserProfile.definition,
  UpdateUserDetails.definition,
  UpsertSearchProfile.definition,
  GetSearchResults.definition,
  ScheduleViewing.definition,
  UpdateAvailability.definition,
  GetPendingFeedback.definition,
  SaveViewingFeedback.definition,
  GetDocuments.definition,
  CreateOfferDraft.definition,
  UpdateOffer.definition,
  GetOffers.definition,
  GeneratePurchaseAgreement.definition,
  GenerateEarnestMoneyAgreement.definition,
  GenerateAgencyDisclosure.definition,
  SubmitOffer.definition,
  DeleteSearchProfile.definition,
  RequestLocation.definition,
  SaveBetaFeedback.definition,
  CreateClosing.definition,
  GetClosings.definition,
  UpdateClosingMilestone.definition,
  GenerateInspectionObjection.definition,
  GenerateInspectionResolution.definition,
  GenerateTestPreApproval.definition,
  GenerateAzRpc.definition,
  GenerateAzBinsr.definition,
  GenerateTxPurchaseAgreement.definition,
  GenerateTxFinancingAddendum.definition,
  GenerateTxAmendment.definition,
  GenerateNvPurchaseAgreement.definition,
  GenerateNvAddendum.definition,
  GenerateUtRepc.definition,
  GenerateIdPurchaseAgreement.definition,
  GenerateIdAddendum.definition,
  GenerateMtPurchaseAgreement.definition,
  GenerateMtAddendum.definition,
  GenerateOrPurchaseAgreement.definition,
  GenerateOrAddendum.definition,
  GenerateWaPurchaseAgreement.definition,
  GenerateWaAddendum.definition,
  GenerateNcPurchaseAgreement.definition,
  GenerateNcAddendum.definition,
  GenerateGaPurchaseAgreement.definition,
  GenerateGaAddendum.definition,
  GenerateTnPurchaseAgreement.definition,
  GenerateTnAddendum.definition,
  GenerateScPurchaseAgreement.definition,
  GenerateScAddendum.definition,
  GenerateFlPurchaseAgreement.definition,
  GenerateFlAddendum.definition,
  GenerateMnPurchaseAgreement.definition,
  GenerateMnAddendum.definition,
] as Anthropic.Tool[]

async function executeTool(
  name: string,
  input: unknown,
  userId: string,
  userEmail: string,
): Promise<unknown> {
  switch (name) {
    case 'get_user_profile':
      return GetUserProfile.execute(userId)
    case 'update_user_details':
      return UpdateUserDetails.execute(userId, input as Parameters<typeof UpdateUserDetails.execute>[1])
    case 'upsert_search_profile':
      return UpsertSearchProfile.execute(userId, input as Parameters<typeof UpsertSearchProfile.execute>[1], userEmail)
    case 'delete_search_profile':
      return DeleteSearchProfile.execute(userId, input as Parameters<typeof DeleteSearchProfile.execute>[1])
    case 'get_search_results':
      return GetSearchResults.execute(userId, input as Parameters<typeof GetSearchResults.execute>[1])
    case 'schedule_viewing':
      return ScheduleViewing.execute(userId, input as Parameters<typeof ScheduleViewing.execute>[1], userEmail)
    case 'update_availability':
      return UpdateAvailability.execute(userId, input as Parameters<typeof UpdateAvailability.execute>[1])
    case 'get_pending_feedback':
      return GetPendingFeedback.execute(userId)
    case 'save_viewing_feedback':
      return SaveViewingFeedback.execute(userId, input as Parameters<typeof SaveViewingFeedback.execute>[1])
    case 'get_documents':
      return GetDocuments.execute(userId)
    case 'create_offer_draft':
      return CreateOfferDraft.execute(userId, input as Parameters<typeof CreateOfferDraft.execute>[1], userEmail)
    case 'update_offer':
      return UpdateOffer.execute(userId, input as Parameters<typeof UpdateOffer.execute>[1])
    case 'get_offers':
      return GetOffers.execute(userId, input as Parameters<typeof GetOffers.execute>[1])
    case 'generate_purchase_agreement':
    case 'generate_agency_disclosure':
    case 'generate_earnest_money_agreement':
    case 'generate_test_pre_approval': {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.DOCUMENT_GENERATOR_FUNCTION_NAME!,
        InvocationType: 'Event',
        Payload: JSON.stringify({ toolName: name, userId, input }),
      }))
      const msg = name === 'generate_test_pre_approval'
        ? 'Your test pre-approval letter is being generated and will appear in your Documents within the next minute.'
        : 'Document generation has started. You will receive a signing email from Dropbox Sign within the next minute — please check your inbox.'
      return { message: msg }
    }
    case 'submit_offer': {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.DOCUMENT_GENERATOR_FUNCTION_NAME!,
        InvocationType: 'Event',
        Payload: JSON.stringify({ toolName: name, userId, userEmail, input }),
      }))
      return { message: 'Offer submitted! The seller\'s agent has been emailed the signed purchase agreement and a response link. Offer status is now "submitted". The seller typically responds within 24–48 hours.' }
    }
    case 'save_beta_feedback':
      return SaveBetaFeedback.execute(userEmail, input as Parameters<typeof SaveBetaFeedback.execute>[1])
    case 'create_closing':
      return CreateClosing.execute(userId, input as Parameters<typeof CreateClosing.execute>[1])
    case 'get_closings':
      return GetClosings.execute(userId)
    case 'update_closing_milestone':
      return UpdateClosingMilestone.execute(userId, input as Parameters<typeof UpdateClosingMilestone.execute>[1])
    case 'generate_inspection_objection':
    case 'generate_inspection_resolution':
    case 'generate_az_rpc':
    case 'generate_az_binsr':
    case 'generate_tx_purchase_agreement':
    case 'generate_tx_financing_addendum':
    case 'generate_tx_amendment':
    case 'generate_nv_purchase_agreement':
    case 'generate_nv_addendum':
    case 'generate_ut_repc':
    case 'generate_id_purchase_agreement':
    case 'generate_id_addendum':
    case 'generate_mt_purchase_agreement':
    case 'generate_mt_addendum':
    case 'generate_or_purchase_agreement':
    case 'generate_or_addendum':
    case 'generate_wa_purchase_agreement':
    case 'generate_wa_addendum':
    case 'generate_nc_purchase_agreement':
    case 'generate_nc_addendum':
    case 'generate_ga_purchase_agreement':
    case 'generate_ga_addendum':
    case 'generate_tn_purchase_agreement':
    case 'generate_tn_addendum':
    case 'generate_sc_purchase_agreement':
    case 'generate_sc_addendum':
    case 'generate_fl_purchase_agreement':
    case 'generate_fl_addendum':
    case 'generate_mn_purchase_agreement':
    case 'generate_mn_addendum': {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.DOCUMENT_GENERATOR_FUNCTION_NAME!,
        InvocationType: 'Event',
        Payload: JSON.stringify({ toolName: name, userId, input }),
      }))
      return { message: 'Document generation has started. You will receive a signing email from Dropbox Sign within the next minute — please check your inbox.' }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) }
  }

  let messages: ConversationMessage[]
  let sessionId: string | undefined
  try {
    const parsed = JSON.parse(event.body) as {
      messages?: ConversationMessage[]
      sessionId?: string
    }
    if (!parsed.messages || parsed.messages.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing messages field' }) }
    }
    messages = parsed.messages
    sessionId = parsed.sessionId
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const claims = event.requestContext.authorizer.jwt.claims
  const userId = claims['sub'] as string
  const userEmail = (claims['email'] as string | undefined) ?? ''
  const givenName = claims['given_name'] as string | undefined
  const familyName = claims['family_name'] as string | undefined
  const resolvedSessionId = sessionId ?? userId

  const client = await getClient()
  const conversationMessages: MessageParam[] = messages as MessageParam[]

  // Ensure a profile row exists before the tool loop so get_user_profile always returns real data.
  // For Google federated sign-ins, seed firstName/lastName from the JWT claims on first creation.
  const now = new Date().toISOString()
  const profileSeed: Record<string, unknown> = { userId, email: userEmail, searchProfiles: [], createdAt: now, updatedAt: now }
  if (givenName) profileSeed.firstName = givenName
  if (familyName) profileSeed.lastName = familyName
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.USER_PROFILE_TABLE!,
      Item: marshall(profileSeed),
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  ).catch(() => { /* item already exists — ignore ConditionalCheckFailedException */ })

  // Check if this is a beta user so we can personalise the system prompt
  let isBetaUser = false
  if (userEmail && process.env.WAITLIST_TABLE) {
    const waitlistResult = await dynamo.send(
      new GetItemCommand({
        TableName: process.env.WAITLIST_TABLE,
        Key: { email: { S: userEmail.toLowerCase() } },
        ProjectionExpression: '#s',
        ExpressionAttributeNames: { '#s': 'status' },
      }),
    ).catch(() => null)
    const status = waitlistResult?.Item?.status?.S
    isBetaUser = status === 'invited_beta' || status === 'accepted_beta'
  }

  const betaPromptSection = isBetaUser
    ? '\n\nBETA USER: This user is a valued Sir Realtor beta participant. ' +
      'At the start of fresh conversations (when there is only one user message so far), ' +
      'warmly welcome them to the beta, thank them personally for their early support, ' +
      'and let them know their feedback directly shapes the product. ' +
      'Tell them they can share product feedback with you at any time during any conversation ' +
      'and you will save it instantly. ' +
      'Whenever the user shares any feedback about Sir Realtor — features, experience, bugs, ' +
      'things they love, things they want improved — immediately call save_beta_feedback ' +
      'with their exact words before responding. ' +
      'TEST PRE-APPROVAL LETTER: If the user does not yet have a pre-approval letter in their documents ' +
      '(check get_documents — no document with documentType "pre_approval_letter"), and they have ' +
      'started a property search or expressed interest in making an offer, proactively offer to generate ' +
      'a test pre-approval letter for beta testing. Say something like: "Since you\'re in beta, I can ' +
      'generate a test pre-approval letter so you can experience the full offer workflow — would you like one?" ' +
      'If they say yes, ask for: (1) their full name if not already known, (2) the lender name — offer ' +
      'to make one up (e.g. "Meridian Home Lending") if they prefer, and (3) the pre-approval amount. ' +
      'Once you have all three, call generate_test_pre_approval. Only offer this once per conversation.'
    : ''

  const systemPrompt = `${SYSTEM_PROMPT}${betaPromptSection}\n\nUser context: email=${userEmail}`

  try {
    let reply = ''
    let hasToolUse = false
    const MAX_TOOL_ROUNDS = 10

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL_ID!,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: conversationMessages,
      })

      conversationMessages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text')
        reply = textBlock?.type === 'text' ? textBlock.text : ''
        break
      }

      if (response.stop_reason === 'tool_use') {
        hasToolUse = true
        const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')

        // request_location is handled client-side — return early so the browser can prompt
        const locationBlock = toolUseBlocks.find((b) => b.name === 'request_location')
        if (locationBlock) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              reply: '',
              sessionId: resolvedSessionId,
              messages: conversationMessages as ConversationMessage[],
              hasToolUse: false,
              clientAction: 'request_location',
              toolUseId: locationBlock.id,
            }),
          }
        }

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const result = await executeTool(block.name, block.input, userId, userEmail)
              .catch((err: unknown) => ({ error: String(err) }))
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            }
          }),
        )

        conversationMessages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    const updatedMessages: ConversationMessage[] = conversationMessages as ConversationMessage[]

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply,
        sessionId: resolvedSessionId,
        messages: updatedMessages,
        hasToolUse,
      }),
    }
  } catch (err) {
    console.error('Anthropic API call failed', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to invoke model' }) }
  }
}
