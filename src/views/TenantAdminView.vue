<template>
  <div class="tadmin">
    <AppNav />
    <main class="content">
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import ShadowHtml from '@/components/ShadowHtml.vue'
import { ldapAdminService, type EmailTemplate, type Role, type UserSummary } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const TABS = ['Users', 'Roles', 'Email templates'] as const
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
</script>

<style scoped>
.content { max-width: 780px; margin: 0 auto; padding: 20px 18px; }
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
</style>
