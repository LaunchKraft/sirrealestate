// Shared domain types used by chat handler, tools, search worker, and data handler.

export interface SearchCriteria {
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
  bathrooms?: number
  propertyType?: string
  city?: string
  state?: string
  zipCodes?: string[]
}

export interface NotificationPreferences {
  email: boolean
  sms: false
  push: false
}

export interface SearchProfile {
  profileId: string
  name: string
  isDefault: boolean
  criteria: SearchCriteria
  monitoring: boolean
  notificationPreferences: NotificationPreferences
  createdAt: string
  updatedAt: string
}

export interface UserProfile {
  userId: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  buyerStatus?: 'browsing' | 'actively_looking' | 'ready_to_offer'
  preApproved?: boolean
  preApprovalAmount?: number
  preferredContactMethod?: 'email' | 'phone'
  firstTimeHomeBuyer?: boolean
  currentCity?: string
  currentState?: string
  desiredCity?: string
  desiredState?: string
  listingViewingPreference?: 'zillow' | 'redfin' | 'realtor'
  searchProfiles: SearchProfile[]
  createdAt: string
  updatedAt: string
}

export interface Listing {
  listingId: string
  address: string
  price: number
  bedrooms: number
  bathrooms: number
  sqft?: number
  agentEmail?: string
  agentName?: string
  listingUrl?: string
  latitude?: number
  longitude?: number
  rawData: unknown
}

export interface SearchResult {
  userId: string
  profileIdListingId: string  // SK: profileId#listingId
  profileId: string
  listingId: string
  listingData: Listing
  matchedAt: string
  notified: boolean
}

export type NotificationType =
  | 'new_listing'
  | 'viewing_request'
  | 'viewing_confirmation'
  | 'viewing_feedback_request'

export type NotificationChannel = 'email' | 'sms_placeholder' | 'push_placeholder'

export interface Notification {
  userId: string
  notificationId: string
  type: NotificationType
  channel: NotificationChannel
  recipientAddress: string
  subject: string
  sentAt: string
  status: string
}

export type ViewingStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled'

export interface ViewingFeedback {
  rating: number  // 1-5
  notes: string
  wouldMakeOffer: boolean
}

export interface Viewing {
  userId: string
  viewingId: string
  listingId: string
  profileId: string
  listingAddress: string
  agentEmail?: string
  agentName?: string
  requestedAt: string
  availabilitySlots?: string[]   // buyer's offered timeslots
  proposedDateTime?: string      // set when agent confirms a slot
  agentSelectedSlot?: string     // confirmed slot value, or 'none'
  agentRespondedAt?: string
  status: ViewingStatus
  feedback?: ViewingFeedback
  feedbackRequestedAt?: string
  feedbackCollectedAt?: string
}

export interface UserDocument {
  userId: string
  documentId: string
  fileName: string
  contentType: string
  sizeBytes: number
  s3Key: string
  uploadedAt: string
  documentType?: string
  extractedData?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Offer types
// ---------------------------------------------------------------------------

export type OfferStatus =
  | 'draft'
  | 'ready'
  | 'submitted'
  | 'accepted'
  | 'countered'
  | 'rejected'
  | 'withdrawn'

export interface OfferBuyer {
  buyerId: string
  fullLegalName: string
  street: string
  unit?: string
  city: string
  state: string
  zipCode: string
  phone: string
  email: string
  isPrimaryBuyer: boolean
}

export interface CashFinancing {
  type: 'cash'
  proofOfFundsDocumentIds: string[]
}

export interface FinancedFinancing {
  type: 'financed'
  preApprovalLetterDocumentId?: string
  lenderName?: string
  loanType?: string   // 'conventional' | 'fha' | 'va' | 'usda' | 'jumbo'
  downPaymentAmount?: number
  loanAmount?: number
}

export type OfferFinancing = CashFinancing | FinancedFinancing

export interface OfferContingencies {
  inspection: boolean
  inspectionPeriodDays?: number   // Colorado default: 10
  appraisal: boolean
  financing: boolean
  financingDeadlineDays?: number  // Colorado default: 21
  saleOfExistingHome?: boolean
}

export interface PurchaseAgreementTerms {
  offerPrice?: number
  earnestMoneyAmount?: number
  closingDate?: string            // ISO 8601 date
  possessionDate?: string         // ISO 8601 date; often same as closingDate
  contingencies: OfferContingencies
  inclusions?: string[]           // appliances / fixtures included in sale
  exclusions?: string[]           // items seller is keeping
  sellerConcessions?: number      // seller-paid closing cost contribution
}

export type SellerResponseStatus = 'pending' | 'received' | 'accepted' | 'countered' | 'rejected'

export interface SellerResponse {
  status: SellerResponseStatus
  disclosureDocumentIds?: string[]  // SR21 and any addenda uploaded by seller's agent
  counterOfferPrice?: number
  respondedAt?: string
}

export interface Offer {
  userId: string
  offerId: string
  listingId: string
  listingAddress: string
  viewingId?: string              // the viewing that led to this offer
  profileId?: string              // search profile the listing matched
  status: OfferStatus
  /** 2-letter state code — determines which form templates apply */
  propertyState: string
  buyers: OfferBuyer[]
  financing?: OfferFinancing
  terms?: PurchaseAgreementTerms
  // Generated / signed document IDs (all stored in Documents table)
  purchaseAgreementDocumentId?: string
  earnestMoneyAgreementDocumentId?: string
  agencyDisclosureDocumentId?: string
  /**
   * Dropbox Sign signature_request_ids keyed by FormType.
   * Populated when a document is sent for signing; used to correlate webhook events.
   */
  signingRequests?: Record<string, string>
  // Seller response — token enables unauthenticated upload by seller's agent
  sellerResponseToken?: string
  sellerResponse?: SellerResponse
  createdAt: string
  updatedAt: string
  submittedAt?: string
}

// ---------------------------------------------------------------------------
// Anthropic SDK compatible message types
export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface ToolUseContentBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface ToolResultContentBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: ContentBlock[]
}
