<template>
  <Teleport to="body">
    <div v-if="open" class="rt-root" role="dialog" aria-modal="true" aria-label="Generate report">
      <div class="rt-backdrop" @click="emit('cancel')"></div>

      <div ref="panelEl" class="rt-panel" @keydown="onKeydown">
        <h2 class="rt-title">Generate report</h2>
        <p class="rt-sub">Choose where to save the report, then a file name.</p>

        <!-- Breadcrumb: click a crumb to jump up -->
        <nav class="rt-crumbs" aria-label="Folder path">
          <template v-for="(c, i) in crumbs" :key="c.uid + i">
            <button
              class="rt-crumb"
              type="button"
              :disabled="i === crumbs.length - 1"
              @click="goToCrumb(i)"
            >{{ c.name }}</button>
            <span v-if="i < crumbs.length - 1" class="rt-sep">/</span>
          </template>
        </nav>

        <!-- Folder list -->
        <div class="rt-folders">
          <p v-if="loading" class="rt-muted">Loading…</p>
          <template v-else>
            <button
              v-for="f in folders"
              :key="f.uid"
              class="rt-folder"
              type="button"
              @click="openFolder(f)"
            >📁 {{ f.name }}</button>
            <p v-if="!folders.length" class="rt-muted">No sub-folders here.</p>
          </template>
        </div>

        <!-- New folder -->
        <div class="rt-newfolder">
          <template v-if="creatingFolder">
            <input
              ref="newFolderEl"
              v-model="newFolderName"
              class="rt-input"
              type="text"
              placeholder="New folder name"
              @keydown.enter.prevent="createFolder"
            />
            <button class="rt-btn" type="button" :disabled="busy || !newFolderName.trim()" @click="createFolder">Create</button>
            <button class="rt-btn" type="button" @click="creatingFolder = false">Cancel</button>
          </template>
          <button v-else class="rt-link" type="button" @click="startNewFolder">＋ New folder</button>
        </div>

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
        <p class="rt-hint">Saves to <code>{{ folderPath }}</code> as <code>{{ effectiveName }}</code></p>

        <p v-if="error" class="rt-err">{{ error }}</p>

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
import { fileService, type FileItem } from '@/services/fileService'
import { ROOT_UID } from '@/services/apiClient'
import { errorMessage } from '@/services/apiClient'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'select', target: { folderUid: string; folderPath: string; filename: string }): void
  (e: 'cancel'): void
}>()

interface Crumb { uid: string; name: string }

const crumbs = ref<Crumb[]>([{ uid: ROOT_UID, name: 'Home' }])
const folders = ref<FileItem[]>([])
const filename = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const creatingFolder = ref(false)
const newFolderName = ref('')

const panelEl = ref<HTMLElement | null>(null)
const cancelEl = ref<HTMLButtonElement | null>(null)
const filenameEl = ref<HTMLInputElement | null>(null)
const newFolderEl = ref<HTMLInputElement | null>(null)

const current = computed<Crumb>(() => crumbs.value[crumbs.value.length - 1])
// Display path for the pinned folder: "/" at root, else "/A/B" (crumbs after Home).
const folderPath = computed(() => '/' + crumbs.value.slice(1).map((c) => c.name).join('/'))
const effectiveName = computed(() => {
  const n = filename.value.trim()
  if (!n) return 'report.html'
  return /\.html?$/i.test(n) ? n : n + '.html'
})
const canConfirm = computed(() => !!filename.value.trim() && !loading.value && !busy.value)

async function load(uid: string) {
  loading.value = true
  error.value = ''
  try {
    const items = await fileService.listDirectory(uid)
    folders.value = items.filter((i) => i.isDirectory && !i.deleted).sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    error.value = errorMessage(e, 'Could not list this folder')
    folders.value = []
  } finally {
    loading.value = false
  }
}

function openFolder(f: FileItem) {
  crumbs.value.push({ uid: f.uid, name: f.name })
  creatingFolder.value = false
  load(f.uid)
}

function goToCrumb(i: number) {
  if (i === crumbs.value.length - 1) return
  crumbs.value = crumbs.value.slice(0, i + 1)
  creatingFolder.value = false
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
    // Enter the folder we just made — it becomes the destination.
    crumbs.value.push({ uid, name })
    await load(uid)
  } catch (e) {
    error.value = errorMessage(e, 'Could not create the folder')
  } finally {
    busy.value = false
  }
}

function confirm() {
  if (!canConfirm.value) return
  emit('select', {
    folderUid: current.value.uid,
    folderPath: folderPath.value,
    filename: filename.value.trim(),
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

// Reset + load root whenever the dialog opens.
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    crumbs.value = [{ uid: ROOT_UID, name: 'Home' }]
    filename.value = ''
    creatingFolder.value = false
    error.value = ''
    await load(ROOT_UID)
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
.rt-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; font-size: 0.85rem; margin-bottom: 8px; }
.rt-crumb { background: none; border: none; color: var(--primary); cursor: pointer; padding: 2px 4px; border-radius: 4px; }
.rt-crumb:disabled { color: var(--fg); cursor: default; font-weight: 600; }
.rt-sep { color: var(--muted); }
.rt-folders {
  border: 1px solid var(--border); border-radius: 8px; min-height: 120px; max-height: 220px;
  overflow: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px;
}
.rt-folder { text-align: left; background: none; border: none; color: var(--fg); cursor: pointer; padding: 6px 8px; border-radius: 6px; font-size: 0.9rem; }
.rt-folder:hover { background: var(--bg); }
.rt-muted { color: var(--muted); font-size: 0.85rem; padding: 6px 8px; }
.rt-newfolder { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
.rt-link { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 0.85rem; padding: 4px 2px; }
.rt-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin-top: 6px; }
.rt-input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg); color: var(--fg); }
.rt-hint { margin: 6px 0 0; color: var(--muted); font-size: 0.8rem; }
.rt-hint code { background: var(--bg); padding: 1px 5px; border-radius: 4px; }
.rt-err { color: var(--danger); font-size: 0.85rem; margin: 8px 0 0; }
.rt-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.rt-btn { padding: 7px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 0.9rem; }
.rt-btn:hover:not(:disabled) { border-color: var(--primary); }
.rt-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rt-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.rt-primary:hover:not(:disabled) { filter: brightness(1.08); }
</style>
