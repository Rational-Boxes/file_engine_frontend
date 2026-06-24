<template>
  <div class="admin-ops">
    <AppNav />
    <main class="content">
      <AdminTabs />
      <h1 class="title">Storage &amp; sync</h1>
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppNav from '@/components/AppNav.vue'
import AdminTabs from '@/components/AdminTabs.vue'
import { adminService, type StorageUsage } from '@/services/adminService'
import { errorMessage } from '@/services/apiClient'
import { formatSize } from '@/utils/format'

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

.title {
  font-size: 20px;
  margin: 0 0 16px;
}

.err {
  color: var(--danger);
  font-size: 13px;
}

.panel {
  background: #fff;
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
