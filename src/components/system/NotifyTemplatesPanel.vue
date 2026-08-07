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
  <div class="ntf">
    <p class="ntf-lede">
      Event-notification templates render the emails sent by folder <em>notify</em> actions
      when a watched event fires (uploads, sorts, and other folder activity).
    </p>

    <p v-if="!isAdmin" class="ntf-err">You need administrator access to manage event-notification templates.</p>
    <p v-else-if="error" class="ntf-err">{{ error }}</p>

    <div v-if="isAdmin" class="ntf-layout">
      <!-- ============ LEFT: list ============ -->
      <aside class="ntf-list-pane">
        <div class="ntf-list-head">
          <h2>Templates</h2>
          <button class="btn" :disabled="busy" @click="createTemplate">➕ New template</button>
        </div>

        <ul class="ntf-list">
          <li
            v-for="t in templates"
            :key="t.id"
            :class="{ active: selectedId === t.id }"
          >
            <button class="ntf-name" @click="selectTemplate(t.id)">
              {{ t.name || '(unnamed)' }}
              <span class="muted">{{ t.subject || '' }}</span>
            </button>
            <button class="link danger" title="Delete template" @click="deleteTemplate(t)">🗑</button>
          </li>
          <li v-if="loaded && !templates.length" class="muted empty">No templates yet.</li>
          <li v-else-if="!loaded" class="muted empty">Loading…</li>
        </ul>
      </aside>

      <!-- ============ RIGHT: editor ============ -->
      <section class="ntf-editor-pane">
        <p v-if="!selectedId" class="muted empty">Select a template on the left, or create one, to edit it.</p>

        <template v-else-if="draft">
          <div class="ntf-editor-head">
            <label class="grow">Name<input v-model="draft.name" placeholder="Template name" /></label>
            <button class="btn" :disabled="busy" @click="saveTemplate">💾 Save</button>
          </div>
          <p v-if="saveNotice" class="ntf-ok">{{ saveNotice }}</p>

          <label>Subject<input v-model="draft.subject" placeholder="Email subject" /></label>
          <label>Body (plain text)
            <textarea v-model="draft.body_text" rows="6" placeholder="Plain-text body…"></textarea>
          </label>
          <label>Body (HTML)
            <textarea v-model="draft.body_html" rows="8" placeholder="<p>HTML body…</p>"></textarea>
          </label>

          <p class="ntf-help muted">
            Placeholder tokens you can use in the subject and either body:
            <code>{actor}</code> <code>{event}</code> <code>{name}</code>
            <code>{file_uid}</code> <code>{version}</code> <code>{tenant}</code>
            <code>{folder_uid}</code> <code>{link}</code>
          </p>
        </template>

        <p v-else class="muted empty">Loading template…</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { folderActionsService } from '@/services/folderActionsService'
import { useAuthStore } from '@/stores/auth'
import { useFolderActionsStore } from '@/stores/folderActions'
import { errorMessage } from '@/services/apiClient'
import type { NotifyTemplateSummary, NotifyTemplate } from '@/types/folderActions'

const auth = useAuthStore()
const isAdmin = computed(() => auth.hasAccessLevel('admin'))
// Single source shared with the notify binding editor's template dropdown, so a
// create/delete here reflects there live (no reload).
const fa = useFolderActionsStore()

const error = ref('')
const busy = ref(false)
const loaded = ref(false)
const saveNotice = ref('')

const templates = computed(() => fa.notifyTemplates)
const selectedId = ref<string | null>(null)
// Working copy of the selected template — edits stay local until Save.
const draft = ref<NotifyTemplate | null>(null)

onMounted(() => {
  if (isAdmin.value) loadTemplates()
})

// Run an async unit of work with shared busy/error handling.
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
  loaded.value = false
  try {
    // Refresh the shared store — updates this list AND the binding editor dropdown.
    await fa.refreshNotifyTemplates()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load notification templates')
  } finally {
    loaded.value = true
  }
}

const selectTemplate = (id: string) => wrap(async () => {
  selectedId.value = id
  draft.value = null
  saveNotice.value = ''
  const full = await folderActionsService.getNotifyTemplate(id)
  draft.value = {
    id: full.id,
    name: full.name,
    subject: full.subject ?? '',
    body_text: full.body_text ?? '',
    body_html: full.body_html ?? '',
  }
})()

const createTemplate = wrap(async () => {
  const name = window.prompt('Name for the new notification template:')?.trim()
  if (!name) return
  const created = await folderActionsService.createNotifyTemplate({ name })
  await loadTemplates()
  await selectTemplate(created.id)
})

const deleteTemplate = (t: NotifyTemplateSummary) => wrap(async () => {
  if (!window.confirm(`Delete notification template “${t.name || t.id}”? This cannot be undone.`)) return
  await folderActionsService.deleteNotifyTemplate(t.id)
  if (selectedId.value === t.id) {
    selectedId.value = null
    draft.value = null
  }
  await loadTemplates()
})()

const saveTemplate = wrap(async () => {
  if (!draft.value || !selectedId.value) return
  saveNotice.value = ''
  const saved = await folderActionsService.updateNotifyTemplate(selectedId.value, {
    name: draft.value.name,
    subject: draft.value.subject,
    body_text: draft.value.body_text,
    body_html: draft.value.body_html,
  })
  await loadTemplates()
  selectedId.value = saved.id
  draft.value = {
    id: saved.id,
    name: saved.name,
    subject: saved.subject ?? '',
    body_text: saved.body_text ?? '',
    body_html: saved.body_html ?? '',
  }
  saveNotice.value = 'Saved ✓'
})
</script>

<style scoped>
.ntf { display: flex; flex-direction: column; }
.ntf-lede { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 720px; }
.ntf-err { color: var(--danger); font-size: 13px; }
.ntf-ok { color: var(--accent); font-size: 13px; margin: 4px 0; }

.ntf-layout { display: grid; grid-template-columns: 320px 1fr; gap: 18px; align-items: start; }

/* --- list pane --- */
.ntf-list-pane { display: flex; flex-direction: column; gap: 10px; }
.ntf-list-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ntf-list-head h2 { font-size: 15px; margin: 0; }
.ntf-list { list-style: none; padding: 0; margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.ntf-list li { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-top: 1px solid var(--border); }
.ntf-list li:first-child { border-top: none; }
.ntf-list li.active { background: var(--hover); }
.ntf-name { flex: 1; text-align: left; border: none; background: none; cursor: pointer; font: inherit; color: var(--fg); display: flex; flex-direction: column; gap: 1px; padding: 4px 2px; overflow: hidden; }
.ntf-name .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* --- editor pane --- */
.ntf-editor-pane { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ntf-editor-head { display: flex; align-items: flex-end; gap: 10px; }
.ntf-help { max-width: 760px; line-height: 1.8; }

/* --- shared bits --- */
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.grow { flex: 1; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
input, textarea {
  padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;
  font-family: inherit; background: var(--card); color: var(--fg); box-sizing: border-box;
}
textarea { width: 100%; resize: vertical; font-family: inherit; }
.muted { color: var(--muted); font-size: 12px; }
.empty { padding: 12px; text-align: center; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; padding: 2px 4px; }
.link.danger { color: var(--danger); }
code { background: var(--bg); padding: 1px 5px; border-radius: 4px; font-size: 12px; margin: 0 1px; }

@media (max-width: 820px) {
  .ntf-layout { grid-template-columns: 1fr; }
}
</style>
