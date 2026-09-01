<!--
  Copyright (C) 2026 James Hickman

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<template>
  <AppNav />
  <div class="dash">
    <header class="dash-head">
      <h1>Dashboard</h1>
      <button class="link" :disabled="d.loading" @click="d.refresh()">
        {{ d.loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="d.error" class="dash-err">{{ d.error }}</p>

    <ReviewsInbox class="dash-reviews" />

    <div class="dash-cols">
      <!-- Left column: what needs you, then what you have open. Both are
           "about me" panels, and reading down one column keeps them together;
           document activity on the right is ambient by comparison.

           Wrapped explicitly rather than left to grid auto-placement — three
           bare children in a two-column grid happen to land correctly today,
           and would silently reflow the moment a fourth panel is added. -->
      <div class="dash-col">
        <!-- Attention feed: things requesting the user's attention (§10a). -->
        <section class="feed">
          <!-- The single badge stays the TOTAL: the divisions change how the
               feed reads, not the "one place to look" property. -->
          <h2>Needs your attention <span v-if="d.unreadCount" class="badge">{{ d.unreadCount }}</span></h2>
          <p v-if="!d.attention.length" class="empty">You're all caught up.</p>
          <!--
            Grouped by originating system. A flat list of "someone mentioned you",
            "a review is waiting" and "a stranger dropped a file in your folder"
            reads as noise: those want different reactions, on different
            timescales. Empty divisions are omitted entirely.
          -->
          <template v-for="g in divisions" :key="g.source">
            <h3 class="division">
              {{ sourceLabel(g.source) }}
              <span v-if="g.unread" class="badge small">{{ g.unread }}</span>
            </h3>
            <ul class="items">
              <li
                v-for="n in g.items"
                :key="n.id"
                class="item"
                :class="{ unseen: !n.readAt }"
              >
                <router-link class="item-main" :to="attentionLink(n)" @click="d.markSeen(n.id)">
                  <span class="kind" :data-kind="n.kind">{{ kindLabel(n.kind) }}</span>
                  <!-- Share rows carry their own text precisely so they can be
                       rendered without resolving the resource. -->
                  <span class="who">{{ n.detailText || n.actor }}</span>
                  <time :title="n.createdAt">{{ ago(n.createdAt) }}</time>
                </router-link>
              </li>
            </ul>
          </template>
        </section>

        <!-- Directly under "Needs your attention": the standing answer to "what
             have I got open right now". Renders nothing at all when the user
             shares nothing, which is most users. -->
        <!-- The inbox is share_service's; without it there is nothing to
             receive and the panel can only report a failure. -->
        <SharingInbox v-if="features.sharing" class="dash-sharing" />
      </div>

      <!-- Document activity: new/updated docs the user may see (calm awareness). -->
      <section class="feed">
        <h2>Recent document activity</h2>
        <p v-if="!d.activityFeed.length" class="empty">Nothing new in your files.</p>
        <ul v-else class="items">
          <li v-for="a in d.activityFeed" :key="a.id" class="item">
            <router-link class="item-main" :to="`/preview/${a.fileUid}`">
              <span class="kind" :data-kind="a.eventType">{{ a.eventType }}</span>
              <span class="who" :title="a.name || a.path || a.fileUid">{{
                truncateMiddle(a.name || a.path || a.fileUid)
              }}</span>
              <time :title="a.ts">{{ ago(a.ts) }}</time>
            </router-link>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useDiscussionStore } from '@/stores/discussion'
import AppNav from '@/components/AppNav.vue'
import ReviewsInbox from '@/components/ReviewsInbox.vue'
import SharingInbox from '@/components/SharingInbox.vue'
import { useCapabilities } from '@/composables/useCapabilities'
import { truncateMiddle } from '@/utils/format'
import type { Notification } from '@/services/discussionService'

const d = useDiscussionStore()
const { features } = useCapabilities()

const KIND_LABELS: Record<string, string> = {
  mention: '@ mention',
  reply: 'Reply',
  review_requested: 'Review requested',
  review_acknowledged: 'Review acknowledged',
  review_completed: 'Review completed',
  thread_resolved: 'Thread resolved',
  review_approved: 'Review approved',
  review_rejected: 'Review rejected',
  share_drop_received: 'File dropped',
  share_link_dead: '⚠ Link stopped working',
  share_otp_send_failed: '⚠ Code could not be sent',
  share_first_redemption: 'Link opened',
}

// Fixed order, so the feed does not reshuffle as items arrive. An unrecognised
// source sorts last under its own raw name rather than disappearing.
const SOURCE_ORDER = ['comments', 'reviews', 'sharing']
const SOURCE_LABELS: Record<string, string> = {
  comments: 'Comments', reviews: 'Reviews', sharing: 'Sharing',
}
function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}
function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}

const divisions = computed(() => {
  const groups = new Map<string, Notification[]>()
  for (const n of d.attention) {
    const g = groups.get(n.source) ?? []
    g.push(n)
    groups.set(n.source, g)
  }
  const known = SOURCE_ORDER.filter((s) => groups.has(s))
  const unknown = [...groups.keys()].filter((s) => !SOURCE_ORDER.includes(s)).sort()
  return [...known, ...unknown].map((source) => ({
    source,
    items: groups.get(source)!,
    unread: groups.get(source)!.filter((n) => !n.readAt).length,
  }))
})

// Deep-link to the anchor document's preview with the thread open (§10f).
function attentionLink(n: Notification) {
  // A share item goes to the resource's Share tab, not to a preview: the
  // existing deep-link is doubly wrong for a folder-download link, since
  // folders have no preview route at all.
  if (n.shareLinkUid) {
    return { path: '/files', query: { folder: n.fileUid, tab: 'share' } }
  }
  const query: Record<string, string> = {}
  if (n.threadId) query.thread = n.threadId
  return { path: `/preview/${n.fileUid}`, query }
}

function ago(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

onMounted(() => d.startPolling())
onBeforeUnmount(() => d.stopPolling())
</script>

<style scoped>
.dash {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
}
.dash-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.dash-head h1 {
  font-size: 1.3rem;
  margin: 0;
}
.dash-err {
  color: var(--danger);
}
.dash-reviews {
  margin-top: 12px;
}
.dash-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 12px;
  /* Each column owns its own height: without this the two columns stretch to
     match, and the shorter one's panels are pushed apart by the taller one. */
  align-items: start;
}
.dash-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
@media (max-width: 800px) {
  .dash-cols {
    grid-template-columns: 1fr;
  }
}
.feed h2 {
  font-size: 0.95rem;
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge {
  background: var(--primary);
  color: #fff;
  border-radius: 999px;
  font-size: 0.7rem;
  padding: 1px 7px;
}
.division { font-size: .75rem; text-transform: uppercase; color: #666; margin: .6rem 0 .2rem; }
.badge.small { font-size: .7rem; }
.empty {
  color: var(--muted);
  font-size: 0.9rem;
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
}
.item.unseen {
  border-left: 3px solid var(--primary);
}
.item-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  text-decoration: none;
  color: var(--fg);
}
.kind {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--muted);
  flex: 0 0 auto;
}
.who {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
time {
  color: var(--muted);
  font-size: 0.78rem;
  flex: 0 0 auto;
}
.link {
  border: none;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.85rem;
}
</style>
