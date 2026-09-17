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
  <div class="text-editor">
    <header class="bar">
      <button class="btn" @click="goBack">← Back</button>
      <span class="name" :title="name">{{ name || 'Loading…' }}</span>
      <span v-if="dirty" class="dirty" title="Unsaved changes">●</span>
      <span class="spacer" />
      <span v-if="status" class="status" :class="{ bad: statusBad }">{{ status }}</span>
      <button class="btn btn-primary" :disabled="!canSave" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </header>

    <p v-if="loadError" class="notice bad">{{ loadError }}</p>

    <!-- Refusing to edit is the right answer for bytes that are not text: the
         textarea would show U+FFFD for everything it could not decode, and
         saving would write those replacements back over the original bytes. -->
    <p v-else-if="undecodable" class="notice bad">
      This file is not valid UTF-8 text, so it cannot be edited here without
      corrupting it. Download it instead.
    </p>

    <textarea
      v-else
      ref="area"
      v-model="content"
      class="area"
      spellcheck="false"
      :disabled="loading"
      :placeholder="loading ? '' : 'Empty file — start typing'"
      @keydown="onKeydown"
    />
  </div>
</template>

<script setup lang="ts">
// A plain-text editor for anything utils/textFile calls text.
//
// Deliberately a textarea and not a code editor. It exists so a .json, .md,
// .conf or .csv can be corrected in place instead of being downloaded, edited,
// and uploaded back — and the value in that is the round trip, not syntax
// highlighting. Bringing in an editor component would add a large dependency to
// the bundle for every user in order to improve a case this one handles.
//
// Saving is an ordinary content PUT, so it creates a NEW VERSION exactly like an
// upload: nothing is overwritten and the history stays intact.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { fileService } from '@/services/fileService'
import { errorMessage } from '@/services/apiClient'

const route = useRoute()
const router = useRouter()

const uid = computed(() => String(route.params.uid || ''))
const name = ref('')
const content = ref('')
const original = ref('')
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const status = ref('')
const statusBad = ref(false)
const area = ref<HTMLTextAreaElement | null>(null)

const dirty = computed(() => content.value !== original.value)
const canSave = computed(() => !loading.value && !saving.value && dirty.value && !undecodable.value)

// U+FFFD is what TextDecoder substitutes for bytes it cannot decode. Its
// presence in a file we are about to offer to SAVE means the round trip would
// not be lossless, so the editor declines rather than quietly rewriting them.
const undecodable = ref(false)

function note(msg: string, bad = false) {
  status.value = msg
  statusBad.value = bad
  if (!bad) window.setTimeout(() => { if (status.value === msg) status.value = '' }, 2500)
}

onMounted(async () => {
  if (!uid.value) {
    loadError.value = 'No file specified.'
    loading.value = false
    return
  }
  try {
    const info = await fileService.stat(uid.value)
    name.value = info.name || uid.value
  } catch {
    name.value = uid.value // a stat failure must not stop the content loading
  }
  try {
    const text = await fileService.readText(uid.value)
    undecodable.value = text.includes('�')
    content.value = text
    original.value = text
  } catch (e) {
    loadError.value = errorMessage(e, 'Could not open this file')
  } finally {
    loading.value = false
    if (!undecodable.value) area.value?.focus()
  }
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  const written = content.value
  try {
    await fileService.writeText(uid.value, written)
    // Compare against what was SENT, not against the box: a keystroke during the
    // request would otherwise be marked saved and then silently lost.
    original.value = written
    note('Saved as a new version')
  } catch (e) {
    note(errorMessage(e, 'Save failed'), true)
  } finally {
    saving.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void save()
  }
}

function goBack() {
  router.back()
}

// Leaving with unsaved edits loses them, so both exits ask: the in-app one for
// navigation, beforeunload for a tab close or reload.
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return window.confirm('You have unsaved changes. Leave without saving?')
})

const warnOnUnload = (e: BeforeUnloadEvent) => {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', warnOnUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnload))

watch(dirty, (d) => { if (d) status.value = '' })
</script>

<style scoped>
.text-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 12px 16px 16px;
  box-sizing: border-box;
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
}

.name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45vw;
}

.dirty {
  color: var(--primary);
  font-size: 12px;
}

.spacer { flex: 1; }

.status { color: var(--muted); font-size: 13px; }
.status.bad { color: #b91c1c; }

.notice {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
}
.notice.bad { color: #b91c1c; }

.area {
  flex: 1;
  width: 100%;
  resize: none;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--fg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  tab-size: 2;
  box-sizing: border-box;
}

.btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  font-weight: 500;
  cursor: pointer;
}

.btn:hover { background: var(--bg); }

.btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
