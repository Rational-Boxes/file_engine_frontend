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
  <Teleport to="body">
    <div v-if="open" class="rt-root" role="dialog" aria-modal="true" aria-label="Generate report">
      <div class="rt-backdrop" @click="emit('cancel')"></div>

      <div class="rt-panel" @keydown="onKeydown">
        <h2 class="rt-title">Generate report</h2>
        <p class="rt-sub">Choose where to save the report, then a file name.</p>

        <FolderBrowser show-create @navigate="onNavigate" />

        <label class="rt-field">
          File name
          <input
            ref="filenameEl"
            v-model="filename"
            class="rt-input"
            type="text"
            placeholder="report"
            @keydown.enter.prevent="confirm"
          />
        </label>
        <p class="rt-hint">Saves to <code>{{ dest.path }}</code> as <code>{{ effectiveName }}</code></p>

        <div class="rt-actions">
          <button ref="cancelEl" class="rt-btn" type="button" @click="emit('cancel')">Cancel</button>
          <button class="rt-btn rt-primary" type="button" :disabled="!canConfirm" @click="confirm">
            Generate report
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ROOT_UID } from '@/services/apiClient'
import FolderBrowser, { type FolderRef } from '@/components/FolderBrowser.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'select', target: { folderUid: string; folderPath: string; filename: string }): void
  (e: 'cancel'): void
}>()

// The destination folder, kept in sync with the shared browser's navigation.
const dest = ref<FolderRef>({ uid: ROOT_UID, path: '/' })
const filename = ref('')
const filenameEl = ref<HTMLInputElement | null>(null)
const cancelEl = ref<HTMLButtonElement | null>(null)

const effectiveName = computed(() => {
  // Reports are saved as editable Word (.docx) drafts (opened in ONLYOFFICE).
  const n = filename.value.trim()
  if (!n) return 'report.docx'
  if (/\.docx$/i.test(n)) return n
  return n.replace(/\.html?$/i, '') + '.docx'
})
const canConfirm = computed(() => !!filename.value.trim())

function onNavigate(folder: { uid: string; path: string }) {
  dest.value = { uid: folder.uid, path: folder.path }
}
function confirm() {
  if (!canConfirm.value) return
  emit('select', { folderUid: dest.value.uid, folderPath: dest.value.path, filename: filename.value.trim() })
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

// Reset the filename + focus it whenever the dialog opens (the browser resets itself).
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    filename.value = ''
    dest.value = { uid: ROOT_UID, path: '/' }
    await nextTick()
    filenameEl.value?.focus()
  },
)
</script>

<style scoped>
.rt-root { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
.rt-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.rt-panel {
  position: relative; width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
  overflow: auto; background: var(--card); color: var(--fg); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); padding: 20px;
}
.rt-title { margin: 0 0 2px; font-size: 1.1rem; }
.rt-sub { margin: 0 0 12px; color: var(--muted); font-size: 0.85rem; }
.rt-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin-top: 10px; }
.rt-input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg); color: var(--fg); }
.rt-hint { margin: 6px 0 0; color: var(--muted); font-size: 0.8rem; }
.rt-hint code { background: var(--bg); padding: 1px 5px; border-radius: 4px; }
.rt-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.rt-btn { padding: 7px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 0.9rem; }
.rt-btn:hover:not(:disabled) { border-color: var(--primary); }
.rt-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rt-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.rt-primary:hover:not(:disabled) { filter: brightness(1.08); }
</style>
