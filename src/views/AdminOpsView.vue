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
  <div class="admin-ops">
    <AppNav />
    <main class="content" :class="{ wide: tab === 'Classifier sets' || tab === 'Email templates' }">
      <h1 class="title">System configuration</h1>
      <nav class="tabs">
        <button v-for="t in TABS" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
      </nav>

      <!-- ============ STORAGE & SYNC ============ -->
      <section v-if="tab === 'Storage & sync'">
        <p v-if="error" class="err">{{ error }}</p>

        <section class="panel">
          <h2 class="panel-head">Storage usage</h2>
          <template v-if="usage">
            <div class="bar"><div class="bar-fill" :style="{ width: pct + '%' }"></div></div>
            <dl class="stats">
              <dt>Used</dt>
              <dd>{{ formatSize(usage.usedSpace) }} ({{ pct }}%)</dd>
              <dt>Available</dt>
              <dd>{{ formatSize(usage.availableSpace) }}</dd>
              <dt>Total</dt>
              <dd>{{ formatSize(usage.totalSpace) }}</dd>
            </dl>
          </template>
          <p v-else-if="loading" class="muted">Loading…</p>
          <button class="link" :disabled="loading" @click="load">Refresh</button>
        </section>

        <section class="panel">
          <h2 class="panel-head">Object store sync</h2>
          <p class="muted">Trigger a background sync between local storage and the object store.</p>
          <div class="sync-row">
            <button class="btn" :disabled="syncing" @click="sync">
              {{ syncing ? 'Syncing…' : 'Trigger sync' }}
            </button>
            <span v-if="syncMsg" class="ok">{{ syncMsg }}</span>
          </div>
        </section>
      </section>

      <!-- ============ INTEGRATIONS ============ -->
      <section v-else-if="tab === 'Integrations'">
        <IntegrationsPanel />
      </section>

      <!-- ============ CLASSIFIER SETS ============ -->
      <section v-else-if="tab === 'Classifier sets'">
        <ClassifierSetsPanel />
      </section>

      <!-- ============ EMAIL TEMPLATES ============ -->
      <section v-else-if="tab === 'Email templates'">
        <nav class="subtabs">
          <button :class="{ active: emailKind === 'Account' }" @click="emailKind = 'Account'">Account</button>
          <button :class="{ active: emailKind === 'Event notifications' }" @click="emailKind = 'Event notifications'">
            Event notifications
          </button>
        </nav>
        <AccountEmailTemplates v-if="emailKind === 'Account'" />
        <NotifyTemplatesPanel v-else />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppNav from '@/components/AppNav.vue'
import IntegrationsPanel from '@/components/system/IntegrationsPanel.vue'
import ClassifierSetsPanel from '@/components/system/ClassifierSetsPanel.vue'
import AccountEmailTemplates from '@/components/system/AccountEmailTemplates.vue'
import NotifyTemplatesPanel from '@/components/system/NotifyTemplatesPanel.vue'
import { adminService, type StorageUsage } from '@/services/adminService'
import { errorMessage } from '@/services/apiClient'
import { formatSize } from '@/utils/format'

const TABS = ['Storage & sync', 'Integrations', 'Classifier sets', 'Email templates'] as const
const tab = ref<(typeof TABS)[number]>('Storage & sync')

// Email-templates sub-toggle: account templates vs. event-notification templates.
const emailKind = ref<'Account' | 'Event notifications'>('Account')

const usage = ref<StorageUsage | null>(null)
const loading = ref(false)
const syncing = ref(false)
const error = ref('')
const syncMsg = ref('')

const pct = computed(() => Math.round(usage.value?.usagePercentage ?? 0))

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    usage.value = await adminService.storageUsage()
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load storage usage')
  } finally {
    loading.value = false
  }
}

async function sync() {
  syncing.value = true
  error.value = ''
  syncMsg.value = ''
  try {
    await adminService.triggerSync()
    syncMsg.value = 'Sync triggered.'
  } catch (e) {
    error.value = errorMessage(e, 'Failed to trigger sync')
  } finally {
    syncing.value = false
  }
}
</script>

<style scoped>
.content {
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 18px;
}

/* The classifier and template surfaces use wide two-column layouts, so those
   tabs get more room; the storage/integrations tabs stay narrow for reading. */
.content.wide {
  max-width: 1100px;
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

.subtabs {
  display: flex;
  gap: 6px;
  margin: 0 0 14px;
  border-bottom: 1px solid var(--border);
}

.subtabs button {
  border: none;
  background: none;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  font-size: 13px;
}

.subtabs button.active {
  color: var(--fg);
  border-bottom-color: var(--primary);
}

.err {
  color: var(--danger);
  font-size: 13px;
}

.panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
}

.panel-head {
  font-size: 14px;
  margin: 0 0 10px;
}

.bar {
  height: 10px;
  border-radius: 999px;
  background: var(--bg);
  overflow: hidden;
  margin-bottom: 10px;
}

.bar-fill {
  height: 100%;
  background: var(--primary);
}

.stats {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  margin: 0 0 10px;
  font-size: 13px;
}

.stats dt {
  color: var(--muted);
}

.stats dd {
  margin: 0;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}

.sync-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-size: 13px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.link {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.ok {
  color: #15803d;
  font-size: 13px;
}
</style>
