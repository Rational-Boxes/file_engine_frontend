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
  <div v-if="ttl" class="ttl-editor">
    <h3>WebDAV session lifetime</h3>
    <p class="muted">
      How long a WebDAV connection stays authorized after a Web-UI sign-in (this
      tenant's security stance). Shorter re-checks sign-in sooner; longer favors
      uninterrupted work. Applies only when the WebDAV session gate is enabled.
    </p>
    <p v-if="error" class="err">{{ error }}</p>

    <label class="row">
      <input type="checkbox" v-model="inherit" @change="onInherit" />
      Use the deployment default ({{ mins(ttl.default_ttl_seconds) }})
    </label>

    <label v-if="!inherit" class="field">
      Session lifetime (minutes)
      <input
        type="number"
        v-model.number="minutes"
        :min="Math.ceil(ttl.min_ttl_seconds / 60)"
        :max="Math.floor(ttl.max_ttl_seconds / 60)"
      />
      <span class="muted small">
        allowed {{ mins(ttl.min_ttl_seconds) }}–{{ mins(ttl.max_ttl_seconds) }}
      </span>
    </label>

    <div class="actions">
      <button class="btn" :disabled="busy" @click="save">Save</button>
      <span v-if="saved" class="ok">Saved · effective {{ mins(ttl.effective_ttl_seconds) }} ✓</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ldapAdminService, type WebdavSessionTtl } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const ttl = ref<WebdavSessionTtl | null>(null)
const inherit = ref(true)
const minutes = ref(720)
const busy = ref(false)
const saved = ref(false)
const error = ref('')

function mins(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`
}

function apply(t: WebdavSessionTtl) {
  ttl.value = t
  inherit.value = t.session_ttl_seconds === null
  minutes.value = Math.round((t.session_ttl_seconds ?? t.default_ttl_seconds) / 60)
}

async function load() {
  try {
    apply(await ldapAdminService.getWebdavSessionTtl())
  } catch (e) {
    error.value = errorMessage(e, 'Could not load session-TTL policy')
  }
}
onMounted(load)

function onInherit() {
  saved.value = false
}

async function save() {
  busy.value = true
  saved.value = false
  error.value = ''
  try {
    const value = inherit.value ? null : Math.max(1, Math.round(minutes.value)) * 60
    apply(await ldapAdminService.saveWebdavSessionTtl(value))
    saved.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Could not save session-TTL policy')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.ttl-editor { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
.row { display: inline-flex; gap: 0.4rem; align-items: center; }
.field { display: flex; flex-direction: column; gap: 0.2rem; max-width: 22rem; }
.field input { background: var(--bg); color: var(--text, inherit);
  border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; }
.actions { display: flex; gap: 0.75rem; align-items: center; }
.muted, .muted.small { color: var(--muted); }
.muted.small { font-size: 0.85rem; }
.btn { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--primary); color: #fff; font-size: 14px; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.err { color: var(--danger); }
.ok { color: #15803d; }
</style>
