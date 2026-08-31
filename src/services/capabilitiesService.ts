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

import csaiClient from '@/services/csaiClient'

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
  editing: EditingCapability
  chat: FeatureCapability
  webSearch: FeatureCapability
  search: FeatureCapability
}

// What we assume when a service cannot be asked. Everything on, so an
// un-upgraded deployment behaves exactly as it did before.
const ASSUME_AVAILABLE: DeploymentCapabilities = {
  editing: { available: true, reason: '', extensions: [] },
  chat: { available: true },
  webSearch: { available: true },
  search: { available: true },
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

export const capabilitiesService = {
  // Asked once per session and shared: this describes the server, so re-asking
  // per file or per view would be a request each time to learn something that
  // cannot have changed. The promise itself is the cache, so callers racing
  // during startup share one request rather than issuing several.
  load(): Promise<DeploymentCapabilities> {
    if (!cached) {
      cached = fetchCsaiCapabilities()
        .then((c) => ({ ...ASSUME_AVAILABLE, ...c }))
        .catch(() => ASSUME_AVAILABLE)
    }
    return cached
  },

  /** Test seam, and the hook for a re-probe if a deployment ever changes under
   *  a live session. */
  reset() {
    cached = null
  },
}
