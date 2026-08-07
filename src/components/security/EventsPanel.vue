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
  <section class="events-panel panel">
    <div class="audit-head">
      <h2>Live activity</h2>
      <span class="muted">tenant-wide · auto-refresh 5s</span>
      <button class="link" @click="toggleEventsPause">{{ eventsPaused ? 'Resume' : 'Pause' }}</button>
    </div>
    <div class="audit-table">
      <table>
        <thead><tr><th>time</th><th>category</th><th>action</th><th>outcome</th><th>actor</th><th>target</th></tr></thead>
        <tbody>
          <tr v-for="r in visibleEvents" :key="r.seq" class="arow" :class="r.outcome">
            <td class="ts">{{ fmtTs(r.ts) }}</td>
            <td><span class="badge">{{ r.category }}</span></td>
            <td>{{ r.action }}</td>
            <td><span class="oc" :class="r.outcome">{{ r.outcome }}</span></td>
            <td class="actor">{{ r.actor }}</td>
            <td class="tgt">{{ r.target_name || r.target_uid || '—' }}</td>
          </tr>
          <tr v-if="!visibleEvents.length"><td colspan="6" class="muted empty">Waiting for activity…</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { auditService, type AuditRow } from '@/services/auditService'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const eventFeed = ref<AuditRow[]>([])
// Hide the current user's own audit_read entries from the live feed: polling the
// audit log to build this feed generates them, so they are self-referential noise.
const visibleEvents = computed(() =>
  eventFeed.value.filter((r) => !(r.action === 'audit_read' && r.actor === auth.user)),
)
const eventsPaused = ref(false)
let eventsTimer: ReturnType<typeof setInterval> | undefined

function fmtTs(ts: string) {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleString()
}

async function refreshEvents() {
  if (eventsPaused.value) return
  try {
    eventFeed.value = (await auditService.query({ tenant: auth.tenant ?? '', page: 0, page_size: 30 })).rows
  } catch {
    /* keep the last feed on a transient error */
  }
}
function startEventsPoll() {
  refreshEvents()
  if (!eventsTimer) eventsTimer = setInterval(refreshEvents, 5000)
}
function stopEventsPoll() {
  if (eventsTimer) {
    clearInterval(eventsTimer)
    eventsTimer = undefined
  }
}
function toggleEventsPause() {
  eventsPaused.value = !eventsPaused.value
  if (!eventsPaused.value) refreshEvents()
}

onMounted(startEventsPoll)
onBeforeUnmount(stopEventsPoll)
</script>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 10px; }
h2 { font-size: 15px; margin: 12px 0 2px; }
.muted { color: var(--muted); font-size: 12px; }
.badge { font-size: 10px; background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 999px; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; }

.audit-head { display: flex; align-items: center; gap: 10px; }
.audit-head h2 { margin: 0; flex: 0 0 auto; }
.audit-table { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
.audit-table table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.audit-table th { text-align: left; padding: 6px 8px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); white-space: nowrap; }
.audit-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
.arow.denied td, .arow.error td { background: #fef2f2; }
.ts { white-space: nowrap; color: var(--muted); }
.actor { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tgt { max-width: 240px; }
.oc { font-size: 11px; padding: 0 6px; border-radius: 999px; }
.oc.ok { color: #15803d; background: #f0fdf4; }
.oc.denied, .oc.error { color: #b00020; background: #fef2f2; }
.empty { text-align: center; padding: 16px; }
</style>
