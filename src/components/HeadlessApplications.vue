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

<!-- Desktop applications' headless runs, folded per application (generated key),
     collapsed by default so they never crowd the user's own research chats. -->
<template>
  <details v-if="applications.length" class="apps">
    <summary class="apps-head">Applications ({{ applications.length }})</summary>
    <details v-for="a in applications" :key="a.clientKeyId" class="app">
      <summary class="app-head" :title="a.clientKeyId">
        <span class="app-name">{{ a.label || 'Unnamed key' }}<span
          v-if="needsKeyHint(a)" class="key-hint"> · …{{ a.clientKeyId.slice(-4) }}</span></span>
        <span class="app-count">{{ a.runCount }}</span>
        <span
          v-if="a.usage && a.usage.state !== 'ok'"
          class="usage-badge"
          :class="a.usage.state"
          :title="a.usage.message"
        >{{ a.usage.state === 'exceeded' ? 'limit reached' : 'high usage' }}</span>
      </summary>
      <p v-if="a.usage && a.usage.state !== 'ok'" class="usage-msg">{{ a.usage.message }}</p>
      <ul class="runs">
        <li v-for="r in a.runs" :key="r.id">
          <button
            type="button"
            class="run-open"
            :class="{ active: r.id === activeRunId }"
            :title="r.title"
            @click="$emit('open', r.id)"
          >{{ r.title }}</button>
        </li>
      </ul>
    </details>
  </details>
</template>

<script setup lang="ts">
import type { HeadlessApplication } from '@/services/headlessService'

const props = defineProps<{ applications: HeadlessApplication[]; activeRunId?: string | null }>()
defineEmits<{ (e: 'open', runId: string): void }>()

// Two credentials can carry the same name; the end of the key id tells them apart.
function needsKeyHint(a: HeadlessApplication): boolean {
  return props.applications.filter((x) => (x.label || '') === (a.label || '')).length > 1
}
</script>

<style scoped>
.apps { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 8px; }
.apps-head { cursor: pointer; font-weight: 600; font-size: 13px; color: var(--muted); }
.app { margin: 6px 0 0 8px; }
.app-head { cursor: pointer; display: flex; gap: 6px; align-items: center; font-size: 13px; }
.app-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-hint, .app-count { color: var(--muted); font-size: 12px; }
.usage-badge { font-size: 11px; border-radius: 8px; padding: 0 6px; border: 1px solid currentColor; }
.usage-badge.warning { color: #b7791f; }
.usage-badge.exceeded { color: var(--danger, #c53030); }
.usage-msg { font-size: 12px; color: var(--muted); margin: 4px 0; }
.runs { list-style: none; margin: 4px 0 0; padding: 0; }
.run-open {
  width: 100%; text-align: left; background: none; border: 0; padding: 4px 6px;
  color: inherit; font-size: 12px; border-radius: 4px; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.run-open:hover { color: var(--primary); }
.run-open.active { background: rgba(127, 127, 127, 0.16); }
</style>
