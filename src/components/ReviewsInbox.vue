<template>
  <section class="ri">
    <h2>Reviews</h2>
    <p v-if="error" class="ri-err">{{ error }}</p>

    <div v-if="assigned.length" class="ri-group">
      <h3>Awaiting your review</h3>
      <ul class="ri-list">
        <li v-for="r in assigned" :key="r.id" class="ri-item">
          <router-link class="ri-link" :to="link(r)">Review · {{ short(r.fileUid) }}</router-link>
          <span class="ri-st" :data-st="r.status">{{ r.status }}</span>
          <span class="ri-who">from {{ r.requester }}</span>
          <span class="ri-actions">
            <button v-if="r.status === 'requested'" class="ri-btn" @click="ack(r)">Acknowledge</button>
            <button class="ri-btn ok" @click="complete(r, 'approved')">Approve</button>
            <button class="ri-btn" @click="complete(r, 'changes')">Request changes</button>
          </span>
        </li>
      </ul>
    </div>

    <div v-if="requested.length" class="ri-group">
      <h3>Requested by you</h3>
      <ul class="ri-list">
        <li v-for="r in requested" :key="r.id" class="ri-item">
          <router-link class="ri-link" :to="link(r)">Review · {{ short(r.fileUid) }}</router-link>
          <span class="ri-who">{{ r.reviewer }}</span>
          <span class="ri-st" :data-st="r.status">{{ r.status }}</span>
          <span v-if="r.outcome" class="ri-outcome">{{ r.outcome }}</span>
        </li>
      </ul>
    </div>

    <p v-if="!loading && !assigned.length && !requested.length" class="empty">No open reviews.</p>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { discussionService, type ReviewRequest } from '@/services/discussionService'

const assigned = ref<ReviewRequest[]>([])
const requested = ref<ReviewRequest[]>([])
const loading = ref(false)
const error = ref('')

const OPEN = new Set(['requested', 'acknowledged'])

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [asReviewer, asRequester] = await Promise.all([
      discussionService.listReviews('reviewer'),
      discussionService.listReviews('requester'),
    ])
    assigned.value = asReviewer.filter((r) => OPEN.has(r.status))
    requested.value = asRequester
  } catch {
    error.value = 'Could not load reviews.'
  } finally {
    loading.value = false
  }
}

async function ack(r: ReviewRequest) {
  try {
    await discussionService.acknowledgeReview(r.id)
    await load()
  } catch {
    error.value = 'Could not acknowledge.'
  }
}

async function complete(r: ReviewRequest, outcome: string) {
  try {
    await discussionService.completeReview(r.id, outcome)
    await load()
  } catch {
    error.value = 'Could not complete the review.'
  }
}

function short(uid: string): string {
  return uid.length > 10 ? uid.slice(0, 8) + '…' : uid
}
function link(r: ReviewRequest) {
  const query: Record<string, string> = {}
  if (r.threadId) query.thread = r.threadId
  return { path: `/preview/${r.fileUid}`, query }
}

onMounted(load)
defineExpose({ load })
</script>

<style scoped>
.ri {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  padding: 12px;
}
.ri h2 {
  font-size: 0.95rem;
  margin: 0 0 8px;
}
.ri h3 {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 10px 0 4px;
}
.ri-err {
  color: var(--danger);
}
.ri-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ri-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.85rem;
}
.ri-link {
  color: var(--fg);
  text-decoration: none;
  font-weight: 600;
}
.ri-who {
  color: var(--muted);
}
.ri-st {
  font-size: 0.7rem;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 1px 7px;
  background: var(--bg);
  color: var(--muted);
}
.ri-st[data-st='requested'] {
  background: #fef3c7;
  color: #92400e;
}
.ri-st[data-st='completed'] {
  background: #dcfce7;
  color: #166534;
}
.ri-outcome {
  font-style: italic;
  color: var(--muted);
}
.ri-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.ri-btn {
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 8px;
  padding: 2px 10px;
  cursor: pointer;
  font-size: 0.8rem;
}
.ri-btn.ok {
  border-color: var(--primary);
  color: var(--primary);
}
.empty {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
