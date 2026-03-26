import { fetchAuthSession } from 'aws-amplify/auth'
import type { ChatRequest, ChatResponse } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL

let socket: WebSocket | null = null
let pending: { resolve: (r: ChatResponse) => void; reject: (e: Error) => void } | null = null

function connect(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    ws.onopen = () => resolve(ws)
    ws.onerror = () => reject(new Error('WebSocket connection failed'))
  })
}

async function getSocket(): Promise<WebSocket> {
  if (socket && socket.readyState === WebSocket.OPEN) return socket

  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (!token) throw new Error('Not authenticated')

  socket = await connect(token)

  socket.onmessage = (event) => {
    if (!pending) return
    const { resolve, reject } = pending
    pending = null
    try {
      const data = JSON.parse(event.data as string) as ChatResponse & { error?: string }
      if (data.error) {
        reject(new Error(data.error))
      } else {
        resolve(data)
      }
    } catch {
      reject(new Error('Invalid WebSocket response'))
    }
  }

  socket.onclose = () => {
    socket = null
    if (pending) {
      const { reject } = pending
      pending = null
      reject(new Error('WebSocket closed unexpectedly'))
    }
  }

  socket.onerror = () => {
    socket = null
    if (pending) {
      const { reject } = pending
      pending = null
      reject(new Error('WebSocket error'))
    }
  }

  return socket
}

export async function wsSend(req: ChatRequest): Promise<ChatResponse> {
  const ws = await getSocket()
  return new Promise<ChatResponse>((resolve, reject) => {
    pending = { resolve, reject }
    ws.send(JSON.stringify(req))
  })
}
