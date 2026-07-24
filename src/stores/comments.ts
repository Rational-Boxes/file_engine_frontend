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

// Drives the global comment window (ThreadOverlay, mounted in App.vue) — the pure
// comment interface (§10g) that opens for ANY file regardless of preview/rendition
// availability (e.g. a 3D model that failed conversion). An overlay, not a route.
interface CommentsState {
  uid: string
  name: string
}

export const useCommentsStore = defineStore('comments', {
  state: (): CommentsState => ({ uid: '', name: '' }),
  getters: {
    isOpen: (s): boolean => !!s.uid,
  },
  actions: {
    open(uid: string, name = '') {
      if (!uid) return
      this.uid = uid
      this.name = name
    },
    close() {
      this.uid = ''
      this.name = ''
    },
  },
})
