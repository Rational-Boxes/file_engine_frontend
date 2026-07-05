import { defineStore } from 'pinia'
import { discussionService, type Activity, type Notification } from '@/services/discussionService'

// The dashboard's attention + activity feeds (§10a). Refreshed on a ~30s poll
// while the view is focused — poll, not push (the only live channel is the open
// comment panel, §10h). The poll pauses when the tab is hidden and refreshes on
// refocus, so background tabs don't hammer the API.
const POLL_MS = Number(import.meta.env.VITE_DISCUSS_POLL_MS) || 30000

interface DiscussionState {
  attention: Notification[]
  activity: Activity[]
  loading: boolean
  error: string | null
  _timer: ReturnType<typeof setInterval> | null
  _watching: boolean
}

export const useDiscussionStore = defineStore('discussion', {
  state: (): DiscussionState => ({
    attention: [],
    activity: [],
    loading: false,
    error: null,
    _timer: null,
    _watching: false,
  }),

  getters: {
    unreadCount: (s) => s.attention.filter((n) => !n.readAt).length,
  },

  actions: {
    async refresh() {
      this.loading = true
      this.error = null
      try {
        const [attention, activity] = await Promise.all([
          discussionService.attention({ limit: 100 }),
          discussionService.activity({ limit: 100 }),
        ])
        this.attention = attention
        this.activity = activity
      } catch {
        // Secondary surface — degrade quietly (no logout, no throw).
        this.error = 'Could not load your dashboard.'
      } finally {
        this.loading = false
      }
    },

    async markSeen(notificationId: number) {
      const ok = await discussionService.markSeen(notificationId).catch(() => false)
      if (ok) {
        const n = this.attention.find((x) => x.id === notificationId)
        if (n) n.readAt = new Date().toISOString()
      }
    },

    startPolling() {
      if (this._timer) return
      this.refresh()
      this._timer = setInterval(() => {
        if (typeof document === 'undefined' || !document.hidden) this.refresh()
      }, POLL_MS)
      if (!this._watching && typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this._onVisibility)
        this._watching = true
      }
    },

    stopPolling() {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
      if (this._watching && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._onVisibility)
        this._watching = false
      }
    },

    _onVisibility() {
      if (!document.hidden) this.refresh()
    },
  },
})
