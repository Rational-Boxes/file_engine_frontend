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
  <div class="sec-view">
    <AppNav />
    <main class="content wide">
      <h1 class="title">Security</h1>
      <template v-if="isAdmin">
        <nav class="tabs">
          <button v-for="t in TABS" :key="t" :class="{ active: tab === t }" @click="selectTab(t)">{{ t }}</button>
        </nav>

        <AuditPanel v-if="tab === 'Audit'" :initial-actor="pendingActor" />
        <SecurityRulesPanel v-else-if="tab === 'Security'" @jump-to-audit="onJumpToAudit" />
        <EventsPanel v-else-if="tab === 'Events'" />
      </template>
      <p v-else class="err">You need administrator access to view security.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import AuditPanel from '@/components/security/AuditPanel.vue'
import SecurityRulesPanel from '@/components/security/SecurityRulesPanel.vue'
import EventsPanel from '@/components/security/EventsPanel.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const isAdmin = computed(() => auth.hasAccessLevel('admin'))

const TABS = ['Audit', 'Security', 'Events'] as const
const tab = ref<(typeof TABS)[number]>('Audit')

// When an incident on the Security tab is clicked, jump to the Audit tab
// pre-filtered by that actor. AuditPanel reads pendingActor on mount.
const pendingActor = ref('')

function selectTab(t: (typeof TABS)[number]) {
  // A manual tab click clears any pending actor jump so the Audit tab opens clean.
  pendingActor.value = ''
  tab.value = t
}
function onJumpToAudit(actor: string) {
  pendingActor.value = actor
  tab.value = 'Audit'
}
</script>

<style scoped>
.content {
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 18px;
}

/* Audit/Security/Events are wide multi-column tables, so give them the full width. */
.content.wide {
  max-width: none;
}

.title {
  font-size: 20px;
  margin: 0 0 12px;
}

.tabs {
  display: flex;
  gap: 6px;
  margin: 0 0 16px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.tabs button {
  border: none;
  background: none;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  font-size: 14px;
}

.tabs button.active {
  color: var(--fg);
  border-bottom-color: var(--primary);
}

.err {
  color: var(--danger);
  font-size: 13px;
}
</style>
