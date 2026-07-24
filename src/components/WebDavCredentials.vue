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
  <section class="card">
    <div class="head">
      <h2>WebDAV &amp; MCP credentials <HelpIcon topic="webdav" label="Connect FileEngine to your computer" /></h2>
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
      <div v-if="showScript" class="actions">
        <button class="btn small" @click="download(generatedScript, scriptFilename)">
          Download {{ scriptFilename }}
        </button>
        <button class="btn small ghost" @click="copy(generatedScript)">Copy script</button>
      </div>
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
import HelpIcon from '@/components/HelpIcon.vue'
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

const scriptFilename = computed(() => {
  if (showScript.value === 'bash') return 'fileengine-webdav-mount.sh'
  if (showScript.value === 'ps') return 'fileengine-webdav-mount.ps1'
  return 'fileengine-mcp-setup.sh'
})

// Save the generated (non-secret) script to a file, client-side.
function download(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
    // Prompt for the secret via the first available graphical dialog (osascript /
    // zenity / kdialog / yad), else a hidden terminal prompt; feed it on stdin so
    // it never appears in argv / the process list.
    return `#!/usr/bin/env bash
# FileEngine WebDAV mount. Prompts for the secret via a graphical dialog when one
# is available (degrading to a hidden terminal prompt) and passes it on stdin —
# never as a command-line argument, so it can't leak via the process list.
URL="${base}"
USER="${key}"
MOUNT="$HOME/FileEngine"

ask_secret() {  # first available wins: osascript / zenity / kdialog / yad / read
  if [ "$(uname)" = Darwin ] && command -v osascript >/dev/null 2>&1; then
    osascript -e "display dialog \\"$1\\" default answer \\"\\" with hidden answer" -e 'text returned of result' 2>/dev/null
  elif command -v zenity  >/dev/null 2>&1; then zenity  --password --title="FileEngine" 2>/dev/null
  elif command -v kdialog >/dev/null 2>&1; then kdialog --password "$1" 2>/dev/null
  elif command -v yad     >/dev/null 2>&1; then yad --entry --hide-text --title="FileEngine" --text="$1" 2>/dev/null
  else local s; printf '%s ' "$1" >&2; read -rs s; printf '\\n' >&2; printf '%s' "$s"; fi
}

mkdir -p "$MOUNT"
SECRET="$(ask_secret "WebDAV secret for $USER:")"
[ -n "$SECRET" ] || { echo "No secret entered — aborting." >&2; exit 1; }

# printf is a shell builtin, so the secret is never in argv; the mount helper reads
# the username + secret from stdin.
if [ "$(uname)" = Darwin ]; then
  printf '%s\\n%s\\n' "$USER" "$SECRET" | mount_webdav -i "$URL" "$MOUNT" \\
    || echo "If that failed, run: open \\"$URL\\"  (Finder's Connect dialog)" >&2
else
  printf '%s\\n%s\\n' "$USER" "$SECRET" | sudo mount -t davfs "$URL" "$MOUNT"
fi
unset SECRET`
  }
  if (showScript.value === 'ps') {
    const unc = base.replace(/^https?:\/\//, '\\\\') + '@SSL\\DavWWWRoot'
    return [
      '# FileEngine WebDAV (PowerShell). Get-Credential shows a secure prompt (a GUI',
      '# dialog where available, else a hidden console prompt) and keeps the secret a',
      '# SecureString; New-PSDrive takes the credential object, so it never appears on',
      '# the command line. Needs the WebClient (WebDAV redirector) service.',
      'Start-Service WebClient -ErrorAction SilentlyContinue',
      `$Url  = "${unc}"`,
      `$Cred = Get-Credential -UserName "${key}" -Message "FileEngine WebDAV secret"`,
      'New-PSDrive -Name F -PSProvider FileSystem -Root $Url -Credential $Cred -Persist',
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
