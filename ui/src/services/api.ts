// Zero React dependencies — portable as-is to any JS environment.
import { fetchAuthSession } from 'aws-amplify/auth'
import type { ChatRequest, ChatResponse } from '@/types'
import type { UserProfile } from '@/hooks/useUserProfile'
import type { SearchResult } from '@/hooks/useSearchResults'
import type { Viewing } from '@/hooks/useViewings'
import type { UserDocument } from '@/hooks/useDocuments'

const API_URL = import.meta.env.VITE_API_URL

async function getAuthHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const authHeader = await getAuthHeader()
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
}

export const chat = {
  send: (req: ChatRequest) => api.post<ChatResponse>('/chat', req),
}

export const profile = {
  get: () => api.get<UserProfile>('/profile'),
  patch: (body: { firstName?: string; lastName?: string }) =>
    api.patch<{ ok: boolean }>('/profile', body),
}

export const searchResults = {
  get: () => api.get<{ results: SearchResult[]; grouped: Record<string, SearchResult[]> }>('/search-results'),
}

export const viewings = {
  get: () => api.get<{ viewings: Viewing[] }>('/viewings'),
}

export const documents = {
  list: () => api.get<{ documents: UserDocument[] }>('/documents'),
  getUploadUrl: (fileName: string, contentType: string) =>
    api.get<{ uploadUrl: string; documentId: string; s3Key: string }>(
      `/documents/upload-url?fileName=${encodeURIComponent(fileName)}&contentType=${encodeURIComponent(contentType)}`,
    ),
  confirm: (body: { documentId: string; s3Key: string; fileName: string; contentType: string; sizeBytes: number }) =>
    api.post<UserDocument>('/documents', body),
  getDownloadUrl: (documentId: string) =>
    api.get<{ downloadUrl: string }>(`/documents/download-url?documentId=${encodeURIComponent(documentId)}`),
}
