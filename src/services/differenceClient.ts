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
import { errorMessage } from '@/services/apiClient'
import { SERVICE_PATHS, serviceBase } from '@/services/serviceBase'

// Satellite service client — difference_service (version comparison). Auth is the
// same one-login model CSAI / discussion / folder_actions use: the SPA's bridge
// bearer token is accepted directly.
//
// A 401 here does NOT bounce the app to /login — comparison is a secondary
// surface that degrades; callers map failures via errorMessage().
//
// Same-origin `/diff` by default (Vite proxy in dev, nginx in prod).
export const DIFF_BASE = serviceBase(import.meta.env.VITE_DIFF_BASE, SERVICE_PATHS.difference)

const differenceClient: AxiosInstance = axios.create({
  baseURL: DIFF_BASE,
  // 202 and 422 are DEFINED outcomes of the diff contract, not transport errors:
  // 202 means "computing, poll again" and 422 means "attempted and failed, fall
  // back to side-by-side". Letting axios reject them would turn both into generic
  // failures and lose the very distinction the service exists to draw.
  validateStatus: (status) => (status >= 200 && status < 300) || status === 422,
})

differenceClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

export { errorMessage }
export default differenceClient

// A 503 means the service is shedding load, not that it is broken: show the busy
// toast and retry safe requests. Shared with every other client so the behaviour
// is the same whichever service is out of capacity.
installOverloadHandling(differenceClient)
