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
  'After the purchase agreement is signed, offer to generate the earnest money deposit agreement by calling ' +
  'generate_earnest_money_agreement. Ask the buyer for the deposit due date and escrow holder name if not yet known. ' +
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
    case 'generate_earnest_money_agreement': {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.DOCUMENT_GENERATOR_FUNCTION_NAME!,
        InvocationType: 'Event',
        Payload: JSON.stringify({ toolName: name, userId, input }),
      }))
      return { message: 'Document generation has started. You will receive a signing email from Dropbox Sign within the next minute — please check your inbox.' }
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
    case 'generate_inspection_resolution': {
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
      'with their exact words before responding.'
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
