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
  <section class="audit-panel panel">
    <p v-if="error" class="err">{{ error }}</p>
    <div class="audit-head">
      <h2>Audit log</h2>
      <span v-if="chain || chainBusy" class="chain" :class="chainClass">
        <template v-if="chainBusy">verifying chain…</template>
        <template v-else-if="chain?.ok">✓ chain verified ({{ chain.checked }} rows)</template>
        <template v-else>✕ chain broken at seq {{ chain?.first_broken_seq }}</template>
      </span>
      <button class="link" :disabled="chainBusy" @click="verifyChain">re-verify</button>
    </div>

    <div class="filters">
      <input v-model="auditFilters.actor" placeholder="actor" @keyup.enter="searchAudit" />
      <select v-model="auditFilters.category">
        <option value="">any category</option>
        <option v-for="c in AUDIT_CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
      <input v-model="auditFilters.action" placeholder="action" @keyup.enter="searchAudit" />
      <select v-model="auditFilters.outcome">
        <option value="">any outcome</option>
        <option v-for="o in AUDIT_OUTCOMES" :key="o" :value="o">{{ o }}</option>
      </select>
      <input v-model="auditFilters.target_uid" placeholder="target uid" @keyup.enter="searchAudit" />
      <input v-model="auditFilters.from" type="datetime-local" title="from" />
      <input v-model="auditFilters.to" type="datetime-local" title="to" />
    </div>
    <div class="row">
      <button class="btn" :disabled="busy" @click="searchAudit">Search</button>
      <button class="btn ghost" :disabled="busy" @click="resetAudit">Reset</button>
      <button class="btn ghost" :class="{ active: auditFilters.outcome === 'denied' }" :disabled="busy" @click="deniedOnly">Denied only</button>
      <button class="btn ghost" :disabled="busy || !auditRows.length" @click="exportAudit">Export NDJSON</button>
    </div>

    <div class="audit-table">
      <table>
        <thead>
          <tr><th>time</th><th>category</th><th>action</th><th>outcome</th><th>actor</th><th>target</th><th>from</th></tr>
        </thead>
        <tbody>
          <template v-for="r in auditRows" :key="r.seq">
            <tr class="arow" :class="r.outcome" @click="selectRow(r)">
              <td class="ts">{{ fmtTs(r.ts) }}</td>
              <td><span class="badge">{{ r.category }}</span></td>
              <td>{{ r.action }}</td>
              <td><span class="oc" :class="r.outcome">{{ r.outcome }}</span></td>
              <td class="actor">{{ r.actor }}</td>
              <td class="tgt">
                <span class="tname" :title="r.target_name || r.target_uid || ''">{{ r.target_name || r.target_uid || '—' }}</span>
                <span v-if="r.target_name && r.target_uid" class="tuid" :title="r.target_uid">{{ r.target_uid }}</span>
              </td>
              <td class="muted">{{ r.source_addr || r.source_iface || '—' }}</td>
            </tr>
            <tr v-if="selectedRow?.seq === r.seq" class="detail">
              <td colspan="7">
                <dl>
                  <div><dt>seq</dt><dd>{{ r.seq }}</dd></div>
                  <div><dt>target</dt><dd><span v-if="r.target_name">{{ r.target_name }} · </span>{{ r.target_uid || '—' }} <span class="muted">{{ r.target_type }}</span></dd></div>
                  <div><dt>roles</dt><dd>{{ r.actor_roles.join(', ') || '—' }}</dd></div>
                  <div><dt>source</dt><dd>{{ r.source_iface || '—' }} {{ r.source_addr || '' }}</dd></div>
                  <div v-if="r.request_id"><dt>request id</dt><dd>{{ r.request_id }}</dd></div>
                  <div v-if="r.detail" class="detail-json"><dt>detail</dt><dd><pre>{{ JSON.stringify(r.detail, null, 2) }}</pre></dd></div>
                </dl>
              </td>
            </tr>
          </template>
          <tr v-if="auditLoaded && !auditRows.length"><td colspan="7" class="muted empty">No audit entries match.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pager">
      <button class="link" :disabled="auditPage === 0 || busy" @click="prevAuditPage">← prev</button>
      <span class="muted">page {{ auditPage + 1 }} · {{ auditRows.length }} rows</span>
      <button class="link" :disabled="auditRows.length < auditPageSize || busy" @click="nextAuditPage">next →</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { auditService, type AuditRow, type ChainResult } from '@/services/auditService'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'

const props = withDefaults(defineProps<{ initialActor?: string }>(), { initialActor: '' })

const auth = useAuthStore()

const busy = ref(false)
const error = ref('')

const AUDIT_CATEGORIES = ['access', 'mutate', 'permission', 'user', 'auth', 'admin']
const AUDIT_OUTCOMES = ['ok', 'denied', 'error']
const auditFilters = reactive({ actor: '', target_uid: '', category: '', action: '', outcome: '', from: '', to: '' })
const auditRows = ref<AuditRow[]>([])
const auditPage = ref(0)
const auditPageSize = ref(50)
const auditLoaded = ref(false)
const selectedRow = ref<AuditRow | null>(null)
const chain = ref<ChainResult | null>(null)
const chainBusy = ref(false)

function wrap(fn: () => Promise<void>) {
  return async () => {
    busy.value = true
    error.value = ''
    try {
      await fn()
    } catch (e) {
      error.value = errorMessage(e, 'Request failed')
    } finally {
      busy.value = false
    }
  }
}

const loadAudit = wrap(async () => {
  const res = await auditService.query({
    tenant: auth.tenant ?? '', ...auditFilters,
    page: auditPage.value, page_size: auditPageSize.value,
  })
  auditRows.value = res.rows
  selectedRow.value = null
})
function searchAudit() {
  auditPage.value = 0
  loadAudit()
}
function resetAudit() {
  Object.assign(auditFilters, { actor: '', target_uid: '', category: '', action: '', outcome: '', from: '', to: '' })
  searchAudit()
}
function deniedOnly() {
  auditFilters.outcome = auditFilters.outcome === 'denied' ? '' : 'denied'
  searchAudit()
}
function nextAuditPage() {
  if (auditRows.value.length === auditPageSize.value) {
    auditPage.value++
    loadAudit()
  }
}
function prevAuditPage() {
  if (auditPage.value > 0) {
    auditPage.value--
    loadAudit()
  }
}
function selectRow(r: AuditRow) {
  selectedRow.value = selectedRow.value?.seq === r.seq ? null : r
}
const exportAudit = wrap(async () => {
  const blob = await auditService.exportNdjson({ tenant: auth.tenant ?? '', ...auditFilters })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-${auth.tenant}-${new Date().toISOString().slice(0, 10)}.ndjson`
  a.click()
  URL.revokeObjectURL(url)
})
async function verifyChain() {
  chainBusy.value = true
  try {
    chain.value = await auditService.verify(auth.tenant ?? '')
  } catch (e) {
    chain.value = null
    error.value = errorMessage(e, 'Chain verification failed')
  } finally {
    chainBusy.value = false
  }
}

const chainClass = computed(() => (chain.value ? (chain.value.ok ? 'ok' : 'bad') : ''))
function fmtTs(ts: string) {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleString()
}

onMounted(() => {
  // When arriving from an incident (Security tab), pre-filter by that actor.
  if (props.initialActor) auditFilters.actor = props.initialActor
  auditLoaded.value = true
  loadAudit()
  verifyChain()
})
</script>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 10px; }
h2 { font-size: 15px; margin: 12px 0 2px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; flex: 1; min-width: 160px; font-family: inherit; }
.muted { color: var(--muted); font-size: 12px; }
.badge { font-size: 10px; background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 999px; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.btn.ghost { background: var(--card); color: var(--fg); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; }
.err { color: #b00020; font-size: 13px; }

/* --- audit console --- */
.audit-head { display: flex; align-items: center; gap: 10px; }
.audit-head h2 { margin: 0; flex: 0 0 auto; }
.chain { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
.chain.ok { color: #15803d; border-color: #86efac; background: #f0fdf4; }
.chain.bad { color: #b00020; border-color: #fca5a5; background: #fef2f2; }
.filters { display: flex; gap: 6px; flex-wrap: wrap; }
.filters input, .filters select { flex: 0 1 130px; min-width: 110px; padding: 6px 8px; font-size: 13px; }
select { border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--fg); font-family: inherit; }
.btn.ghost.active { border-color: var(--primary); color: var(--primary); }
.audit-table { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
.audit-table table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.audit-table th { text-align: left; padding: 6px 8px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); white-space: nowrap; }
.audit-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
.arow { cursor: pointer; }
.arow:hover { background: var(--bg); }
.arow.denied td, .arow.error td { background: #fef2f2; }
.ts { white-space: nowrap; color: var(--muted); }
.actor { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tgt { max-width: 240px; }
.tgt .tname, .tgt .tuid { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tgt .tuid { font-size: 11px; color: var(--muted); }
.oc { font-size: 11px; padding: 0 6px; border-radius: 999px; }
.oc.ok { color: #15803d; background: #f0fdf4; }
.oc.denied, .oc.error { color: #b00020; background: #fef2f2; }
.detail td { background: var(--bg); }
.detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 4px 0; font-size: 12px; }
.detail dl > div { display: contents; }
.detail dt { color: var(--muted); }
.detail dd { margin: 0; }
.detail-json dd { grid-column: 2; }
.detail pre { margin: 2px 0; padding: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 6px; overflow-x: auto; font-size: 11.5px; }
.empty { text-align: center; padding: 16px; }
.pager { display: flex; align-items: center; gap: 12px; justify-content: center; margin-top: 6px; }
</style>
