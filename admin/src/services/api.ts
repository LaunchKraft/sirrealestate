import { fetchAuthSession } from 'aws-amplify/auth'

const BASE_URL = import.meta.env.VITE_API_URL as string

async function getToken(): Promise<string> {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (!token) throw new Error('Not authenticated')
  return token
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${method} ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

const get = <T>(path: string) => request<T>('GET', path)
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body)
const del = <T>(path: string) => request<T>('DELETE', path)

export interface DashboardCounts {
  users: number
  profiles: number
  searches: number
  documents: number
  viewings: number
  offers: number
}

export interface WaitlistEntry {
  email: string
  status: 'waitlist' | 'invited_beta' | 'accepted_beta'
  createdAt: string
}

export interface AdminUser {
  userId: string
  email: string
  emailVerified: boolean
  status: string
  enabled: boolean
  createdAt: string
  profile: Record<string, unknown> | null
}

export const api = {
  dashboard: {
    get: () => get<{ counts: DashboardCounts }>('/dashboard'),
  },
  users: {
    list: (nextToken?: string) =>
      get<{ users: AdminUser[]; nextToken: string | null }>(
        `/users${nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : ''}`,
      ),
    setEnabled: (username: string, enabled: boolean) =>
      patch<{ ok: boolean }>('/users', { username, enabled }),
  },
  profile: {
    update: (userId: string, data: Record<string, unknown>) =>
      patch<{ ok: boolean }>(`/profile?userId=${encodeURIComponent(userId)}`, data),
    deleteSearchProfile: (userId: string, profileId: string) =>
      del<{ ok: boolean }>(`/searches?userId=${encodeURIComponent(userId)}&profileId=${encodeURIComponent(profileId)}`),
  },
  documents: {
    list: () => get<{ documents: Record<string, unknown>[] }>('/documents'),
  },
  viewings: {
    list: () => get<{ viewings: Record<string, unknown>[] }>('/viewings'),
  },
  offers: {
    list: () => get<{ offers: Record<string, unknown>[] }>('/offers'),
  },
  waitlist: {
    list: () => get<{ entries: WaitlistEntry[] }>('/waitlist'),
    delete: (email: string) => del<{ ok: boolean }>(`/waitlist?email=${encodeURIComponent(email)}`),
    updateStatus: (email: string, status: string) =>
      patch<{ ok: boolean }>(`/waitlist?email=${encodeURIComponent(email)}`, { status }),
    invite: (email: string) =>
      request<{ ok: boolean }>('POST', `/waitlist/invite?email=${encodeURIComponent(email)}`),
  },
}
