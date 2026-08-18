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
import { installOverloadHandling } from '@/services/serverBusy'
import { tokenStorage } from '@/utils/tokenStorage'
import { SERVICE_PATHS, serviceBase } from '@/services/serviceBase'

// Client for the audit query/export/verify API (usage_logging §9). Auth mirrors
// ldapAdminClient: the http-bridge is the token authority, so we reuse the SPA's
// bearer token (the audit service validates it as an HS256 JWT and gates AUDIT_READ
// on tenant-admin membership). No second login. A 401/403 here does NOT bounce the
// app — the console handles it locally.
//
// Same-origin `/audit` by default — the Vite proxy forwards it to :8097 in dev,
// nginx in prod. VITE_AUDIT_BASE overrides to reach another host.
export const AUDIT_BASE = serviceBase(import.meta.env.VITE_AUDIT_BASE,
                                      SERVICE_PATHS.audit)

const auditClient: AxiosInstance = axios.create({ baseURL: AUDIT_BASE })

auditClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

export default auditClient

// A 503 means the service is shedding load, not that it is broken: show the busy
// toast and retry safe requests. Shared with every other client so the behaviour
// is the same whichever service is out of capacity.
installOverloadHandling(auditClient)
