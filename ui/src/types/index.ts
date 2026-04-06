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

import type { SearchResult } from '@/hooks/useSearchResults'

export interface ChatRequest {
  messages: ConversationMessage[]
  sessionId?: string
}

export interface ChatResponse {
  reply: string
  sessionId: string
  messages: ConversationMessage[]
  hasToolUse: boolean
  clientAction?: string
  toolUseId?: string
  listings?: SearchResult[]
}
