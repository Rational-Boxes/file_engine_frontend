import axios, { type AxiosInstance } from 'axios'
import { tokenStorage } from '@/utils/tokenStorage'

// Client for the LDAP Manager service (tenant user/role admin, self-service
// profile/password, invite/reset). Auth is coordinated exactly like csaiClient:
// the http-bridge is the token authority, so we reuse the SPA's bearer token
// (the service validates it via the bridge's /v1/auth/introspect). No second
// login. A 401 here does NOT bounce the app — callers handle it locally.
//
// VITE_LDAPADMIN_BASE may be absolute (`http://localhost:8093`) or a same-origin
// path (`/ldapadmin`, behind the unified nginx proxy — the default in the stack).
export const LDAPADMIN_BASE = import.meta.env.VITE_LDAPADMIN_BASE || '/ldapadmin'

const ldapAdminClient: AxiosInstance = axios.create({ baseURL: LDAPADMIN_BASE })

ldapAdminClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

export default ldapAdminClient
