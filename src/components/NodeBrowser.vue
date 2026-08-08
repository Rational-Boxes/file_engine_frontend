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

<!--
  Reusable node browser: a breadcrumb + tree listing over fileService.listDirectory.
  Modes:
    • single (default) — drilling into folders; emits `navigate` with the current
      folder, so a parent can use it as a destination (e.g. "save report here").
    • multiSelect — a checkbox per folder; `v-model` is the chosen folder set
      (each `{ uid, path }`), so a parent can use it as a scope (e.g. "search these").
    • pickFiles — files are also listed (alongside folders you can still drill into);
      clicking one emits `select-file` with `{ uid, name, path }`, so a parent can use
      it as a file picker (e.g. "test this document"). `selectedUid` highlights the
      current pick. Folder selection (multiSelect / navigate) is unaffected.
  Optional `showCreate` offers inline new-folder creation. Reset to root happens on
  mount, so callers that gate it behind `v-if` get a fresh browser each time.
-->
<template>
  <div class="fb">
    <nav class="fb-crumbs" aria-label="Folder path">
      <template v-for="(c, i) in crumbs" :key="c.uid + i">
        <button class="fb-crumb" type="button" :disabled="i === crumbs.length - 1" @click="goToCrumb(i)">
          {{ c.name }}
        </button>
        <span v-if="i < crumbs.length - 1" class="fb-sep">/</span>
      </template>
    </nav>

    <div class="fb-list">
      <p v-if="loading" class="fb-muted">Loading…</p>
      <template v-else>
        <template v-for="f in folders" :key="f.uid">
          <label v-if="multiSelect" class="fb-row" :class="{ 'fb-on': isSelected(f.uid) }">
            <input type="checkbox" :checked="isSelected(f.uid)" @change="toggle(f)" />
            <button class="fb-open" type="button" @click.prevent="openFolder(f)">📁 {{ f.name }}</button>
          </label>
          <button v-else class="fb-folder" type="button" @click="openFolder(f)">📁 {{ f.name }}</button>
        </template>
        <template v-if="pickFiles">
          <button
            v-for="f in files"
            :key="f.uid"
            class="fb-file"
            :class="{ 'fb-on': f.uid === selectedUid }"
            type="button"
            @click="pickFile(f)"
          >📄 {{ f.name }}</button>
        </template>
        <p v-if="!folders.length && !(pickFiles && files.length)" class="fb-muted">
          {{ pickFiles ? 'Nothing here.' : 'No sub-folders here.' }}
        </p>
      </template>
    </div>

    <div v-if="showCreate" class="fb-newfolder">
      <template v-if="creatingFolder">
        <input
          ref="newFolderEl"
          v-model="newFolderName"
          class="fb-input"
          type="text"
          placeholder="New folder name"
          @keydown.enter.prevent="createFolder"
        />
        <button class="fb-btn" type="button" :disabled="busy || !newFolderName.trim()" @click="createFolder">Create</button>
        <button class="fb-btn" type="button" @click="creatingFolder = false">Cancel</button>
      </template>
      <button v-else class="fb-link" type="button" @click="startNewFolder">＋ New folder</button>
    </div>

    <p v-if="error" class="fb-err">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { fileService, type FileItem } from '@/services/fileService'
import { ROOT_UID, errorMessage } from '@/services/apiClient'

export interface FolderRef {
  uid: string
  path: string
}

const props = withDefaults(
  defineProps<{
    multiSelect?: boolean
    modelValue?: FolderRef[] // selected folders (multiSelect mode); v-model
    showCreate?: boolean
    pickFiles?: boolean // also list files; clicking one emits `select-file`
    selectedUid?: string // highlight this file/folder as the current pick
  }>(),
  { multiSelect: false, modelValue: () => [], showCreate: false, pickFiles: false, selectedUid: '' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', folders: FolderRef[]): void
  (e: 'navigate', folder: { uid: string; name: string; path: string }): void
  (e: 'select-file', file: { uid: string; name: string; path: string }): void
}>()

interface Crumb {
  uid: string
  name: string
}

const crumbs = ref<Crumb[]>([{ uid: ROOT_UID, name: 'Home' }])
const folders = ref<FileItem[]>([])
const files = ref<FileItem[]>([]) // populated only in pickFiles mode
const loading = ref(false)
const error = ref('')
const busy = ref(false)
const creatingFolder = ref(false)
const newFolderName = ref('')
const newFolderEl = ref<HTMLInputElement | null>(null)

const current = computed<Crumb>(() => crumbs.value[crumbs.value.length - 1])
// "/" at root, else "/A/B" from the crumbs after Home.
const folderPath = computed(() => '/' + crumbs.value.slice(1).map((c) => c.name).join('/'))

function childPath(name: string): string {
  return (folderPath.value === '/' ? '' : folderPath.value) + '/' + name
}
function isSelected(uid: string): boolean {
  return (props.modelValue || []).some((f) => f.uid === uid)
}
function toggle(f: FileItem) {
  const cur = props.modelValue || []
  const next = isSelected(f.uid)
    ? cur.filter((x) => x.uid !== f.uid)
    : [...cur, { uid: f.uid, path: childPath(f.name) }]
  emit('update:modelValue', next)
}
function emitNav() {
  emit('navigate', { uid: current.value.uid, name: current.value.name, path: folderPath.value })
}

async function load(uid: string) {
  loading.value = true
  error.value = ''
  try {
    const items = await fileService.listDirectory(uid)
    folders.value = items
      .filter((i) => i.isDirectory && !i.deleted)
      .sort((a, b) => a.name.localeCompare(b.name))
    files.value = props.pickFiles
      ? items.filter((i) => !i.isDirectory && !i.deleted).sort((a, b) => a.name.localeCompare(b.name))
      : []
  } catch (e) {
    error.value = errorMessage(e, 'Could not list this folder')
    folders.value = []
    files.value = []
  } finally {
    loading.value = false
  }
}

function openFolder(f: FileItem) {
  crumbs.value.push({ uid: f.uid, name: f.name })
  creatingFolder.value = false
  emitNav()
  load(f.uid)
}
function pickFile(f: FileItem) {
  emit('select-file', { uid: f.uid, name: f.name, path: childPath(f.name) })
}
function goToCrumb(i: number) {
  if (i === crumbs.value.length - 1) return
  crumbs.value = crumbs.value.slice(0, i + 1)
  creatingFolder.value = false
  emitNav()
  load(current.value.uid)
}

async function startNewFolder() {
  creatingFolder.value = true
  newFolderName.value = ''
  await nextTick()
  newFolderEl.value?.focus()
}
async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const uid = await fileService.makeDirectory(current.value.uid, name)
    creatingFolder.value = false
    crumbs.value.push({ uid, name }) // enter the folder we just made
    emitNav()
    await load(uid)
  } catch (e) {
    error.value = errorMessage(e, 'Could not create the folder')
  } finally {
    busy.value = false
  }
}

function reset() {
  crumbs.value = [{ uid: ROOT_UID, name: 'Home' }]
  creatingFolder.value = false
  error.value = ''
  emitNav()
  load(ROOT_UID)
}

onMounted(reset)
defineExpose({ reset })
</script>

<style scoped>
.fb { display: flex; flex-direction: column; }
.fb-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; font-size: 0.85rem; margin-bottom: 8px; }
.fb-crumb { background: none; border: none; color: var(--primary); cursor: pointer; padding: 2px 4px; border-radius: 4px; }
.fb-crumb:disabled { color: var(--fg); cursor: default; font-weight: 600; }
.fb-sep { color: var(--muted); }
.fb-list {
  border: 1px solid var(--border); border-radius: 8px; min-height: 120px; max-height: 240px;
  overflow: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px;
}
.fb-muted { color: var(--muted); font-size: 0.85rem; padding: 6px 8px; }
.fb-folder { text-align: left; background: none; border: none; color: var(--fg); cursor: pointer; padding: 6px 8px; border-radius: 6px; font-size: 0.9rem; }
.fb-folder:hover { background: var(--bg); }
.fb-file { text-align: left; background: none; border: none; color: var(--fg); cursor: pointer; padding: 6px 8px; border-radius: 6px; font-size: 0.9rem; }
.fb-file:hover { background: var(--bg); }
.fb-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; cursor: pointer; }
.fb-row:hover { background: var(--bg); }
.fb-on { background: color-mix(in srgb, var(--primary) 12%, transparent); }
.fb-row input { cursor: pointer; }
.fb-open { flex: 1 1 auto; text-align: left; background: none; border: none; color: var(--fg); cursor: pointer; padding: 2px; font-size: 0.9rem; }
.fb-open:hover { color: var(--primary); }
.fb-newfolder { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
.fb-input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg); color: var(--fg); }
.fb-link { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 0.85rem; padding: 4px 2px; }
.fb-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 0.85rem; }
.fb-btn:hover:not(:disabled) { border-color: var(--primary); }
.fb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fb-err { color: var(--danger); font-size: 0.85rem; margin: 8px 0 0; }
</style>
