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
        <span class="app-name">{{ a.label || 'Unnamed key' }}</span>
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

defineProps<{ applications: HeadlessApplication[]; activeRunId?: string | null }>()
defineEmits<{ (e: 'open', runId: string): void }>()
</script>

<style scoped>
.apps { margin-top: 12px; border-top: 1px solid var(--border, #e3e6ea); padding-top: 8px; }
.apps-head { cursor: pointer; font-weight: 600; font-size: 13px; color: var(--muted, #5f6b7a); }
.app { margin: 6px 0 0 8px; }
.app-head { cursor: pointer; display: flex; gap: 6px; align-items: center; font-size: 13px; }
.app-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-count { color: var(--muted, #5f6b7a); font-size: 12px; }
.usage-badge { font-size: 11px; border-radius: 8px; padding: 0 6px; }
.usage-badge.warning { background: #fff4d6; color: #7a5600; }
.usage-badge.exceeded { background: #fde2e1; color: #8a1c13; }
.usage-msg { font-size: 12px; color: var(--muted, #5f6b7a); margin: 4px 0; }
.runs { list-style: none; margin: 4px 0 0; padding: 0; }
.run-open {
  width: 100%; text-align: left; background: none; border: 0; padding: 4px 6px;
  font-size: 12px; border-radius: 4px; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.run-open:hover, .run-open.active { background: var(--hover, #eef2f7); }
</style>
