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

// Satellite service client — folder_actions (SPECIFICATIONS.md §9). Auth is the
// same one-login model CSAI / discussion use: the SPA's bridge bearer token is
// accepted directly (validated via the bridge introspection / shared JWT secret).
//
// A 401 here does NOT bounce the app to /login — folder_actions is a secondary,
// admin-surface that degrades; callers map failures via errorMessage().
//
// VITE_FOLDER_ACTIONS_BASE is an absolute URL in dev (`http://localhost:8099`) or a
// same-origin path (`/folder-actions`) behind the unified reverse proxy.
export const FOLDER_ACTIONS_BASE =
  import.meta.env.VITE_FOLDER_ACTIONS_BASE || 'http://localhost:8099'

const folderActionsClient: AxiosInstance = axios.create({ baseURL: FOLDER_ACTIONS_BASE })

folderActionsClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

export { errorMessage }
export default folderActionsClient
