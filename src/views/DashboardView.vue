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
      <!-- Attention feed: things requesting the user's attention (§10a). -->
      <section class="feed">
        <h2>Needs your attention <span v-if="d.unreadCount" class="badge">{{ d.unreadCount }}</span></h2>
        <p v-if="!d.attention.length" class="empty">You're all caught up.</p>
        <ul v-else class="items">
          <li
            v-for="n in d.attention"
            :key="n.id"
            class="item"
            :class="{ unseen: !n.readAt }"
          >
            <router-link class="item-main" :to="attentionLink(n)" @click="d.markSeen(n.id)">
              <span class="kind" :data-kind="n.kind">{{ kindLabel(n.kind) }}</span>
              <span class="who">{{ n.actor }}</span>
              <time :title="n.createdAt">{{ ago(n.createdAt) }}</time>
            </router-link>
          </li>
        </ul>
      </section>

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
import { onMounted, onBeforeUnmount } from 'vue'
import { useDiscussionStore } from '@/stores/discussion'
import AppNav from '@/components/AppNav.vue'
import ReviewsInbox from '@/components/ReviewsInbox.vue'
import { truncateMiddle } from '@/utils/format'
import type { Notification } from '@/services/discussionService'

const d = useDiscussionStore()

const KIND_LABELS: Record<string, string> = {
  mention: '@ mention',
  reply: 'Reply',
  review_requested: 'Review requested',
  review_acknowledged: 'Review acknowledged',
  review_completed: 'Review completed',
  thread_resolved: 'Thread resolved',
}
function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}

// Deep-link to the anchor document's preview with the thread open (§10f).
function attentionLink(n: Notification) {
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
