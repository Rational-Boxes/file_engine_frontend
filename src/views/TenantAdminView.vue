<template>
  <div class="tadmin">
    <AppNav />
    <main class="content" :class="{ wide: tab === 'Audit' || tab === 'Security' || tab === 'Events' }">
      <h1>Tenant administration</h1>
      <nav class="tabs">
        <button v-for="t in TABS" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
      </nav>
      <p v-if="error" class="err">{{ error }}</p>

      <!-- ============ USERS ============ -->
      <section v-if="tab === 'Users'" class="panel">
        <h2>Invite a new user</h2>
        <div class="row">
          <input v-model="newUser.email" type="email" placeholder="email@company.com" />
          <input v-model="newUser.display_name" placeholder="Display name" />
        </div>
        <div class="roles-pick">
          <label v-for="r in roles" :key="r.name" class="chk">
            <input type="checkbox" :value="r.name" v-model="newUser.roles" /> {{ r.name }}
          </label>
        </div>
        <button class="btn" :disabled="!newUser.email || !newUser.display_name || busy" @click="invite">
          Invite &amp; email set-password link
        </button>
        <span v-if="invited" class="ok">Invited {{ invited }} ✓</span>

        <h2>Find an existing user</h2>
        <input v-model="userQuery" placeholder="exact email / uid or ≥3-char prefix" @keyup.enter="search" />
        <button class="btn ghost" :disabled="userQuery.length < 3 || busy" @click="search">Search</button>
        <ul class="list">
          <li v-for="u in found" :key="u.uid">
            <span class="grow">{{ u.display_name || u.uid }} <span class="muted">{{ u.email }}</span></span>
            <span v-if="u.in_this_tenant" class="badge">in tenant</span>
            <button class="link" @click="reinvite(u.uid)">Re-send invite</button>
          </li>
          <li v-if="searched && !found.length" class="muted">No matching users.</li>
        </ul>
      </section>

      <!-- ============ ROLES ============ -->
      <section v-if="tab === 'Roles'" class="panel">
        <h2>Roles</h2>
        <div class="row">
          <input v-model="newRole" placeholder="new role name" @keyup.enter="createRole" />
          <button class="btn" :disabled="!newRole || busy" @click="createRole">Create role</button>
        </div>
        <ul class="list">
          <li v-for="r in roles" :key="r.name" :class="{ active: selectedRole === r.name }">
            <button class="grow rolename" @click="selectRole(r.name)">{{ r.name }} <span class="muted">· {{ r.member_count }} members</span></button>
            <button v-if="r.name !== 'administrators'" class="link danger" @click="deleteRole(r.name)">Delete</button>
          </li>
        </ul>

        <div v-if="selectedRole" class="members">
          <h3>Members of “{{ selectedRole }}”</h3>
          <div class="row">
            <input v-model="newMember" placeholder="user email / uid" @keyup.enter="addMember" />
            <button class="btn" :disabled="!newMember || busy" @click="addMember">Add</button>
          </div>
          <ul class="list">
            <li v-for="m in members" :key="m">
              <span class="grow">{{ m }}</span>
              <button class="link danger" @click="removeMember(m)">Remove</button>
            </li>
            <li v-if="!members.length" class="muted">No members yet.</li>
          </ul>
        </div>
      </section>

      <!-- ============ EMAIL TEMPLATES ============ -->
      <section v-if="tab === 'Email templates'" class="panel">
        <h2>Email templates</h2>
        <nav class="subtabs">
          <button v-for="t in templates" :key="t.kind" :class="{ active: tmplKind === t.kind }" @click="selectTemplate(t.kind)">
            {{ t.kind }}<span v-if="t.customized" class="dot" title="customized">•</span>
          </button>
        </nav>
        <template v-if="draft">
          <label>Subject<input v-model="draft.subject" /></label>
          <label>Body (HTML)<textarea v-model="draft.body" rows="10"></textarea></label>
          <p class="muted">Placeholders: <code>{{ placeholderHint }}</code> and, for invites, <code>{{ invitePlaceholderHint }}</code>.</p>
          <div class="row">
            <button class="btn" :disabled="busy" @click="saveTemplate">Save</button>
            <button class="btn ghost" :disabled="busy" @click="preview">Preview</button>
            <button class="btn ghost" :disabled="busy" @click="sendTest">Send test to me</button>
            <button class="link" :disabled="busy" @click="revertTemplate">Revert to default</button>
            <span v-if="tmplMsg" class="ok">{{ tmplMsg }}</span>
          </div>
          <div v-if="previewHtml" class="preview">
            <div class="preview-subj">{{ previewSubject }}</div>
            <!-- preview HTML is rendered by the service from sample data; isolate it -->
            <ShadowHtml :html="previewHtml" />
          </div>
        </template>
      </section>

      <!-- ============ AUDIT ============ -->
      <section v-if="tab === 'Audit'" class="panel">
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
                  <td class="tgt">{{ r.target_name || r.target_uid || '—' }}</td>
                  <td class="muted">{{ r.source_addr || r.source_iface || '—' }}</td>
                </tr>
                <tr v-if="selectedRow?.seq === r.seq" class="detail">
                  <td colspan="7">
                    <dl>
                      <div><dt>seq</dt><dd>{{ r.seq }}</dd></div>
                      <div><dt>target</dt><dd>{{ r.target_uid || '—' }} <span class="muted">{{ r.target_type }}</span></dd></div>
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

      <!-- ============ SECURITY ============ -->
      <section v-if="tab === 'Security'" class="panel">
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

        <div v-if="editing" class="editor">
          <div class="rules-head">
            <h3>{{ editing.id ? 'Edit rule' : 'New rule' }}</h3>
            <button class="link" @click="toggleRaw">{{ rawMode ? 'Guided form' : 'Raw DSL' }}</button>
          </div>
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
          <textarea v-else v-model="rawText" rows="14" spellcheck="false"></textarea>
          <div class="row">
            <button class="btn" :disabled="busy" @click="saveRule">Save</button>
            <button class="btn ghost" :disabled="busy" @click="validateEditing">Validate against history</button>
            <button class="link" @click="cancelEdit">Cancel</button>
            <span v-if="validateResult" class="ok">would fire {{ validateResult.would_fire }}× over {{ validateResult.events_examined }} recent events</span>
          </div>
        </div>
      </section>

      <!-- ============ EVENTS ============ -->
      <section v-if="tab === 'Events'" class="panel">
        <div class="audit-head">
          <h2>Live activity</h2>
          <span class="muted">tenant-wide · auto-refresh 5s</span>
          <button class="link" @click="toggleEventsPause">{{ eventsPaused ? 'Resume' : 'Pause' }}</button>
        </div>
        <div class="audit-table">
          <table>
            <thead><tr><th>time</th><th>category</th><th>action</th><th>outcome</th><th>actor</th><th>target</th></tr></thead>
            <tbody>
              <tr v-for="r in eventFeed" :key="r.seq" class="arow" :class="r.outcome">
                <td class="ts">{{ fmtTs(r.ts) }}</td>
                <td><span class="badge">{{ r.category }}</span></td>
                <td>{{ r.action }}</td>
                <td><span class="oc" :class="r.outcome">{{ r.outcome }}</span></td>
                <td class="actor">{{ r.actor }}</td>
                <td class="tgt">{{ r.target_name || r.target_uid || '—' }}</td>
              </tr>
              <tr v-if="!eventFeed.length"><td colspan="6" class="muted empty">Waiting for activity…</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppNav from '@/components/AppNav.vue'
import ShadowHtml from '@/components/ShadowHtml.vue'
import { ldapAdminService, type EmailTemplate, type Role, type UserSummary } from '@/services/ldapAdminService'
import { auditService, type AuditRow, type ChainResult } from '@/services/auditService'
import { securityService, type Incident, type SecurityRule } from '@/services/securityService'
import { onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'

const auth = useAuthStore()

const TABS = ['Users', 'Roles', 'Email templates', 'Audit', 'Security', 'Events'] as const
const tab = ref<(typeof TABS)[number]>('Users')
// Literal placeholder hints (kept in the script so the template compiler doesn't
// treat the {{ }} as interpolation).
const placeholderHint = '{{display_name}} {{email}} {{tenant}} {{roles}} {{inviter}}'
const invitePlaceholderHint = '{{invite_link}} {{expires}}'
const error = ref('')
const busy = ref(false)

// users
const roles = ref<Role[]>([])
const newUser = reactive({ email: '', display_name: '', roles: [] as string[] })
const invited = ref('')
const userQuery = ref('')
const found = ref<UserSummary[]>([])
const searched = ref(false)

// roles
const newRole = ref('')
const selectedRole = ref('')
const members = ref<string[]>([])
const newMember = ref('')

// templates
const templates = ref<EmailTemplate[]>([])
const tmplKind = ref('')
const draft = ref<{ subject: string; body: string } | null>(null)
const previewHtml = ref('')
const previewSubject = ref('')
const tmplMsg = ref('')

// audit
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

// security
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

// events (live poll of recent activity)
const eventFeed = ref<AuditRow[]>([])
const eventsPaused = ref(false)
let eventsTimer: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await loadRoles()
  await loadTemplates()
})

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

async function loadRoles() {
  roles.value = await ldapAdminService.listRoles()
}

// --- users ---
const invite = wrap(async () => {
  const u = await ldapAdminService.createUser(newUser.email, newUser.display_name, newUser.roles)
  invited.value = u.email
  newUser.email = ''
  newUser.display_name = ''
  newUser.roles = []
  await loadRoles()
})
const search = wrap(async () => {
  found.value = await ldapAdminService.findUsers(userQuery.value)
  searched.value = true
})
const reinvite = (uid: string) => wrap(async () => {
  await ldapAdminService.reinvite(uid)
  invited.value = uid
})()

// --- roles ---
const createRole = wrap(async () => {
  await ldapAdminService.createRole(newRole.value)
  newRole.value = ''
  await loadRoles()
})
const deleteRole = (name: string) => wrap(async () => {
  await ldapAdminService.deleteRole(name)
  if (selectedRole.value === name) selectedRole.value = ''
  await loadRoles()
})()
const selectRole = (name: string) => wrap(async () => {
  selectedRole.value = name
  members.value = await ldapAdminService.listMembers(name)
})()
const addMember = wrap(async () => {
  await ldapAdminService.addMember(selectedRole.value, newMember.value)
  newMember.value = ''
  members.value = await ldapAdminService.listMembers(selectedRole.value)
  await loadRoles()
})
const removeMember = (uid: string) => wrap(async () => {
  await ldapAdminService.removeMember(selectedRole.value, uid)
  members.value = await ldapAdminService.listMembers(selectedRole.value)
  await loadRoles()
})()

// --- templates ---
async function loadTemplates() {
  templates.value = await ldapAdminService.listTemplates()
  if (templates.value.length && !tmplKind.value) selectTemplate(templates.value[0].kind)
}
function selectTemplate(kind: string) {
  tmplKind.value = kind
  previewHtml.value = ''
  tmplMsg.value = ''
  const t = templates.value.find((x) => x.kind === kind)
  draft.value = t ? { subject: t.subject, body: t.body } : null
}
const saveTemplate = wrap(async () => {
  if (!draft.value) return
  await ldapAdminService.saveTemplate(tmplKind.value, draft.value.subject, draft.value.body)
  tmplMsg.value = 'Saved ✓'
  await loadTemplates()
})
const revertTemplate = wrap(async () => {
  await ldapAdminService.revertTemplate(tmplKind.value)
  tmplMsg.value = 'Reverted to default ✓'
  await loadTemplates()
  selectTemplate(tmplKind.value)
})
const preview = wrap(async () => {
  const r = await ldapAdminService.previewTemplate(tmplKind.value, draft.value ?? undefined)
  previewSubject.value = r.subject
  previewHtml.value = r.body
})
const sendTest = wrap(async () => {
  await ldapAdminService.testTemplate(tmplKind.value)
  tmplMsg.value = 'Test sent ✓'
})

// --- audit ---
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

// --- security ---
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
// Jump from an incident to its evidence in the Audit tab.
function auditForActor(actor: string | null) {
  if (!actor) return
  resetAudit()
  auditFilters.actor = actor
  tab.value = 'Audit'
  if (!auditLoaded.value) auditLoaded.value = true
  searchAudit()
}

// --- events (live poll) ---
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
onBeforeUnmount(stopEventsPoll)

// Lazy-load each tab's data the first time it is opened; poll only while on Events.
watch(tab, (t) => {
  if (t === 'Audit' && !auditLoaded.value) {
    auditLoaded.value = true
    loadAudit()
    verifyChain()
  }
  if (t === 'Security' && !securityLoaded.value) {
    securityLoaded.value = true
    loadSecurity()
  }
  if (t === 'Events') startEventsPoll()
  else stopEventsPoll()
})
</script>

<style scoped>
.content { max-width: 780px; margin: 0 auto; padding: 20px 18px; }
/* The log/table tabs (Audit, Security, Events) use a wide multi-column table,
   so they get the full viewport width; the form tabs stay narrow for reading. */
.content.wide { max-width: none; }
.tabs, .subtabs { display: flex; gap: 6px; margin: 12px 0; border-bottom: 1px solid var(--border); }
.tabs button, .subtabs button { border: none; background: none; padding: 8px 12px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; }
.tabs button.active, .subtabs button.active { color: var(--fg); border-bottom-color: var(--primary); }
.panel { display: flex; flex-direction: column; gap: 10px; }
h2 { font-size: 15px; margin: 12px 0 2px; }
h3 { font-size: 14px; margin: 8px 0 2px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
input, textarea { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; flex: 1; min-width: 160px; font-family: inherit; }
textarea { min-height: 160px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.roles-pick, .chk { display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; align-items: center; }
.list { list-style: none; padding: 0; margin: 4px 0; }
.list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-top: 1px solid var(--border); }
.list li.active { background: #dbeafe; }
.grow { flex: 1; text-align: left; }
.rolename { border: none; background: none; cursor: pointer; font: inherit; }
.muted { color: var(--muted); font-size: 12px; }
.badge { font-size: 10px; background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 999px; }
.dot { color: var(--primary); margin-left: 4px; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.btn.ghost { background: var(--card); color: var(--fg); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; }
.link.danger { color: #b00020; }
.ok { color: #15803d; font-size: 13px; align-self: center; }
.err { color: #b00020; font-size: 13px; }
.preview { border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-top: 8px; }
.preview-subj { font-weight: 600; margin-bottom: 6px; }

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
.actor, .tgt { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
/* --- security --- */
.rules-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.sev { font-size: 11px; padding: 0 6px; border-radius: 999px; text-transform: capitalize; }
.sev.info { color: var(--muted); background: var(--bg); }
.sev.warn { color: #92400e; background: #fffbeb; }
.sev.serious, .sev.critical { color: #b00020; background: #fef2f2; }
.editor { border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.editor textarea { font-family: ui-monospace, 'SFMono-Regular', monospace; font-size: 12px; }
</style>
