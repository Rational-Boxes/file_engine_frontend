<template>
  <div class="browser">
    <AppNav />

    <main class="browser-body">
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
        <button
          class="btn"
          :disabled="files.loading"
          title="Reload listing (picks up changes from WebDAV, sync, or other users)"
          @click="files.load()"
        >
          ↻ Reload
        </button>
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
          <tr>
            <th class="sortable" :aria-sort="ariaSort('name')" @click="sortBy('name')">
              Name <span class="caret">{{ caret('name') }}</span>
            </th>
            <th class="size sortable" :aria-sort="ariaSort('size')" @click="sortBy('size')">
              Size <span class="caret">{{ caret('size') }}</span>
            </th>
            <th class="row-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in displayItems" :key="item.uid" @dblclick="open(item)">
            <td class="name" @click="open(item)">
              <FileThumbnail :item="item" />{{ item.name }}
              <button
                v-if="item.hasRenditions"
                class="rendition-badge"
                :title="`${item.renditionCount} alternate format(s)`"
                @click.stop="files.openRenditions(item)"
              >⧉ {{ item.renditionCount }}</button>
            </td>
            <td class="size">{{ item.isDirectory ? '—' : formatSize(item.size) }}</td>
            <td class="row-actions">
              <KebabMenu :items="menuFor(item)" @select="(a) => onAction(a, item)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    </main>

    <FileDetailsDrawer />
    <UploadTray />

    <!-- Hidden renditions of a file, fetched on demand -->
    <div v-if="files.renditionsOpen" class="rend-overlay" @click.self="files.closeRenditions()">
      <div class="rend-panel">
        <header class="rend-head">
          <span class="rend-title">Renditions · {{ files.renditionsFor?.name }}</span>
          <button class="link" @click="files.closeRenditions()">Close</button>
        </header>
        <div v-if="files.renditionsLoading" class="empty">Loading…</div>
        <div v-else-if="!files.renditions.length" class="empty">No renditions.</div>
        <ul v-else class="rend-list">
          <li v-for="r in files.renditions" :key="r.uid">
            <span class="icon">📄</span><span class="rend-name">{{ r.name }}</span>
            <span class="size">{{ formatSize(r.size) }}</span>
            <button class="link" @click="files.downloadItem(r)">Download</button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Full-window drag-and-drop target overlay -->
    <div v-if="dragOver" class="drop-overlay">
      <div class="drop-card">
        <span class="up">⬆</span>
        <span>Drop files to upload here</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// Named so <KeepAlive include> can cache it (listing/scroll persist across tabs).
export default { name: 'FileBrowserView' }
</script>

<script setup lang="ts">
import { ref, computed, watch, onActivated, onDeactivated } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFileStore, type FileItem } from '@/stores/files'
import { useUploadStore } from '@/stores/upload'
import { canDo } from '@/utils/permissions'
import { formatSize } from '@/utils/format'
import KebabMenu, { type KebabItem } from '@/components/KebabMenu.vue'
import FileDetailsDrawer from '@/components/FileDetailsDrawer.vue'
import UploadTray from '@/components/UploadTray.vue'
import AppNav from '@/components/AppNav.vue'
import FileThumbnail from '@/components/FileThumbnail.vue'
import { sortFiles, type SortKey, type SortDir } from '@/utils/sortFiles'

const auth = useAuthStore()
const files = useFileStore()
const upload = useUploadStore()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const canModify = computed(() => auth.hasAccessLevel('editor'))

// Column sorting. Folders always sort before files (independent of direction),
// then the active column decides the order within each group.
const sortKey = ref<SortKey>('name')
const sortDir = ref<SortDir>('asc')

const displayItems = computed(() => sortFiles(files.items, sortKey.value, sortDir.value))

const sortBy = (key: SortKey) => {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

const caret = (key: SortKey) =>
  sortKey.value !== key ? '↕' : sortDir.value === 'asc' ? '▲' : '▼'
const ariaSort = (key: SortKey) =>
  sortKey.value !== key ? 'none' : sortDir.value === 'asc' ? 'ascending' : 'descending'

// Honor a `?file=<uid>&tenant=<t>` deep link: switch to the tenant, then reveal
// that node (folder + select + drawer); otherwise open the root. Re-applied
// whenever the deep-link target changes.
const route = useRoute()
// Set while applyRoute drives a tenant switch, so the tenant watch below doesn't
// ALSO reset to root and race with revealFile().
let deepLinkTenantSwitch = false
function applyRoute() {
  // The view is kept alive, so these watchers also fire when leaving /files —
  // only (re)load when we're actually on the Files route.
  if (route.name !== 'FileBrowser') return
  const tenant = route.query.tenant
  if (typeof tenant === 'string' && tenant && tenant !== auth.tenant) {
    deepLinkTenantSwitch = true
    auth.switchTenant(tenant) // updates X-Tenant for the reveal requests below
  }
  const file = route.query.file
  if (typeof file === 'string' && file) files.revealFile(file)
  else files.openRoot()
}
applyRoute()
watch(() => [route.query.file, route.query.tenant], applyRoute)

// Reload from the root whenever the active tenant changes: UIDs (including the
// breadcrumb trail) are tenant-scoped, so the current path is meaningless in the
// newly selected tenant. Skip the initial null->value hydration and only react
// to real switches — and not when a deep link is driving the switch (applyRoute
// handles that load itself).
watch(
  () => auth.tenant,
  (next, prev) => {
    if (deepLinkTenantSwitch) {
      deepLinkTenantSwitch = false
      return
    }
    if (prev && next && next !== prev) files.openRoot()
  },
)

// Build the per-row action menu from the user's access level.
const menuFor = (item: FileItem): KebabItem[] => {
  const m: KebabItem[] = []
  if (item.isDirectory) m.push({ action: 'open', label: 'Open' })
  else if (canDo('download', auth.accessLevel)) m.push({ action: 'download', label: 'Download' })
  if (!item.isDirectory && item.hasRenditions)
    m.push({ action: 'renditions', label: `Renditions (${item.renditionCount})` })
  if (canDo('rename', auth.accessLevel)) m.push({ action: 'rename', label: 'Rename' })
  if (canDo('delete', auth.accessLevel)) m.push({ action: 'delete', label: 'Delete', danger: true })
  m.push({ action: 'info', label: 'Info' })
  return m
}

const open = (item: FileItem) => {
  // Directories navigate; clicking a file opens its details (download stays on
  // the kebab menu) so a single click previews/inspects rather than downloads.
  if (item.isDirectory) files.openDirectory(item)
  else files.openDetails(item)
}

const onAction = (action: string, item: FileItem) => {
  switch (action) {
    case 'open': return files.openDirectory(item)
    case 'download': return files.downloadItem(item)
    case 'info': return files.openDetails(item)
    case 'renditions': return files.openRenditions(item)
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

// Window-level drag listeners are tied to activation (not mount): under
// <KeepAlive> this view stays alive in the background, and we must not handle
// drops while another tab (Search/Chat) is showing.
onActivated(() => {
  window.addEventListener('dragenter', onWinDragEnter)
  window.addEventListener('dragover', onWinDragOver)
  window.addEventListener('dragleave', onWinDragLeave)
  window.addEventListener('drop', onWinDrop)
})
onDeactivated(() => {
  dragOver.value = false
  dragDepth.value = 0
  window.removeEventListener('dragenter', onWinDragEnter)
  window.removeEventListener('dragover', onWinDragOver)
  window.removeEventListener('dragleave', onWinDragLeave)
  window.removeEventListener('drop', onWinDrop)
})
</script>

<style scoped>
.browser {
  /* full-width so AppNav's heading bar spans the page, like the other views */
}

.browser-body {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 20px 40px;
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

.files th.sortable {
  cursor: pointer;
  user-select: none;
}

.files th.sortable:hover {
  color: var(--fg);
}

.caret {
  font-size: 10px;
  color: var(--muted);
}

.files th.sortable[aria-sort='none'] .caret {
  opacity: 0.4;
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

/* renditions */
.rendition-badge {
  margin-left: 8px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--muted);
}
.rendition-badge:hover {
  color: var(--primary);
  border-color: var(--primary);
}

.rend-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rend-panel {
  width: min(520px, 92vw);
  max-height: 70vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  padding: 16px 18px;
}
.rend-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.rend-title {
  font-weight: 600;
}
.rend-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rend-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}
.rend-list li:last-child {
  border-bottom: none;
}
.rend-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
