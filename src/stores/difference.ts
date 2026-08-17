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

import { defineStore } from 'pinia'

// Drives the version-comparison overlay (DiffOverlay.vue, mounted in App.vue).
// Like the document preview and the 3D viewer, comparing is an OVERLAY — not a
// route change — so the file browser underneath keeps its scroll position,
// selection and the drawer the reader opened it from.
//
// The store holds only the *request*: which file and which two versions. The
// answer (status, manifest, children) belongs to the overlay, because it is
// fetched, polled and discarded per session — parking it here would mean stale
// results reappearing the next time the overlay opens.
interface DifferenceState {
  uid: string
  name: string
  /** Target version — the "after" side. Empty means the file's newest. */
  target: string
  /** Explicit base — the "before" side. Empty means the target's predecessor. */
  base: string
}

export const useDifferenceStore = defineStore('difference', {
  state: (): DifferenceState => ({ uid: '', name: '', target: '', base: '' }),
  getters: {
    isOpen: (s): boolean => !!s.uid,
    /** True when the reader picked an explicit base rather than taking the default. */
    hasExplicitBase: (s): boolean => !!s.base,
  },
  actions: {
    /**
     * Open a comparison. `target` defaults to the newest version and `base` to
     * the target's immediate predecessor — the same defaults the service applies,
     * so "compare" with no further choices does the obvious thing.
     */
    open(uid: string, name = '', target = '', base = '') {
      if (!uid) return
      this.uid = uid
      this.name = name
      this.target = target
      this.base = base
    },
    close() {
      this.uid = ''
      this.name = ''
      this.target = ''
      this.base = ''
    },
  },
})
