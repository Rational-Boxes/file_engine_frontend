import axios, { type AxiosInstance } from 'axios'
import { tokenStorage } from '@/utils/tokenStorage'
import { errorMessage } from '@/services/apiClient'

// Second service client — convert_search_ai (search, document text, RAG chat).
//
// Auth is coordinated: the bridge is the upstream token authority, so this
// service accepts the SAME bearer token the SPA already holds (validated by the
// bridge's /v1/auth/introspect). We therefore reuse tokenStorage — there is no
// second login and no second token.
//
// Unlike apiClient, a 401 here does NOT bounce the whole app to /login: the
// bridge session may still be valid, so AI features simply degrade. Callers map
// failures to a user message via errorMessage().
//
// VITE_CSAI_BASE may be an absolute URL (`http://localhost:8092`, local dev) or a
// same-origin path (`/csai`, behind the unified nginx reverse proxy).
export const CSAI_BASE = import.meta.env.VITE_CSAI_BASE || 'http://localhost:8092'

const csaiClient: AxiosInstance = axios.create({ baseURL: CSAI_BASE })

csaiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

// No 401 redirect interceptor on purpose — degrade AI panels, don't log out.

// Build the WebSocket URL for the streaming RAG chat (`/chat`). The token is
// passed as a query param (browsers can't set headers on a WebSocket); the
// active tenant is forwarded so retrieval is scoped correctly.
export function chatSocketUrl(
  base: string = CSAI_BASE,
  token: string | null = tokenStorage.getAccessToken(),
  tenant: string | null = tokenStorage.getActiveTenant(),
): string {
  // Resolve to an absolute ws(s):// URL. An absolute http(s) base is rewritten in
  // place; a same-origin path base (e.g. "/csai" behind the proxy) is resolved
  // against the current page origin so it inherits ws vs wss from the page.
  const httpUrl = /^https?:\/\//i.test(base)
    ? base
    : (typeof window !== 'undefined' ? window.location.origin : '') +
      (base.startsWith('/') ? base : '/' + base)
  const ws = httpUrl.replace(/^http(s?):\/\//i, (_m, s) => `ws${s}://`).replace(/\/+$/, '')
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  if (tenant) params.set('tenant', tenant)
  const qs = params.toString()
  return `${ws}/chat${qs ? `?${qs}` : ''}`
}

// Open the chat WebSocket using the current token + tenant.
export function openChatSocket(): WebSocket {
  return new WebSocket(chatSocketUrl())
}

export { errorMessage }
export default csaiClient
