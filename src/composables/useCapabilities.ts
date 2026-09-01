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
  chat: true,
  webSearch: true,
  search: true,
  discussion: true,
  sharing: true,
  difference: true,
  folderActions: true,
  bcf: true,
  audit: true,
})

let started = false

function apply(c: DeploymentCapabilities) {
  state.editing = c.editing.available
  state.chat = c.chat.available
  state.webSearch = c.webSearch.available
  state.search = c.search.available
  state.discussion = c.discussion.available
  state.sharing = c.sharing.available
  state.difference = c.difference.available
  state.folderActions = c.folderActions.available
  state.bcf = c.bcf.available
  state.audit = c.audit.available
  state.loaded = true
}

export function useCapabilities() {
  if (!started) {
    started = true
    // Not awaited: the UI renders now and settles when the answer arrives.
    void capabilitiesService.load().then(apply).catch(() => {
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

/** Test seam. */
export function resetCapabilities() {
  started = false
  state.loaded = false
  for (const k of Object.keys(state) as Array<keyof typeof state>) {
    if (k !== 'loaded') (state as Record<string, boolean>)[k] = true
  }
  capabilitiesService.reset()
}
