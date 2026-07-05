import axios, { type AxiosInstance } from 'axios'
import { tokenStorage } from '@/utils/tokenStorage'
import { errorMessage } from '@/services/apiClient'

// Fourth service client — the discussion service (document-anchored threads,
// reviews, the attention dashboard, live comment sync). Auth is coordinated the
// same way CSAI is: the bridge is the upstream token authority, so this service
// accepts the SAME bearer token the SPA already holds (validated via the bridge's
// /v1/auth/introspect). One login, no second token.
//
// Like csaiClient, a 401 here does NOT bounce the app to /login — discussion is a
// secondary surface that degrades; callers map failures via errorMessage().
//
// VITE_DISCUSS_BASE is an absolute URL in dev (`http://localhost:8094`) or a
// same-origin path (`/discuss`) behind the unified reverse proxy.
export const DISCUSS_BASE = import.meta.env.VITE_DISCUSS_BASE || 'http://localhost:8094'

const discussionClient: AxiosInstance = axios.create({ baseURL: DISCUSS_BASE })

discussionClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

// Build the ws(s):// URL for a file's live panel channel (§10h). The token +
// tenant ride as query params (browsers can't set WebSocket headers).
export function liveSocketUrl(
  fileUid: string,
  base: string = DISCUSS_BASE,
  token: string | null = tokenStorage.getAccessToken(),
  tenant: string | null = tokenStorage.getActiveTenant(),
): string {
  const httpUrl = /^https?:\/\//i.test(base)
    ? base
    : (typeof window !== 'undefined' ? window.location.origin : '') +
      (base.startsWith('/') ? base : '/' + base)
  const ws = httpUrl.replace(/^http(s?):\/\//i, (_m, s) => `ws${s}://`).replace(/\/+$/, '')
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  if (tenant) params.set('tenant', tenant)
  const qs = params.toString()
  return `${ws}/files/${encodeURIComponent(fileUid)}/live${qs ? `?${qs}` : ''}`
}

export { errorMessage }
export default discussionClient
