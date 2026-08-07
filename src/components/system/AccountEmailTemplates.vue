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
  <div class="acct-tmpl">
    <p v-if="!isAdmin" class="err">Administrator access is required to manage account email templates.</p>
    <template v-else>
      <p v-if="error" class="err">{{ error }}</p>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ShadowHtml from '@/components/ShadowHtml.vue'
import { ldapAdminService, type EmailTemplate } from '@/services/ldapAdminService'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'

const auth = useAuthStore()
const isAdmin = computed(() => auth.hasAccessLevel('admin'))

// Literal placeholder hints (kept in the script so the template compiler doesn't
// treat the {{ }} as interpolation).
const placeholderHint = '{{display_name}} {{email}} {{tenant}} {{roles}} {{inviter}}'
const invitePlaceholderHint = '{{invite_link}} {{expires}}'
const error = ref('')
const busy = ref(false)

const templates = ref<EmailTemplate[]>([])
const tmplKind = ref('')
const draft = ref<{ subject: string; body: string } | null>(null)
const previewHtml = ref('')
const previewSubject = ref('')
const tmplMsg = ref('')

onMounted(() => {
  if (isAdmin.value) loadTemplates()
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
.acct-tmpl { display: flex; flex-direction: column; gap: 10px; }
.subtabs { display: flex; gap: 6px; margin: 4px 0 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.subtabs button { border: none; background: none; padding: 8px 12px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; }
.subtabs button.active { color: var(--fg); border-bottom-color: var(--primary); }
h2 { font-size: 15px; margin: 12px 0 2px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
input, textarea { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; flex: 1; min-width: 160px; font-family: inherit; background: var(--card); color: var(--fg); }
textarea { min-height: 160px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.muted { color: var(--muted); font-size: 12px; }
.dot { color: var(--primary); margin-left: 4px; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.btn.ghost { background: var(--card); color: var(--fg); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; }
.ok { color: #15803d; font-size: 13px; align-self: center; }
.err { color: var(--danger); font-size: 13px; }
.preview { border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-top: 8px; }
.preview-subj { font-weight: 600; margin-bottom: 6px; }
code { background: var(--bg); padding: 0 4px; border-radius: 4px; font-size: 12px; }
</style>
