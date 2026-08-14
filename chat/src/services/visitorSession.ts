import { ss } from '@/utils/storage'

const API_URL = import.meta.env.VITE_GLOB_API_URL || ''
const VISITOR_TOKEN_KEY = 'VISITOR_SESSION_TOKEN'
const ANONYMOUS_DEVICE_ID_KEY = 'ANONYMOUS_DEVICE_ID'
const TOKEN_EXPIRY_LEEWAY_SECONDS = 60

let visitorTokenRequest: Promise<string> | null = null

function getApiUrl(path: string): string {
  return `${API_URL}${path}`
}

export function getVisitorToken(): string {
  return ss.get(VISITOR_TOKEN_KEY) || ''
}

export function setVisitorToken(token: string) {
  if (!token) return
  ss.set(VISITOR_TOKEN_KEY, token)
}

export function removeVisitorToken() {
  ss.remove(VISITOR_TOKEN_KEY)
}

function parseJwtPayload(token: string): Record<string, any> | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    return JSON.parse(window.atob(padded))
  } catch {
    return null
  }
}

function isVisitorTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token)
  const exp = Number(payload?.exp)
  if (!Number.isFinite(exp)) return false
  return exp <= Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_LEEWAY_SECONDS
}

function createAnonymousDeviceId(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  if (window.crypto?.getRandomValues) {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function getAnonymousDeviceId(): string {
  const existing = ss.get(ANONYMOUS_DEVICE_ID_KEY)
  if (existing) return existing
  const deviceId = createAnonymousDeviceId()
  ss.set(ANONYMOUS_DEVICE_ID_KEY, deviceId)
  return deviceId
}

async function requestVisitorToken(): Promise<string> {
  if (visitorTokenRequest) return visitorTokenRequest

  visitorTokenRequest = fetch(getApiUrl('/auth/visitor-session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: getAnonymousDeviceId(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    }),
  })
    .then(async response => {
      if (!response.ok) throw new Error(response.status.toString())
      const payload = await response.json()
      const token = typeof payload?.data === 'string' ? payload.data : ''
      if (!token) throw new Error('visitor token missing')
      setVisitorToken(token)
      return token
    })
    .finally(() => {
      visitorTokenRequest = null
    })

  return visitorTokenRequest
}

export async function ensureVisitorToken(
  options: { forceRefresh?: boolean } = {}
): Promise<string> {
  if (options.forceRefresh) removeVisitorToken()
  const existing = getVisitorToken()
  if (existing && !isVisitorTokenExpired(existing)) return existing
  if (existing) removeVisitorToken()
  return requestVisitorToken()
}

export async function refreshVisitorToken(): Promise<string> {
  return ensureVisitorToken({ forceRefresh: true })
}
