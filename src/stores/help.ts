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
import { DEFAULT_TOPIC } from '@/help'

// Drives the global help overlay (HelpModal, mounted once in App.vue). An overlay,
// NOT a route: opening/closing never touches <router-view>, so the user's working
// context stays put underneath. See design_documents/HELP_SYSTEM_PLAN.md.
//
// State separates "open" (visibility) from "nav" (reading position). Closing only
// flips `open`, so the user's place — active article, back/forward history, and
// per-topic scroll — survives close/reopen and in-app navigation. It is in-memory
// only: a full page reload starts fresh.

interface HelpNavState {
  /** Back/forward stack of topic ids; the modal's own history, not the router's. */
  history: string[]
  /** Cursor within `history`; -1 when the stack is empty. */
  historyIndex: number
  /** Per-topic scroll offset so Back returns to where the reader was scrolled. */
  scrollTops: Record<string, number>
  /** Last search query, remembered across close/reopen. */
  search: string
}

interface HelpState {
  open: boolean
  nav: HelpNavState
  dismissedHints: string[]
}

const MAX_HISTORY = 50

function emptyNav(): HelpNavState {
  return { history: [], historyIndex: -1, scrollTops: {}, search: '' }
}

export const useHelpStore = defineStore('help', {
  state: (): HelpState => ({
    open: false,
    nav: emptyNav(),
    dismissedHints: [],
  }),
  getters: {
    // The article at the cursor is the single source of truth for what's shown;
    // deriving it (rather than storing it) keeps the view and history in sync.
    activeTopicId: (s): string | null => s.nav.history[s.nav.historyIndex] ?? null,
    canBack: (s): boolean => s.nav.historyIndex > 0,
    canForward: (s): boolean => s.nav.historyIndex < s.nav.history.length - 1,
  },
  actions: {
    // Global "?" link: reopen wherever the user left off, keeping the whole stack.
    // First-ever open lands on the default landing topic.
    openAtLastPosition() {
      if (this.nav.historyIndex < 0) this.pushTopic(DEFAULT_TOPIC)
      this.open = true
    },

    // Contextual help icon: navigate to a specific article. Semantically identical
    // to clicking an in-modal link (same pushTopic path) — it just also opens the
    // modal if it was closed. Back therefore returns to the prior article.
    openTopic(id: string) {
      this.pushTopic(id)
      this.open = true
    },

    // New navigation: no-op if already at this topic; otherwise drop any forward
    // entries (branching, like a browser), append, advance the cursor, and cap.
    pushTopic(id: string) {
      const n = this.nav
      if (n.history[n.historyIndex] === id) return
      n.history = n.history.slice(0, n.historyIndex + 1)
      n.history.push(id)
      if (n.history.length > MAX_HISTORY) n.history.shift()
      n.historyIndex = n.history.length - 1
    },

    // Back/Forward move the cursor only — never mutate the stack (re-pushing on
    // back would make forward impossible).
    back() {
      if (this.canBack) this.nav.historyIndex--
    },
    forward() {
      if (this.canForward) this.nav.historyIndex++
    },

    // Non-destructive: nav state survives for the next open.
    close() {
      this.open = false
    },

    rememberScroll(id: string, top: number) {
      this.nav.scrollTops[id] = top
    },
    setSearch(q: string) {
      this.nav.search = q
    },
  },
})
