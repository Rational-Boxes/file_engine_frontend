// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
    const status = error.response?.status
    // 401: token missing/expired. 403 + 2fa_required: the active tenant requires a
    // second factor this (password-only) session hasn't cleared — e.g. after
    // switching into a tenant that mandates 2FA. Both require a fresh login; the
    // 2FA case adds ?reason=2fa so the login page can explain, and re-login will
    // run the challenge for the persisted active tenant.
    const needs2fa = status === 403 && error.response?.data?.error === '2fa_required'
    if (status === 401 || needs2fa) {
      tokenStorage.clearTokens()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign(needs2fa ? '/login?reason=2fa' : '/login')
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

// HTTP status of an axios error, if any (undefined for transport/non-axios).
export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

export default apiClient
