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

// Satellite service client — share_service (outside share links). Auth is the
// same one-login model CSAI / discussion / difference use: the SPA's bridge
// bearer token is accepted directly.
//
// This client only ever talks to the OWNER-SIDE routes (/share/v1/*). The
// public half (/share/v1/public/*) is what an outside recipient's browser
// hits, and it must never be called with a bearer token attached — see
// shareService.ts, which is why the recipient landing page uses its own
// token-free client rather than this one.
//
// Same-origin `/share` by default (Vite proxy in dev, nginx in prod).
export const SHARE_BASE = serviceBase(import.meta.env.VITE_SHARE_BASE, SERVICE_PATHS.share)

const shareClient: AxiosInstance = axios.create({ baseURL: SHARE_BASE })

shareClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenant = tokenStorage.getActiveTenant()
  if (tenant) config.headers['X-Tenant'] = tenant
  return config
})

// A 401 here does NOT bounce the app to /login. Sharing is a secondary surface:
// if the service is unreachable or the feature is switched off, the drawer tab
// should degrade rather than throw the user out of the file they were reading.
installOverloadHandling(shareClient)

export default shareClient
