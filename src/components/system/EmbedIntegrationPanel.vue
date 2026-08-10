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
  <div class="embi">
    <p v-if="!isAdmin" class="embi-err">Administrator access is required to view the embedding integration.</p>

    <template v-else>
      <header class="embi-head">
        <h2>Embedding integration</h2>
        <button class="link" :disabled="busy" @click="load">↻ Refresh</button>
      </header>
      <p class="embi-intro">
        Status of this deployment's <strong>commercial embedding integration</strong> — the external
        application allowed to mint delegated user sessions via the token-exchange endpoint. This is
        <em>read-only</em>: the integration's public key and settings are deployment configuration.
      </p>

      <p v-if="error" class="embi-err">{{ error }}</p>
      <p v-else-if="loaded && !integrations.length" class="embi-empty">
        No embedding integration is configured on this deployment.
      </p>
      <p v-else-if="!loaded" class="embi-empty">Loading…</p>

      <ul v-else class="embi-list">
        <li v-for="i in integrations" :key="i.issuer || 'unnamed'" class="embi-card">
          <div class="embi-card-head">
            <span class="embi-issuer">{{ i.issuer || '(no issuer set)' }}</span>
            <span class="embi-badge" :class="i.enabled ? 'on' : 'off'">
              {{ i.enabled ? 'enabled' : 'not enabled' }}
            </span>
          </div>
          <dl class="embi-grid">
            <dt>Audience</dt>
            <dd><code>{{ i.audience || '—' }}</code></dd>
            <dt>Public key</dt>
            <dd>
              <span :class="i.key_present ? 'ok' : 'warn'">
                {{ i.key_present ? 'imported ✓' : 'missing — exchange disabled' }}
              </span>
            </dd>
            <dt>IP allow-list</dt>
            <dd>
              <template v-if="i.ip_allowlist_enforced">
                <code v-for="ip in i.allowed_ips" :key="ip" class="embi-ip">{{ ip }}</code>
              </template>
              <span v-else class="muted">not enforced (any source IP)</span>
            </dd>
          </dl>
          <p v-if="!i.enabled" class="embi-note warn">
            Set both an issuer and a public key on the bridge (INTEGRATION_ISSUER +
            INTEGRATION_PUBLIC_KEY_FILE) to enable the exchange endpoint.
          </p>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { embedIntegrationService, type EmbedIntegrationStatus } from '@/services/embedIntegrationService'
import { errorMessage } from '@/services/apiClient'

const auth = useAuthStore()
const isAdmin = computed(() => auth.hasAccessLevel('admin'))

const integrations = ref<EmbedIntegrationStatus[]>([])
const error = ref('')
const busy = ref(false)
const loaded = ref(false)

async function load() {
  busy.value = true
  error.value = ''
  try {
    integrations.value = await embedIntegrationService.list()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load the embedding integration status')
  } finally {
    busy.value = false
    loaded.value = true
  }
}

onMounted(() => {
  if (isAdmin.value) load()
})
</script>

<style scoped>
.embi { display: flex; flex-direction: column; }
.embi-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.embi-head h2 { font-size: 15px; margin: 0; }
.embi-intro { color: var(--muted); font-size: 13px; margin: 6px 0 14px; max-width: 760px; }
.embi-err { color: var(--danger); font-size: 13px; }
.embi-empty { color: var(--muted); font-size: 13px; padding: 8px 0; }

.embi-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.embi-card { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.embi-card-head { display: flex; align-items: center; gap: 10px; }
.embi-issuer { font-weight: 600; font-size: 14px; }
.embi-badge { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
.embi-badge.on { background: var(--accent-bg, #16a34a22); color: var(--accent, #15803d); border-color: #15803d55; }
.embi-badge.off { background: var(--warn-bg, #f59e0b22); color: var(--warn, #b45309); border-color: #b4530955; }

.embi-grid { display: grid; grid-template-columns: 120px 1fr; gap: 6px 14px; margin: 12px 0 0; font-size: 13px; }
.embi-grid dt { color: var(--muted); }
.embi-grid dd { margin: 0; }
.embi-ip { margin-right: 6px; }
.ok { color: var(--accent, #15803d); }
.warn { color: var(--warn, #b45309); }
.muted { color: var(--muted); }
.embi-note { font-size: 12.5px; margin: 10px 0 0; }
code { background: var(--bg); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; }
.link:disabled { opacity: .5; cursor: not-allowed; }
</style>
