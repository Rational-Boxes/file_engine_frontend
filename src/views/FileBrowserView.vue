<template>
  <div class="browser">
    <header class="topbar">
      <div class="brand">FileEngine</div>
      <div class="user">
        <span v-if="auth.user" class="who">{{ auth.user }} · {{ auth.tenant }} · {{ auth.accessLevel }}</span>
        <button class="link" @click="logout">Sign out</button>
      </div>
    </header>

    <div class="toolbar">
      <nav class="breadcrumbs">
        <template v-for="(c, i) in files.breadcrumbs" :key="c.uid + i">
          <button class="crumb" :disabled="i === files.breadcrumbs.length - 1" @click="files.navigateToCrumb(i)">
            {{ c.name }}
          </button>
          <span v-if="i < files.breadcrumbs.length - 1" class="sep">/</span>
        </template>
      </nav>
      <div class="actions">
        <button v-if="canModify" class="btn" @click="newFolder">New folder</button>
        <button v-if="canModify" class="btn btn-primary" @click="fileInput?.click()">Upload</button>
        <input ref="fileInput" type="file" multiple hidden @change="onPick" />
      </div>
    </div>

    <p v-if="files.error" class="banner error">{{ files.error }}</p>

    <div class="list-area">
      <div v-if="files.loading" class="empty">Loading…</div>
      <div v-else-if="!files.items.length" class="empty">
        This folder is empty.<template v-if="canModify"> Drag files here to upload.</template>
      </div>

      <table v-else class="files">
        <thead>
          <tr><th>Name</th><th class="size">Size</th><th class="row-actions"></th></tr>
        </thead>
        <tbody>
          <tr v-for="item in files.items" :key="item.uid" @dblclick="open(item)">
            <td class="name" @click="open(item)">
              <span class="icon">{{ item.isDirectory ? '📁' : '📄' }}</span>{{ item.name }}
            </td>
            <td class="size">{{ item.isDirectory ? '—' : formatSize(item.size) }}</td>
            <td class="row-actions">
              <KebabMenu :items="menuFor(item)" @select="(a) => onAction(a, item)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <FileDetailsDrawer />
    <UploadTray />

    <!-- Full-window drag-and-drop target overlay -->
    <div v-if="dragOver" class="drop-overlay">
      <div class="drop-card">
        <span class="up">⬆</span>
        <span>Drop files to upload here</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFileStore, type FileItem } from '@/stores/files'
import { useUploadStore } from '@/stores/upload'
import { canDo } from '@/utils/permissions'
import { formatSize } from '@/utils/format'
import KebabMenu, { type KebabItem } from '@/components/KebabMenu.vue'
import FileDetailsDrawer from '@/components/FileDetailsDrawer.vue'
import UploadTray from '@/components/UploadTray.vue'

const router = useRouter()
const auth = useAuthStore()
const files = useFileStore()
const upload = useUploadStore()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const canModify = computed(() => auth.hasAccessLevel('editor'))

files.openRoot()

// Build the per-row action menu from the user's access level.
const menuFor = (item: FileItem): KebabItem[] => {
  const m: KebabItem[] = []
  if (item.isDirectory) m.push({ action: 'open', label: 'Open' })
  else if (canDo('download', auth.accessLevel)) m.push({ action: 'download', label: 'Download' })
  if (canDo('rename', auth.accessLevel)) m.push({ action: 'rename', label: 'Rename' })
  if (canDo('delete', auth.accessLevel)) m.push({ action: 'delete', label: 'Delete', danger: true })
  m.push({ action: 'info', label: 'Info' })
  return m
}

const open = (item: FileItem) => {
  if (item.isDirectory) files.openDirectory(item)
  else files.downloadItem(item)
}

const onAction = (action: string, item: FileItem) => {
  switch (action) {
    case 'open': return files.openDirectory(item)
    case 'download': return files.downloadItem(item)
    case 'info': return files.openDetails(item)
    case 'rename': return rename(item)
    case 'delete': return remove(item)
  }
}

const newFolder = async () => {
  const name = prompt('Folder name:')
  if (name) await files.createDirectory(name)
}

const rename = async (item: FileItem) => {
  const name = prompt('Rename to:', item.name)
  if (name) await files.renameItem(item, name)
}

const remove = async (item: FileItem) => {
  if (confirm(`Delete "${item.name}"?`)) await files.deleteItem(item)
}

const uploadFiles = (list: FileList | null) => {
  if (list && list.length) upload.uploadFiles(files.currentUid, Array.from(list))
}

const onPick = (e: Event) => {
  const input = e.target as HTMLInputElement
  uploadFiles(input.files)
  input.value = ''
}

// Full-window drag overlay. dragenter/leave fire per element, so count depth to
// avoid flicker as the cursor crosses children.
const dragDepth = ref(0)
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

const onWinDragEnter = (e: DragEvent) => {
  if (!canModify.value || !hasFiles(e)) return
  dragDepth.value++
  dragOver.value = true
}
const onWinDragOver = (e: DragEvent) => {
  if (!canModify.value || !hasFiles(e)) return
  e.preventDefault() // required to allow a drop
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}
const onWinDragLeave = () => {
  if (dragDepth.value > 0) dragDepth.value--
  if (dragDepth.value === 0) dragOver.value = false
}
const onWinDrop = (e: DragEvent) => {
  dragDepth.value = 0
  dragOver.value = false
  if (!canModify.value) return
  e.preventDefault()
  uploadFiles(e.dataTransfer?.files ?? null)
}

onMounted(() => {
  window.addEventListener('dragenter', onWinDragEnter)
  window.addEventListener('dragover', onWinDragOver)
  window.addEventListener('dragleave', onWinDragLeave)
  window.addEventListener('drop', onWinDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onWinDragEnter)
  window.removeEventListener('dragover', onWinDragOver)
  window.removeEventListener('dragleave', onWinDragLeave)
  window.removeEventListener('drop', onWinDrop)
})

const logout = async () => {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.browser {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 20px 40px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
}

.brand {
  font-weight: 600;
  font-size: 18px;
}

.user {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--muted);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0 16px;
  flex-wrap: wrap;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.crumb {
  border: none;
  background: none;
  color: var(--primary);
  padding: 2px 4px;
  border-radius: 4px;
}

.crumb:disabled {
  color: var(--fg);
  cursor: default;
}

.sep {
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-weight: 500;
}

.btn:hover {
  background: var(--bg);
}

.btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.link {
  border: none;
  background: none;
  color: var(--primary);
  padding: 2px 6px;
}

.banner.error {
  background: #fef2f2;
  color: var(--danger);
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0 0 12px;
}

.list-area {
  min-height: 120px;
}

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(37, 99, 235, 0.08);
  backdrop-filter: blur(1px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none; /* underlying window listeners handle the drop */
}

.drop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 56px;
  border: 3px dashed var(--primary);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  color: var(--primary);
  font-weight: 600;
  font-size: 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
}

.drop-card .up {
  font-size: 36px;
  line-height: 1;
}

.empty {
  text-align: center;
  color: var(--muted);
  padding: 48px 0;
}

.files {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.files th,
.files td {
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.files th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.files tbody tr:last-child td {
  border-bottom: none;
}

.files tbody tr:hover {
  background: var(--bg);
}

.name {
  cursor: pointer;
}

.icon {
  margin-right: 8px;
}

.size {
  width: 120px;
  color: var(--muted);
}

.row-actions {
  width: 60px;
  text-align: right;
}
</style>
