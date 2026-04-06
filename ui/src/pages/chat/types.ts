import type { SearchResult } from '@/hooks/useSearchResults'

export type Conversation = {
  id: string
  type: 'User' | 'AI'
  message: string
  animate?: boolean
  suggestedQuestions?: string[]
  listings?: SearchResult[]
}
