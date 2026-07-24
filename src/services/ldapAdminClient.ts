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
