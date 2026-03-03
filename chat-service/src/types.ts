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
