import axios, { type AxiosInstance } from 'axios'
import { tokenStorage } from '@/utils/tokenStorage'

// Single axios instance pointed at the http_bridge REST proxy. Every request
// carries the opaque bridge bearer token; a 401 means the token is missing or
// expired (bridge tokens have a fixed TTL and cannot be refreshed), so we clear
// it and bounce to the login page.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8090'

// Root directory is the all-zeros UUID (the bridge is UID-native).
export const ROOT_UID = '00000000-0000-0000-0000-000000000000'

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
})

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Scope every request to the user's selected tenant (the bridge honors
  // X-Tenant per request, overriding the token's issue-time tenant).
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) {
    config.headers['X-Tenant'] = tenant
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      tokenStorage.clearTokens()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

// Pull a human-readable message out of an axios error ({"error": "..."} bodies
// from the bridge, else the transport message).
export function errorMessage(error: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

export default apiClient
