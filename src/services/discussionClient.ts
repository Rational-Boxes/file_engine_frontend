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
import { errorMessage } from '@/services/apiClient'
import { SERVICE_PATHS, serviceBase } from '@/services/serviceBase'

// Fourth service client — the discussion service (document-anchored threads,
// reviews, the attention dashboard, live comment sync). Auth is coordinated the
// same way CSAI is: the bridge is the upstream token authority, so this service
// accepts the SAME bearer token the SPA already holds (validated via the bridge's
// /v1/auth/introspect). One login, no second token.
//
// Like csaiClient, a 401 here does NOT bounce the app to /login — discussion is a
// secondary surface that degrades; callers map failures via errorMessage().
//
// Same-origin `/discuss` by default — the Vite proxy forwards it in dev, nginx in
// prod. VITE_DISCUSS_BASE overrides with an absolute URL to reach another host.
export const DISCUSS_BASE = serviceBase(import.meta.env.VITE_DISCUSS_BASE,
                                        SERVICE_PATHS.discuss)

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
