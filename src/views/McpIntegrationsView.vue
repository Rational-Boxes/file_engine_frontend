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
  <div class="mcp">
    <AppNav />
    <main class="content">
      <header class="head">
        <h1>MCP integrations</h1>
        <button class="btn" :disabled="busy" @click="startCreate">Add integration</button>
      </header>
      <p class="intro">
        Register external <strong>MCP servers</strong> whose tools the AI chat may call.
        A tool runs with the <em>integration's</em> stored credentials on behalf of any
        chat user in this tenant — the tenant admin vouches for the server. Each call
        still requires the end user's explicit approval in chat.
      </p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="notice" class="ok">{{ notice }}</p>

      <!-- ------------------------------- list ------------------------------- -->
      <ul v-if="!editing" class="list">
        <li v-for="i in integrations" :key="i.id" class="item">
          <div class="main">
            <span class="name">{{ i.name }}</span>
            <span class="host">{{ hostOf(i.endpoint_url) }}</span>
            <span class="tag">{{ i.transport }}</span>
            <span class="tag" :class="{ off: !i.enabled }">{{ i.enabled ? 'enabled' : 'disabled' }}</span>
            <span v-if="i.forward_identity" class="tag warn" title="Forwards a minimal user identity to this server">
              forwards identity
            </span>
            <span
              v-if="i.allowed_roles && i.allowed_roles.length"
              class="tag"
              :title="`Only these roles may use it: ${i.allowed_roles.join(', ')}`"
            >
              🔒 {{ i.allowed_roles.join(', ') }}
            </span>
            <span v-if="i.allowed_tools" class="muted">· {{ i.allowed_tools.length }} tool(s) allowed</span>
          </div>
          <div class="actions">
            <label class="switch" :title="i.enabled ? 'Disable' : 'Enable'">
              <input type="checkbox" :checked="i.enabled" :disabled="busy" @change="toggle(i)" />
              <span>on</span>
            </label>
            <button class="link" @click="startEdit(i)">Edit</button>
            <button class="link" @click="testSaved(i)">Test</button>
            <button class="link danger" @click="remove(i)">Delete</button>
          </div>
        </li>
        <li v-if="!integrations.length && !busy" class="muted empty">
          No integrations yet. Add one to give the chat assistant external tools.
        </li>
      </ul>

      <!-- ------------------------------- form ------------------------------- -->
      <section v-else class="form">
        <h2>{{ form.id ? 'Edit integration' : 'Add integration' }}</h2>

        <label class="fld"><span>Name</span>
          <input v-model.trim="form.name" placeholder="e.g. Support tickets" />
        </label>
        <label class="fld"><span>Description</span>
          <input v-model.trim="form.description" placeholder="optional" />
        </label>
        <label class="fld"><span>Server URL (https)</span>
          <input v-model.trim="form.endpoint_url" placeholder="https://mcp.example.com/mcp" />
        </label>
        <label class="fld"><span>Transport</span>
          <select v-model="form.transport">
            <option value="streamable-http">Streamable HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </label>

        <label class="fld"><span>Authentication</span>
          <select v-model="form.auth_type">
            <option value="none">None</option>
            <option value="bearer">Bearer token</option>
            <option value="header">Custom header</option>
            <option value="oauth">OAuth 2.0 (client credentials)</option>
          </select>
        </label>
        <label v-if="form.auth_type === 'header'" class="fld"><span>Header name</span>
          <input v-model.trim="form.auth_header" placeholder="Authorization" />
        </label>
        <!-- OAuth client-credentials: token endpoint + client id + scope; the client
             secret is the "Secret" field below. -->
        <template v-if="form.auth_type === 'oauth'">
          <label class="fld"><span>Token URL (https)</span>
            <input v-model.trim="form.token_url" placeholder="https://auth.example.com/oauth/token" />
          </label>
          <label class="fld"><span>Client ID</span>
            <input v-model.trim="form.oauth_client_id" placeholder="client id" />
          </label>
          <label class="fld"><span>Scope <span class="muted">(optional)</span></span>
            <input v-model.trim="form.oauth_scope" placeholder="mcp.read mcp.write" />
          </label>
        </template>
        <label v-if="form.auth_type !== 'none'" class="fld">
          <span>{{ form.auth_type === 'oauth' ? 'Client secret' : 'Secret' }} {{ form.id ? '(leave blank to keep)' : '' }}</span>
          <input v-model="form.secret" type="password" autocomplete="new-password"
                 :placeholder="form.id && hasSecret ? '•••••••• (stored)' : 'token / key'" />
        </label>

        <fieldset class="roles">
          <legend>Restrict to roles</legend>
          <p class="role-note">
            <strong>No roles selected = all users can use this integration.</strong>
            Otherwise, only chat users holding one of the checked roles may invoke its tools.
          </p>
          <div v-if="roleOptions.length" class="roles-grid">
            <label v-for="r in roleOptions" :key="r" class="chk"><input
              type="checkbox" :value="r" v-model="selectedRoles" /> {{ r }}</label>
          </div>
          <p v-else class="muted">No roles found for this tenant.</p>
        </fieldset>

        <label
          class="chk"
          title="Separate from Authentication: OAuth/bearer credentials identify the integration (which app is calling), while this conveys the end-user (who it's acting for). Useful even with OAuth, so the server can authorize/attribute per-user."
        >
          <input type="checkbox" v-model="form.forward_identity" />
          Forward the signed-in user's identity to this server
        </label>
        <p v-if="form.forward_identity" class="warn-note">
          A minimal claim (user id + tenant) will be sent to this external server so it
          can authorize per-user. No roles, tokens, or file permissions are shared. This
          is separate from <strong>Authentication</strong> above: OAuth/bearer credentials
          identify the <em>integration</em>; this identifies the <em>end-user</em>.
        </p>

        <div class="test-row">
          <button class="btn ghost" :disabled="busy || !form.endpoint_url" @click="testForm">
            Test connection
          </button>
          <span v-if="testState === 'ok'" class="ok">Connected — {{ discovered.length }} tool(s)</span>
          <span v-if="testState === 'fail'" class="err">{{ testError }}</span>
        </div>

        <fieldset v-if="discovered.length" class="tools">
          <legend>Allowed tools <span class="muted">(none checked = allow all)</span></legend>
          <label v-for="t in discovered" :key="t.name" class="chk" :title="t.description">
            <input type="checkbox" :value="t.name" v-model="allowed" /> {{ t.name }}
          </label>
        </fieldset>

        <label class="chk">
          <input type="checkbox" v-model="form.enabled" /> Enabled (offer these tools in chat)
        </label>

        <div class="form-actions">
          <button class="btn" :disabled="busy || !canSave" @click="save">
            {{ form.id ? 'Save changes' : 'Create' }}
          </button>
          <button class="link" :disabled="busy" @click="cancel">Cancel</button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import {
  mcpAdminService,
  errorMessage,
  type McpIntegration,
  type McpIntegrationWrite,
  type McpToolInfo,
} from '@/services/mcpAdminService'
import { ldapAdminService } from '@/services/ldapAdminService'

const integrations = ref<McpIntegration[]>([])
const editing = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const hasSecret = ref(false)

const discovered = ref<McpToolInfo[]>([])
const allowed = ref<string[]>([])
const selectedRoles = ref<string[]>([]) // empty = all users allowed
const tenantRoles = ref<string[]>([]) // the tenant's roles (checkbox options)
const testState = ref<'' | 'ok' | 'fail'>('')
const testError = ref('')

// Checkbox options: the tenant's roles, plus any currently-restricted role that no
// longer exists as a tenant role (so an existing restriction is never silently lost).
const roleOptions = computed(() => {
  const set = new Set(tenantRoles.value)
  for (const r of selectedRoles.value) set.add(r)
  return [...set].sort((a, b) => a.localeCompare(b))
})

const form = reactive<McpIntegrationWrite & { id?: string }>(blank())

function blank(): McpIntegrationWrite & { id?: string } {
  return {
    name: '',
    description: '',
    endpoint_url: '',
    transport: 'streamable-http',
    auth_type: 'none',
    auth_header: '',
    secret: '',
    token_url: '',
    oauth_client_id: '',
    oauth_scope: '',
    forward_identity: false,
    enabled: false,
  }
}

const canSave = computed(() => !!form.name && !!form.endpoint_url)

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

async function load() {
  busy.value = true
  error.value = ''
  try {
    integrations.value = await mcpAdminService.list()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

function resetTest() {
  discovered.value = []
  allowed.value = []
  testState.value = ''
  testError.value = ''
}

function startCreate() {
  Object.assign(form, blank())
  hasSecret.value = false
  selectedRoles.value = []
  resetTest()
  editing.value = true
  notice.value = ''
}

function startEdit(i: McpIntegration) {
  Object.assign(form, {
    id: i.id,
    name: i.name,
    description: i.description,
    endpoint_url: i.endpoint_url,
    transport: i.transport,
    auth_type: i.auth_type,
    auth_header: i.auth_header,
    secret: '', // write-only; blank keeps the stored one
    token_url: i.token_url,
    oauth_client_id: i.oauth_client_id,
    oauth_scope: i.oauth_scope,
    forward_identity: i.forward_identity,
    enabled: i.enabled,
  })
  hasSecret.value = i.has_secret
  resetTest()
  allowed.value = i.allowed_tools ? [...i.allowed_tools] : []
  selectedRoles.value = i.allowed_roles ? [...i.allowed_roles] : []
  editing.value = true
  notice.value = ''
}

function cancel() {
  editing.value = false
  resetTest()
}

// Build the write payload from the form (omit an empty secret so it isn't cleared).
function payload(): McpIntegrationWrite {
  const p: McpIntegrationWrite = {
    name: form.name,
    description: form.description,
    endpoint_url: form.endpoint_url,
    transport: form.transport,
    auth_type: form.auth_type,
    auth_header: form.auth_header,
    forward_identity: form.forward_identity,
    enabled: form.enabled,
    allowed_tools: allowed.value.length ? allowed.value : null,
    allowed_roles: selectedRoles.value.length ? [...selectedRoles.value] : null,
  }
  if (form.auth_type === 'oauth') {
    p.token_url = form.token_url
    p.oauth_client_id = form.oauth_client_id
    p.oauth_scope = form.oauth_scope
  }
  if (form.secret) p.secret = form.secret
  return p
}

async function testForm() {
  busy.value = true
  resetTest()
  try {
    const r = await mcpAdminService.testConfig(payload())
    if (r.ok) {
      discovered.value = r.tools
      testState.value = 'ok'
    } else {
      testState.value = 'fail'
      testError.value = r.error || 'connection failed'
    }
  } catch (e) {
    testState.value = 'fail'
    testError.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function testSaved(i: McpIntegration) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const r = await mcpAdminService.test(i.id)
    notice.value = r.ok
      ? `${i.name}: connected — ${r.tools.length} tool(s).`
      : `${i.name}: connection failed — ${r.error}`
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function save() {
  busy.value = true
  error.value = ''
  try {
    if (form.id) await mcpAdminService.update(form.id, payload())
    else await mcpAdminService.create(payload())
    editing.value = false
    resetTest()
    notice.value = 'Saved.'
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function toggle(i: McpIntegration) {
  busy.value = true
  error.value = ''
  try {
    await mcpAdminService.update(i.id, { enabled: !i.enabled })
    await load()
  } catch (e) {
    error.value = errorMessage(e)
    await load()
  } finally {
    busy.value = false
  }
}

async function remove(i: McpIntegration) {
  if (!window.confirm(`Delete the “${i.name}” integration? Its tools will stop appearing in chat.`))
    return
  busy.value = true
  error.value = ''
  try {
    await mcpAdminService.remove(i.id)
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

// The tenant's roles populate the restriction checkboxes (best-effort — a failure
// just leaves the grid empty, and any existing restriction still shows via roleOptions).
async function loadRoles() {
  try {
    tenantRoles.value = (await ldapAdminService.listRoles()).map((r) => r.name)
  } catch {
    tenantRoles.value = []
  }
}

onMounted(() => {
  load()
  loadRoles()
})
</script>

<style scoped>
.content {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.head h1 {
  font-size: 1.3rem;
  margin: 0;
}
.intro {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}
.err {
  color: var(--danger);
}
.ok {
  color: var(--primary);
}
.muted {
  color: var(--muted);
}
.list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.item .main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.name {
  font-weight: 600;
}
.host {
  color: var(--muted);
  font-size: 0.85rem;
}
.tag {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  color: var(--muted);
}
.tag.off {
  opacity: 0.7;
}
.tag.warn {
  color: #9a6b00;
  border-color: #d9b45f;
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--muted);
}
.empty {
  padding: 20px;
  text-align: center;
}
.form {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 620px;
}
.form h2 {
  margin: 0;
  font-size: 1.05rem;
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
}
.fld span {
  color: var(--muted);
}
.fld input,
.fld select {
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
}
.chk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}
.warn-note {
  margin: 0;
  font-size: 0.8rem;
  color: #9a6b00;
  background: #fff8e6;
  border: 1px solid #f0dca0;
  border-radius: 6px;
  padding: 8px 10px;
}
.test-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tools {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tools legend {
  font-size: 0.8rem;
  color: var(--fg);
}
.roles {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.roles legend {
  font-size: 0.8rem;
  color: var(--fg);
}
.role-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.4;
}
.role-note strong {
  color: var(--fg);
}
.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 4px 12px;
}
.form-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
}
.btn {
  border: none;
  background: var(--primary);
  color: #fff;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn.ghost {
  background: transparent;
  color: var(--primary);
  border: 1px solid var(--primary);
}
.btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.link {
  border: none;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.85rem;
}
.link.danger {
  color: var(--danger);
}
@media (prefers-color-scheme: dark) {
  .warn-note {
    background: #2a2412;
    border-color: #5c4a1e;
    color: #e0c072;
  }
  .tag.warn {
    color: #e0c072;
    border-color: #5c4a1e;
  }
}
</style>
