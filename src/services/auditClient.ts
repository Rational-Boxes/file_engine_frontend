import axios, { type AxiosInstance } from 'axios'
import { tokenStorage } from '@/utils/tokenStorage'

// Client for the audit query/export/verify API (usage_logging §9). Auth mirrors
// ldapAdminClient: the http-bridge is the token authority, so we reuse the SPA's
// bearer token (the audit service validates it as an HS256 JWT and gates AUDIT_READ
// on tenant-admin membership). No second login. A 401/403 here does NOT bounce the
// app — the console handles it locally.
//
// VITE_AUDIT_BASE may be absolute (`http://localhost:8099`) or a same-origin path
// (`/audit`, behind the unified nginx proxy — the default in the stack).
export const AUDIT_BASE = import.meta.env.VITE_AUDIT_BASE || '/audit'

const auditClient: AxiosInstance = axios.create({ baseURL: AUDIT_BASE })

auditClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

export default auditClient
