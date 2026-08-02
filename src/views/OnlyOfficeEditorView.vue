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
  <!-- No main navigation here: the editor is a focused, full-height surface, so we
       hide AppNav to give ONLYOFFICE the whole viewport. The local "← Back" bar is
       the way out. -->
  <div class="oo-view">
    <main class="oo-main">
      <header class="oo-bar">
        <button class="link" @click="back">← Back</button>
        <span class="oo-title">{{ title }}</span>
        <span v-if="status" class="oo-status">{{ status }}</span>
        <HelpIcon topic="editing" label="Editing documents in your browser" />
      </header>
      <p v-if="error" class="oo-err">{{ error }}</p>
      <!-- ONLYOFFICE renders its editor into this element. -->
      <div v-show="!error" id="onlyoffice-editor" class="oo-editor"></div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HelpIcon from '@/components/HelpIcon.vue'
import { onlyofficeService, errorMessage } from '@/services/onlyofficeService'

const route = useRoute()
const router = useRouter()
const uid = String(route.params.uid || '')

const title = ref('')
const status = ref('')
const error = ref('')
// The ONLYOFFICE editor instance (from DocsAPI); destroyed on unmount.
let editor: { destroyEditor?: () => void } | null = null

// Load the Document Server's api.js once (it registers window.DocsAPI). Lazy —
// mirrors how the xeokit 3D SDK is loaded only when needed, keeping it out of the
// main bundle and off every other page.
function loadDocsApi(docserverUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { DocsAPI?: unknown }
    if (w.DocsAPI) return resolve()
    const src = `${docserverUrl.replace(/\/+$/, '')}/web-apps/apps/api/documents/api.js`
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('failed to load the editor')))
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('could not reach the Document Server'))
    document.head.appendChild(s)
  })
}

async function open() {
  status.value = 'Loading…'
  try {
    const { config, docserverUrl } = await onlyofficeService.getEditorConfig(uid)
    title.value = config.document?.title || uid
    await loadDocsApi(docserverUrl)
    const DocsAPI = (window as unknown as { DocsAPI: { DocEditor: new (id: string, cfg: object) => object } })
      .DocsAPI
    // Hook document-state events so the user sees save/modification feedback.
    const withEvents = {
      ...config,
      width: '100%',
      height: '100%',
      events: {
        onDocumentReady: () => (status.value = 'Ready'),
        onError: (e: unknown) => (error.value = `Editor error: ${describe(e)}`),
        // The Document Server persists via the callback; we just reflect state.
        onDocumentStateChange: (e: { data?: boolean }) =>
          (status.value = e?.data ? 'Editing…' : 'Saved'),
      },
    }
    editor = new DocsAPI.DocEditor('onlyoffice-editor', withEvents) as { destroyEditor?: () => void }
  } catch (e) {
    error.value = editingUnavailable(e)
    status.value = ''
  }
}

function editingUnavailable(e: unknown): string {
  const msg = errorMessage(e)
  if (/404/.test(msg)) return 'In-browser editing is not enabled on this deployment.'
  if (/403/.test(msg)) return 'You do not have permission to edit this document.'
  if (/415/.test(msg)) return 'This file type cannot be edited in the browser.'
  return msg
}

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'data' in e) return String((e as { data: unknown }).data)
  return String(e)
}

function back() {
  if (typeof window !== 'undefined' && window.history.length > 1) router.back()
  else router.push('/files')
}

onMounted(open)
onBeforeUnmount(() => {
  try {
    editor?.destroyEditor?.()
  } catch {
    /* editor may not have initialized */
  }
})
</script>

<style scoped>
.oo-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.oo-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.oo-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}
.oo-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oo-status {
  color: var(--muted);
  font-size: 0.8rem;
}
.oo-err {
  color: var(--danger);
  padding: 16px;
}
.oo-editor {
  flex: 1;
  min-height: 0;
}
.link {
  border: none;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.9rem;
}
</style>
