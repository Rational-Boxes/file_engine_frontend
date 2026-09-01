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

// What this deployment offers.
//
// Features here are a-la-carte: a deployment may run without in-browser editing,
// without a chat provider, without web search, without an embedding model. The
// SPA used to offer all of them and let whichever service was absent produce the
// error — an "Edit in browser" button that answered 404 where no Document Server
// exists, and no way for the user to tell a missing feature from a broken one.
//
// SHAPE, because it is meant to grow. Sections are namespaced by feature and
// merged, so bringing another optional service into the picture — discussion,
// sharing, BCF, difference — is a matter of adding its probe below and reading a
// new section, not of reworking the callers. Each service answers for itself
// (nothing else knows its configuration), so this merges several small documents
// rather than fetching one big one from a service that would have to guess.
//
// UNKNOWN IS NOT OFF. A deployment running an older service has no capabilities
// endpoint and answers 404. That is reported as AVAILABLE, deliberately: "I could
// not ask" is not "it is switched off", and treating it as off would silently
// withdraw working features from every deployment that has not been upgraded
// yet. Per-object permission checks still apply, so the worst case is the
// behaviour we had before any of this existed.

import axios from 'axios'
import csaiClient from '@/services/csaiClient'
import { SERVICE_PATHS, serviceBase } from '@/services/serviceBase'
import { tokenStorage } from '@/utils/tokenStorage'

export interface EditingCapability {
  available: boolean
  /** Which condition failed. For an operator reading a support question, not
   *  for display. */
  reason: string
  /** Extensions the Document Server will open, per the deployment itself, so
   *  the SPA need not keep its own copy in step. */
  extensions: string[]
}

export interface FeatureCapability {
  available: boolean
  [k: string]: unknown
}

export interface DeploymentCapabilities {
  // Reported by csai, which knows its own configuration in detail.
  editing: EditingCapability
  chat: FeatureCapability
  webSearch: FeatureCapability
  search: FeatureCapability
  // Optional services, each detected by asking it something cheap.
  discussion: FeatureCapability
  sharing: FeatureCapability
  difference: FeatureCapability
  folderActions: FeatureCapability
  bcf: FeatureCapability
  audit: FeatureCapability
}

// What we assume when a service cannot be asked. Everything on, so an
// un-upgraded or briefly unreachable deployment behaves exactly as it did
// before any of this existed.
const ASSUME_AVAILABLE: DeploymentCapabilities = {
  editing: { available: true, reason: '', extensions: [] },
  chat: { available: true },
  webSearch: { available: true },
  search: { available: true },
  discussion: { available: true },
  sharing: { available: true },
  difference: { available: true },
  folderActions: { available: true },
  bcf: { available: true },
  audit: { available: true },
}

// One cheap, authenticated, already-existing endpoint per optional service.
// Chosen for being small and for existing in every release — a probe path that
// only newer builds serve would report older ones as absent.
const PROBES: Record<string, { base: string; path: string }> = {
  discussion: { base: SERVICE_PATHS.discuss, path: '/whoami' },
  sharing: { base: SERVICE_PATHS.share, path: '/v1/links' },
  difference: { base: SERVICE_PATHS.difference, path: '/whoami' },
  folderActions: { base: SERVICE_PATHS.folderActions, path: '/action-types' },
  bcf: { base: SERVICE_PATHS.bcf, path: '/2.1/projects' },
  audit: { base: SERVICE_PATHS.audit, path: '/v1/security/rules' },
}

const PROBE_TIMEOUT_MS = 4000

// Is a service actually there?
//
// A 200 IS NOT ENOUGH, and this is the trap the whole probe exists to avoid.
// When a deployment has no location for a service, the request falls through to
// the SPA's own `location /` and comes back as index.html with HTTP 200 — the
// documented failure that once made a missing audit service look like a
// front-end type error rather than an absent service. So the body has to be
// JSON as well.
//
// 401/403 mean the service answered and declined, which is proof it is running.
// 404 and 5xx mean it is not there, or the edge cannot reach it.
//
// A TRANSPORT failure is treated as available, not absent: a timeout or a
// dropped connection is "I could not ask", and stripping features off the UI
// because one probe blipped would be worse than leaving them and letting the
// real call report the problem.
async function probe(base: string, path: string): Promise<boolean> {
  // Same headers the real clients send — a probe that arrived unauthenticated
  // would be answered 401 by every service and prove nothing about any of them.
  const token = tokenStorage.getAccessToken()
  const tenant = tokenStorage.getActiveTenant()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (tenant) headers['X-Tenant'] = tenant
  try {
    const res = await axios.get(serviceBase(undefined, base) + path, {
      timeout: PROBE_TIMEOUT_MS,
      headers,
      // We inspect the status ourselves; 4xx is information, not an exception.
      validateStatus: () => true,
    })
    if (res.status === 401 || res.status === 403) return true
    if (res.status < 200 || res.status >= 300) return false
    return String(res.headers?.['content-type'] ?? '').includes('json')
  } catch {
    return true // unknown is not off
  }
}

let cached: Promise<DeploymentCapabilities> | null = null

async function fetchCsaiCapabilities(): Promise<Partial<DeploymentCapabilities>> {
  const { data } = await csaiClient.get('/v1/capabilities')
  const ed = data?.editing ?? {}
  return {
    editing: {
      available: ed.available !== false,
      reason: String(ed.reason ?? ''),
      extensions: Array.isArray(ed.extensions) ? ed.extensions : [],
    },
    chat: { ...(data?.chat ?? {}), available: data?.chat?.available !== false },
    webSearch: { ...(data?.web_search ?? {}), available: data?.web_search?.available !== false },
    search: { ...(data?.search ?? {}), available: data?.search?.available !== false },
  }
}

async function detect(): Promise<DeploymentCapabilities> {
  const names = Object.keys(PROBES)
  // Everything at once and nothing allowed to fail the set: one absent service
  // must not stop the others being detected.
  const [csai, ...probes] = await Promise.all([
    fetchCsaiCapabilities().catch(() => ({}) as Partial<DeploymentCapabilities>),
    ...names.map((n) => probe(PROBES[n].base, PROBES[n].path)),
  ])
  const detected: Record<string, FeatureCapability> = {}
  names.forEach((n, i) => {
    detected[n] = { available: probes[i] as boolean }
  })
  return { ...ASSUME_AVAILABLE, ...detected, ...csai } as DeploymentCapabilities
}

export const capabilitiesService = {
  // Asked once per session and shared: this describes the deployment, so
  // re-asking per view would be a request each time to learn something that
  // cannot have changed. The promise itself is the cache, so callers racing at
  // startup share one round rather than issuing several.
  load(): Promise<DeploymentCapabilities> {
    if (!cached) cached = detect().catch(() => ASSUME_AVAILABLE)
    return cached
  },

  /** Test seam, and the hook for a re-probe if a deployment changes under a
   *  live session. */
  reset() {
    cached = null
  },
}
