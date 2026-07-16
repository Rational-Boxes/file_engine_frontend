<template>
  <section class="card">
    <div class="head">
      <h2>WebDAV &amp; MCP credentials</h2>
    </div>
    <p class="muted">
      Connect a WebDAV client (Finder, Explorer, davfs) or an MCP agent with a
      generated <strong>key&nbsp;:&nbsp;secret</strong> — not your account password. Each
      credential is scoped to the door(s) you pick, can be revoked on its own, and the
      secret is shown <strong>once</strong>. Lost it? Regenerate.
    </p>

    <p v-if="error" class="err">{{ error }}</p>

    <!-- The just-created / just-rotated secret, shown once -->
    <div v-if="freshSecret" class="secret-box">
      <div class="row">
        <strong>Copy your secret now — it won't be shown again.</strong>
        <button class="btn small" @click="freshSecret = null">Done</button>
      </div>
      <label>Key (username)<input :value="freshSecret.key_id" readonly @focus="selectAll" /></label>
      <label>Secret (password)<input :value="freshSecret.secret" readonly @focus="selectAll" /></label>
      <div class="actions">
        <button class="btn small" @click="copy(freshSecret.key_id + ':' + freshSecret.secret)">
          Copy key:secret
        </button>
        <button
          v-if="freshSecret.scopes?.includes('webdav')"
          class="btn small ghost"
          @click="showScript = showScript === 'bash' ? '' : 'bash'"
        >Mount script (Bash)</button>
        <button
          v-if="freshSecret.scopes?.includes('webdav')"
          class="btn small ghost"
          @click="showScript = showScript === 'ps' ? '' : 'ps'"
        >Mount script (PowerShell)</button>
        <button
          v-if="freshSecret.scopes?.includes('mcp')"
          class="btn small ghost"
          @click="showScript = showScript === 'mcp' ? '' : 'mcp'"
        >MCP config</button>
      </div>
      <label v-if="showScript" class="muted-label">
        Host (override — defaults to your deployment convention)
        <input v-model="hostOverride" :placeholder="showScript === 'mcp' ? mcpHost : driveHost" />
      </label>
      <pre v-if="showScript"><code>{{ generatedScript }}</code></pre>
      <p v-if="showScript" class="muted small">
        The secret is never written into the script — your OS prompts for it, or you paste
        it into the shown field.
      </p>
    </div>

    <!-- Create -->
    <div class="create-row">
      <input v-model="newLabel" placeholder="Label (e.g. MacBook Finder)" @keyup.enter="create" />
      <label class="chk"><input type="checkbox" value="webdav" v-model="newScopes" /> WebDAV</label>
      <label class="chk"><input type="checkbox" value="mcp" v-model="newScopes" /> MCP</label>
      <button class="btn" :disabled="busy || newScopes.length === 0" @click="create">Add credential</button>
    </div>

    <!-- List -->
    <table v-if="creds.length" class="creds">
      <thead>
        <tr><th>Label</th><th>Scopes</th><th>Created</th><th>Last used</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="c in creds" :key="c.key_id">
          <td>{{ c.label || '—' }}<div class="kid">{{ c.key_id }}</div></td>
          <td>{{ c.scopes.join(', ') }}</td>
          <td>{{ fmt(c.created_at) }}</td>
          <td>{{ c.last_used_at ? fmt(c.last_used_at) : 'never' }}</td>
          <td class="right">
            <button class="btn small ghost" :disabled="busy" @click="rotate(c.key_id)">Regenerate</button>
            <button class="btn small danger" :disabled="busy" @click="revoke(c.key_id)">Revoke</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="muted small">No credentials yet.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ldapAdminService,
  type ServiceCredentialMeta,
  type ServiceCredentialSecret,
} from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const creds = ref<ServiceCredentialMeta[]>([])
const newLabel = ref('')
const newScopes = ref<string[]>(['webdav'])
const freshSecret = ref<ServiceCredentialSecret | null>(null)
const error = ref('')
const busy = ref(false)
const showScript = ref<'' | 'bash' | 'ps' | 'mcp'>('')

// The SPA is served at <subdomain>.<domain>; WebDAV lives at
// <subdomain>-drive.<domain> and MCP at <subdomain>-mcp.<domain>. Derive both from
// the current origin; the field lets the user override for other topologies.
function deriveHost(insert: string): string {
  const loc = window.location
  const parts = loc.hostname.split('.')
  if (parts.length >= 2) {
    parts[0] = `${parts[0]}-${insert}`
    const host = parts.join('.') + (loc.port ? `:${loc.port}` : '')
    return `${loc.protocol}//${host}`
  }
  return loc.origin // no subdomain (e.g. localhost) — nothing to transform
}
const driveHost = deriveHost('drive')
const mcpHost = deriveHost('mcp')
const hostOverride = ref('') // empty = use the derived host for the shown script

async function load() {
  try {
    creds.value = await ldapAdminService.listServiceCredentials()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load credentials')
  }
}
onMounted(load)

async function create() {
  if (newScopes.value.length === 0) return
  busy.value = true
  error.value = ''
  try {
    freshSecret.value = await ldapAdminService.createServiceCredential(newLabel.value, newScopes.value)
    newLabel.value = ''
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not create credential')
  } finally {
    busy.value = false
  }
}

async function rotate(keyId: string) {
  busy.value = true
  error.value = ''
  try {
    freshSecret.value = await ldapAdminService.rotateServiceCredential(keyId)
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not regenerate credential')
  } finally {
    busy.value = false
  }
}

async function revoke(keyId: string) {
  if (!confirm('Revoke this credential? Any client using it will stop working.')) return
  busy.value = true
  error.value = ''
  try {
    await ldapAdminService.revokeServiceCredential(keyId)
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not revoke credential')
  } finally {
    busy.value = false
  }
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}
function selectAll(e: FocusEvent) {
  (e.target as HTMLInputElement).select()
}
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
}

// QOL script generators (§15.13 / §16.6). NON-SECRET only: the URL + key_id are
// embedded; the secret is collected by the OS prompt or pasted into the shown field.
const generatedScript = computed(() => {
  const s = freshSecret.value
  if (!s) return ''
  const key = s.key_id
  const isMcp = showScript.value === 'mcp'
  // WebDAV is served at the root of the -drive host; MCP at /mcp on the -mcp host.
  const base = (hostOverride.value || (isMcp ? mcpHost : driveHost)).replace(/\/$/, '')
  if (showScript.value === 'bash') {
    return [
      '#!/usr/bin/env bash',
      '# WebDAV mount — you will be prompted for the secret (never stored here).',
      `URL="${base}"`,
      `USER="${key}"`,
      'MOUNT="$HOME/FileEngine"',
      'mkdir -p "$MOUNT"',
      '# macOS: open Finder\'s Connect dialog (prompts for the password):',
      '#   open "$URL"',
      '# Linux (davfs, prompts interactively):',
      'sudo mount -t davfs "$URL" "$MOUNT" -o username="$USER"',
    ].join('\n')
  }
  if (showScript.value === 'ps') {
    const unc = base.replace(/^https?:\/\//, '\\\\') + '@SSL\\DavWWWRoot'
    return [
      '# WebDAV mount (PowerShell) — prompts for the secret at the console.',
      `$Url  = "${unc}"`,
      `$User = "${key}"`,
      'net use * $Url /user:$User',
    ].join('\n')
  }
  // MCP config snippet — secret left as a placeholder to paste locally.
  return [
    '# Add the FileEngine MCP server (paste your secret where shown):',
    'claude mcp add --transport http fileengine \\',
    `  ${base}/mcp \\`,
    `  --header "Authorization: Basic $(printf '%s:%s' '${key}' 'YOUR_SECRET_HERE' | base64)"`,
  ].join('\n')
})
</script>

<style scoped>
.card { border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px;
  display: flex; flex-direction: column; gap: 0.75rem; }
.head { display: flex; align-items: center; justify-content: space-between; }
.muted { color: var(--muted); }
.muted.small, .muted-label { color: var(--muted); font-size: 0.85rem; }

.create-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.create-row input:not([type='checkbox']) { flex: 1 1 12rem; }
.chk { display: inline-flex; gap: 0.3rem; align-items: center; white-space: nowrap; color: var(--muted); }

/* Inputs are theme-aware (dark mode had light input bg + light text before). */
input:not([type='checkbox']) {
  background: var(--bg); color: var(--text, inherit);
  border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font-size: 14px;
}

.secret-box {
  border: 1px solid var(--primary); border-radius: 8px; padding: 0.75rem;
  display: flex; flex-direction: column; gap: 0.5rem; background: var(--card);
}
.secret-box .row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.secret-box label, .muted-label { display: flex; flex-direction: column; font-size: 0.85rem; gap: 0.2rem; }
.secret-box input { font-family: monospace; }
.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

table.creds { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
table.creds th, table.creds td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); }
table.creds td.right { text-align: right; white-space: nowrap; }
.kid { font-family: monospace; font-size: 0.75rem; color: var(--muted); }
pre { overflow-x: auto; padding: 0.6rem; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); }

/* Buttons — same tokens as the rest of the app (were unset → light-on-light in dark mode). */
.btn { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--primary); color: #fff; font-size: 14px; cursor: pointer; }
.btn.small { padding: 4px 10px; font-size: 0.8rem; }
.btn.ghost { background: var(--card); color: var(--text, inherit); }
.btn.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.err { color: var(--danger); }
</style>
