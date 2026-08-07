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
  <section class="security-panel panel">
    <p v-if="error" class="err">{{ error }}</p>
    <h2>Incidents</h2>
    <div class="audit-table">
      <table>
        <thead><tr><th>time</th><th>rule</th><th>severity</th><th>actor</th><th>count</th><th>action</th><th>status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="i in incidents" :key="i.id">
            <td class="ts">{{ fmtTs(i.ts) }}</td>
            <td>{{ i.rule_id }}</td>
            <td><span class="sev" :class="i.severity">{{ i.severity }}</span></td>
            <td class="actor"><button class="link" @click="auditForActor(i.actor)">{{ i.actor || i.group_key }}</button></td>
            <td>{{ i.match_count }}</td>
            <td>{{ i.action_taken }}<span v-if="i.dry_run" class="muted"> (dry-run)</span></td>
            <td><span class="badge">{{ i.status }}</span></td>
            <td><button v-if="i.status === 'open'" class="link" @click="ackIncident(i.id)">ack</button></td>
          </tr>
          <tr v-if="securityLoaded && !incidents.length"><td colspan="8" class="muted empty">No incidents.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="rules-head">
      <h2>Rules</h2>
      <button class="btn" @click="newRule">New rule</button>
    </div>
    <ul class="list">
      <li v-for="r in rules" :key="r.id">
        <span class="grow"><strong>{{ r.id }}</strong> <span class="muted">{{ r.description }}</span></span>
        <span class="sev" :class="r.severity">{{ r.severity }}</span>
        <span class="badge">{{ r.response }}<span v-if="r.dry_run"> · dry-run</span></span>
        <label class="chk"><input type="checkbox" :checked="r.enabled" @change="toggleRuleEnabled(r)" /> on</label>
        <button class="link" @click="editRule(r)">Edit</button>
        <button class="link danger" @click="removeRule(r.id)">Delete</button>
      </li>
      <li v-if="securityLoaded && !rules.length" class="muted">No rules configured.</li>
    </ul>

    <Teleport to="body">
    <div v-if="editing" class="rule-modal-backdrop" @click.self="cancelEdit">
      <div class="rule-modal" :class="{ raw: rawMode }" role="dialog" aria-modal="true" :aria-label="editing.id ? 'Edit rule' : 'New rule'">
      <header class="rule-modal-head">
        <h3>{{ editing.id ? 'Edit rule' : 'New rule' }}</h3>
        <button class="link" @click="toggleRaw">{{ rawMode ? 'Guided form' : 'Raw DSL' }}</button>
        <button class="rule-modal-x" aria-label="Close" @click="cancelEdit">✕</button>
      </header>
      <div class="rule-modal-body">
      <div v-if="!rawMode" class="grid2">
        <label>id<input v-model="editing.id" placeholder="rule_id" /></label>
        <label>description<input v-model="editing.description" /></label>
        <label>category
          <select v-model="editing.category"><option v-for="c in AUDIT_CATEGORIES" :key="c" :value="c">{{ c }}</option></select>
        </label>
        <label>action<input v-model="editing.action" placeholder="any" /></label>
        <label>outcome
          <select v-model="editing.outcome"><option value="">any</option><option v-for="o in AUDIT_OUTCOMES" :key="o" :value="o">{{ o }}</option></select>
        </label>
        <label>group by
          <select v-model="editing.group_by"><option v-for="g in GROUP_BYS" :key="g" :value="g">{{ g }}</option></select>
        </label>
        <label>window (s)<input v-model.number="editing.window_s" type="number" /></label>
        <label>threshold<input v-model.number="editing.threshold" type="number" /></label>
        <label>then action<input v-model="editing.then_action" placeholder="sequence seal, e.g. login_success" /></label>
        <label>severity
          <select v-model="editing.severity"><option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option></select>
        </label>
        <label>response
          <select v-model="editing.response"><option v-for="rr in RESPONSES" :key="rr" :value="rr">{{ rr }}</option></select>
        </label>
        <label class="chk">dry-run<input type="checkbox" v-model="editing.dry_run" /></label>
      </div>
      <textarea v-else v-model="rawText" class="raw-dsl" rows="14" spellcheck="false"></textarea>
      </div>
      <footer class="rule-modal-foot">
        <button class="btn" :disabled="busy" @click="saveRule">Save</button>
        <button class="btn ghost" :disabled="busy" @click="validateEditing">Validate against history</button>
        <button class="link" @click="cancelEdit">Cancel</button>
        <span v-if="validateResult" class="ok">would fire {{ validateResult.would_fire }}× over {{ validateResult.events_examined }} recent events</span>
      </footer>
      </div>
    </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { securityService, type Incident, type SecurityRule } from '@/services/securityService'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'

const emit = defineEmits<{ (e: 'jump-to-audit', actor: string): void }>()

const auth = useAuthStore()

const busy = ref(false)
const error = ref('')

const AUDIT_CATEGORIES = ['access', 'mutate', 'permission', 'user', 'auth', 'admin']
const AUDIT_OUTCOMES = ['ok', 'denied', 'error']
const SEVERITIES = ['info', 'warn', 'serious', 'critical']
const RESPONSES = ['flag', 'alert', 'auto_disable']
const GROUP_BYS = ['actor', 'source_addr', 'tenant']
const incidents = ref<Incident[]>([])
const rules = ref<SecurityRule[]>([])
const securityLoaded = ref(false)
const editing = ref<SecurityRule | null>(null)
const rawMode = ref(false)
const rawText = ref('')
const validateResult = ref<{ would_fire: number; events_examined: number } | null>(null)

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

function fmtTs(ts: string) {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleString()
}

function blankRule(): SecurityRule {
  return {
    id: '', description: '', category: 'auth', group_by: 'actor', window_s: 300, threshold: 5,
    action: '', outcome: '', then_action: '', severity: 'warn', response: 'flag',
    dry_run: false, cooldown_s: 300, enabled: true,
  }
}
const loadSecurity = wrap(async () => {
  const t = auth.tenant ?? ''
  incidents.value = await securityService.incidents(t)
  rules.value = (await securityService.rules(t)).effective
})
const ackIncident = (id: number) => wrap(async () => {
  await securityService.setIncidentStatus(id, 'acknowledged', auth.tenant ?? '')
  incidents.value = await securityService.incidents(auth.tenant ?? '')
})()
function newRule() {
  editing.value = blankRule()
  rawMode.value = false
  rawText.value = ''
  validateResult.value = null
}
function editRule(r: SecurityRule) {
  editing.value = { ...r }
  rawText.value = JSON.stringify(r, null, 2)
  rawMode.value = false
  validateResult.value = null
}
function cancelEdit() {
  editing.value = null
  validateResult.value = null
}
// Close the rule editor modal on Escape.
function onRuleModalKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && editing.value) {
    e.preventDefault()
    cancelEdit()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onRuleModalKey)
  securityLoaded.value = true
  loadSecurity()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onRuleModalKey))
function toggleRaw() {
  if (!editing.value) return
  if (!rawMode.value) rawText.value = JSON.stringify(editing.value, null, 2)
  else {
    try {
      editing.value = { ...editing.value, ...JSON.parse(rawText.value) }
    } catch {
      error.value = 'Invalid JSON'
      return
    }
  }
  rawMode.value = !rawMode.value
}
function currentRule(): SecurityRule | null {
  if (!editing.value) return null
  if (!rawMode.value) return editing.value
  try {
    return { ...editing.value, ...JSON.parse(rawText.value) }
  } catch {
    error.value = 'Invalid JSON'
    return null
  }
}
const saveRule = wrap(async () => {
  const r = currentRule()
  if (!r || !r.id) {
    error.value = 'A rule id is required'
    return
  }
  await securityService.saveRule(r, auth.tenant ?? '')
  editing.value = null
  await loadSecurity()
})
const removeRule = (id: string) => wrap(async () => {
  await securityService.deleteRule(id, auth.tenant ?? '')
  await loadSecurity()
})()
const toggleRuleEnabled = (r: SecurityRule) => wrap(async () => {
  await securityService.saveRule({ ...r, enabled: !r.enabled }, auth.tenant ?? '')
  await loadSecurity()
})()
const validateEditing = wrap(async () => {
  const r = currentRule()
  if (!r) return
  validateResult.value = await securityService.validate(r, auth.tenant ?? '')
})
// Jump from an incident to its evidence in the Audit tab (handled by the parent view).
function auditForActor(actor: string | null) {
  if (!actor) return
  emit('jump-to-audit', actor)
}
</script>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 10px; }
h2 { font-size: 15px; margin: 12px 0 2px; }
h3 { font-size: 14px; margin: 8px 0 2px; }
input, textarea { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; flex: 1; min-width: 160px; font-family: inherit; }
textarea { min-height: 160px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.chk { display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; align-items: center; }
.list { list-style: none; padding: 0; margin: 4px 0; }
.list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-top: 1px solid var(--border); }
.grow { flex: 1; text-align: left; }
.muted { color: var(--muted); font-size: 12px; }
.badge { font-size: 10px; background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 999px; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.btn.ghost { background: var(--card); color: var(--fg); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; }
.link.danger { color: #b00020; }
.ok { color: #15803d; font-size: 13px; align-self: center; }
.err { color: #b00020; font-size: 13px; }
select { border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--fg); font-family: inherit; }

.audit-table { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
.audit-table table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.audit-table th { text-align: left; padding: 6px 8px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); white-space: nowrap; }
.audit-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
.ts { white-space: nowrap; color: var(--muted); }
.actor { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { text-align: center; padding: 16px; }

/* --- security --- */
.rules-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.sev { font-size: 11px; padding: 0 6px; border-radius: 999px; text-transform: capitalize; }
.sev.info { color: var(--muted); background: var(--bg); }
.sev.warn { color: #92400e; background: #fffbeb; }
.sev.serious, .sev.critical { color: #b00020; background: #fef2f2; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.raw-dsl {
  flex: 1 1 auto; min-height: 240px; width: 100%; box-sizing: border-box;
  resize: none; font-family: ui-monospace, 'SFMono-Regular', monospace; font-size: 12px;
}

/* Rule create/edit overlay modal (teleported to <body>). */
.rule-modal-backdrop {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(15, 23, 42, 0.55);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 40px 20px; overflow-y: auto;
}
.rule-modal {
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  width: 100%; max-width: 640px; max-height: calc(100vh - 80px);
  display: flex; flex-direction: column; overflow: hidden;
}
/* Raw DSL mode: take the full available height so the editor textarea fills it. */
.rule-modal.raw { height: calc(100vh - 80px); }
.rule-modal-head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.rule-modal-head h3 { margin: 0; flex: 1 1 auto; }
.rule-modal-x {
  border: none; background: none; font-size: 18px; line-height: 1;
  color: var(--muted); cursor: pointer; flex: 0 0 auto;
}
.rule-modal-body { padding: 16px 18px; overflow-y: auto; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.rule-modal-foot {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 14px 18px; border-top: 1px solid var(--border);
}
</style>
