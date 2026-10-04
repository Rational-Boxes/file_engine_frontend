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

// Reactive view of what this deployment offers, for hiding controls that lead
// nowhere.
//
// STARTS OPTIMISTIC. Every feature reads as available until the probes answer,
// which is the same rule the service uses and for the same reason: unknown is
// not off. A control that appears a moment late looks like a slow page; a
// control that vanishes from a working deployment because a probe had not
// finished looks like a broken one.
//
// The underlying answer is cached for the session, so this is one round of
// requests however many components ask.

import { reactive, readonly, computed } from 'vue'
import { capabilitiesService, type DeploymentCapabilities } from '@/services/capabilitiesService'

const state = reactive({
  loaded: false,
  editing: true,
  // Extensions the Document Server reports it will open. Empty until the probe
  // answers, and empty for a deployment too old to be asked — callers must read
  // that as "offer everything" (see utils/office.creatableDocumentTypes), for
  // the same unknown-is-not-off reason the booleans start true.
  editingExtensions: [] as string[],
  chat: true,
  webSearch: true,
  search: true,
  discussion: true,
  sharing: true,
  difference: true,
  folderActions: true,
  bcf: true,
  audit: true,
  // NOT optimistic, unlike the rest: offering a media share on a deployment
  // that cannot encode mints a link that never plays (MEDIA_SHARE.md §10).
  media: false,
})

let started = false

// ── re-checking a service found absent ───────────────────────────────────────
//
// Production 2026-10-01: one failed probe hid the comment sidebar for a whole
// session on a discussion service that was up throughout, and only signing out
// brought it back. "Absent" is now re-asked — after a minute, then backing off
// to a ceiling so a deployment that genuinely lacks a service costs one small
// request per tab per RECHECK_MAX_MS. "Present" is never re-asked and never
// switched off: a verdict of available is kept for the session, as before.
export const RECHECK_FIRST_MS = 60_000
export const RECHECK_MAX_MS = 15 * 60_000
let recheckTimer: ReturnType<typeof setTimeout> | null = null
let recheckDelay = RECHECK_FIRST_MS

function absentProbed(): string[] {
  const names = capabilitiesService.recheckable?.() ?? []
  const flags = state as unknown as Record<string, boolean>
  return names.filter((n) => flags[n] === false)
}

function csaiPending(): boolean {
  return capabilitiesService.csaiUnknown?.() === true
}

function scheduleRecheck() {
  // Optional on the service so every test that mocks it with load/reset alone
  // keeps working; a service without it simply never re-checks.
  if (recheckTimer || typeof capabilitiesService.recheck !== 'function') return
  if (!absentProbed().length && !csaiPending()) return
  recheckTimer = setTimeout(async () => {
    recheckTimer = null
    if (csaiPending() && typeof capabilitiesService.recheckCsai === 'function') {
      try {
        const c = await capabilitiesService.recheckCsai()
        if (c) applyCsai(c)
      } catch {
        // still unknown; asked again on the next tick
      }
    }
    try {
      const got = await capabilitiesService.recheck(absentProbed())
      const flags = state as unknown as Record<string, boolean>
      for (const [name, ok] of Object.entries(got)) {
        if (ok) flags[name] = true // only ever upgrades
      }
    } catch {
      // A failed re-check is just another "not yet"; try again later.
    }
    recheckDelay = Math.min(recheckDelay * 2, RECHECK_MAX_MS)
    scheduleRecheck()
  }, recheckDelay)
}

// csai's sections only — what a late csai answer can settle.
function applyCsai(c: Partial<DeploymentCapabilities>) {
  if (c.editing) {
    state.editing = c.editing.available
    state.editingExtensions = c.editing.extensions || []
  }
  if (c.chat) state.chat = c.chat.available
  if (c.webSearch) state.webSearch = c.webSearch.available
  if (c.search) state.search = c.search.available
  if (c.media) state.media = c.media.available === true
}

function apply(c: DeploymentCapabilities) {
  state.editing = c.editing.available
  state.editingExtensions = c.editing.extensions || []
  state.chat = c.chat.available
  state.webSearch = c.webSearch.available
  state.search = c.search.available
  state.discussion = c.discussion.available
  state.sharing = c.sharing.available
  state.difference = c.difference.available
  state.folderActions = c.folderActions.available
  state.bcf = c.bcf.available
  state.audit = c.audit.available
  state.media = c.media?.available === true
  state.loaded = true
}

export function useCapabilities() {
  if (!started) {
    started = true
    // Not awaited: the UI renders now and settles when the answer arrives.
    void capabilitiesService.load().then((c) => {
      apply(c)
      scheduleRecheck()
    }).catch(() => {
      state.loaded = true // leave everything optimistic
    })
  }
  return {
    features: readonly(state),
    /** True once the deployment has actually answered — for anything that would
     *  rather wait than flicker. */
    ready: computed(() => state.loaded),
  }
}

/** Re-detect from scratch, as a page reload would. Called when a session is
 *  established: the first detection may have run signed out (or on an expired
 *  token) and been answered 401, which must not outlive the sign-in. */
export async function refreshCapabilities(): Promise<void> {
  if (recheckTimer) clearTimeout(recheckTimer)
  recheckTimer = null
  recheckDelay = RECHECK_FIRST_MS
  started = true
  capabilitiesService.reset()
  try {
    apply(await capabilitiesService.load())
  } catch {
    state.loaded = true
  }
  scheduleRecheck()
}

/** Test seam. */
export function resetCapabilities() {
  started = false
  if (recheckTimer) clearTimeout(recheckTimer)
  recheckTimer = null
  recheckDelay = RECHECK_FIRST_MS
  state.loaded = false
  const flags = state as unknown as Record<string, boolean>
  for (const k of Object.keys(state)) {
    if (k === 'loaded' || k === 'editingExtensions') continue
    flags[k] = true
  }
  state.editingExtensions = []
  capabilitiesService.reset()
}
