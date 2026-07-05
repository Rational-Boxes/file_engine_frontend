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
        <button
          v-if="files.canListDeleted"
          class="btn"
          :class="{ 'btn-active': files.showDeleted }"
          :disabled="files.loading"
          :title="files.showDeleted ? 'Hide deleted items' : 'Show deleted items'"
          @click="files.toggleShowDeleted()"
        >
          🗑 {{ files.showDeleted ? 'Hide deleted' : 'Show deleted' }}
        </button>
        <button
          v-if="files.clipboard && files.canWrite"
          class="btn"
          :disabled="!files.canPasteHere"
          :title="files.canPasteHere ? clipboardTitle : 'Can’t paste a folder into itself or a subfolder'"
          @click="files.paste()"
        >
          Paste{{ files.clipboard.items.length > 1 ? ` (${files.clipboard.items.length})` : '' }}
          <span class="clip-mode">{{ files.clipboard.mode === 'cut' ? '✂' : '⧉' }}</span>
        </button>
        <button
          v-if="files.clipboard"
          class="btn btn-ghost"
          title="Clear clipboard"
          @click="files.clearClipboard()"
        >✕</button>
        <button v-if="canModify" class="btn" @click="newFolder">New folder</button>
        <button v-if="canModify" class="btn btn-primary" @click="fileInput?.click()">Upload</button>
        <input ref="fileInput" type="file" multiple hidden @change="onPick" />
      </div>
    </div>

    <div v-if="files.selected.size" class="selbar">
      <span class="selcount">{{ files.selected.size }} selected</span>
      <button
        class="btn"
        :disabled="!canDo('copy', auth.accessLevel)"
        title="Copy selected"
        @click="batchCopy"
      >Copy</button>
      <button
        class="btn"
        :disabled="!files.canWrite"
        :title="files.canWrite ? 'Cut selected' : 'Requires write access to this folder'"
        @click="batchCut"
      >Cut</button>
      <button
        class="btn btn-danger"
        :disabled="!files.canWrite"
        :title="files.canWrite ? 'Delete selected' : 'Requires write access to this folder'"
        @click="batchDelete"
      >Delete</button>
      <button class="btn btn-ghost" title="Clear selection" @click="files.clearSelection()">Clear</button>
    </div>

    <p v-if="files.error" class="banner error">{{ files.error }}</p>

    <div class="list-area" ref="listEl">
      <div v-if="files.loading" class="empty">Loading…</div>
      <div v-else-if="!files.items.length" class="empty">
        This folder is empty.<template v-if="canModify"> Drag files here to upload.</template>
      </div>

      <table v-else class="files">
        <thead>
          <tr>
            <th class="cb-col">
              <input
                type="checkbox"
                title="Select all"
                :checked="files.allSelected"
                :indeterminate.prop="files.someSelected"
                @change="files.toggleSelectAll()"
              />
            </th>
            <th class="sortable" :aria-sort="ariaSort('name')" @click="sortBy('name')">
              Name <span class="caret">{{ caret('name') }}</span>
            </th>
            <th class="size sortable" :aria-sort="ariaSort('size')" @click="sortBy('size')">
              Size <span class="caret">{{ caret('size') }}</span>
            </th>
            <th class="datetime sortable" :aria-sort="ariaSort('created')" @click="sortBy('created')">
              Created <span class="caret">{{ caret('created') }}</span>
            </th>
            <th class="user sortable" :aria-sort="ariaSort('createdBy')" @click="sortBy('createdBy')">
              Created by <span class="caret">{{ caret('createdBy') }}</span>
            </th>
            <th class="datetime sortable" :aria-sort="ariaSort('modified')" @click="sortBy('modified')">
              Modified <span class="caret">{{ caret('modified') }}</span>
            </th>
            <th class="user sortable" :aria-sort="ariaSort('modifiedBy')" @click="sortBy('modifiedBy')">
              Modified by <span class="caret">{{ caret('modifiedBy') }}</span>
            </th>
            <th class="row-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in displayItems"
            :key="item.uid"
            :data-uid="item.uid"
            :class="{ sel: files.selected.has(item.uid), cut: isCut(item), deleted: item.deleted, active: files.drawerOpen && files.detailItem?.uid === item.uid }"
            @dblclick="open(item)"
          >
            <td class="cb-col" @click.stop>
              <input
                type="checkbox"
                :checked="files.selected.has(item.uid)"
                @change="files.toggleSelect(item.uid)"
              />
            </td>
            <td class="name" @click="open(item)">
              <FileThumbnail :item="item" />{{ item.name }}
              <span v-if="item.deleted" class="deleted-badge" title="Soft-deleted">deleted</span>
              <button
                v-if="item.hasRenditions"
                class="rendition-badge"
                :title="`${item.renditionCount} alternate format(s)`"
                @click.stop="files.openRenditions(item)"
              >⧉ {{ item.renditionCount }}</button>
              <router-link
                v-if="flagFor(item.uid)"
                class="attn-badge"
                :to="`/preview/${item.uid}`"
                :title="flagTitle(item.uid)"
                @click.stop
              >{{ flagText(item.uid) }}</router-link>
            </td>
            <td class="size">{{ item.isDirectory ? '—' : formatSize(item.size) }}</td>
            <td class="datetime">{{ formatDateTime(item.createdAt) }}</td>
            <td class="user">{{ item.createdBy }}</td>
            <td class="datetime">{{ formatDateTime(item.modifiedAt) }}</td>
            <td class="user">{{ item.modifiedBy }}</td>
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
import { ref, computed, watch, onActivated, onDeactivated, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFileStore, type FileItem } from '@/stores/files'
import { useUploadStore } from '@/stores/upload'
import { canDo } from '@/utils/permissions'
import { formatSize, formatDateTime } from '@/utils/format'
import KebabMenu, { type KebabItem } from '@/components/KebabMenu.vue'
import FileDetailsDrawer from '@/components/FileDetailsDrawer.vue'
import UploadTray from '@/components/UploadTray.vue'
import AppNav from '@/components/AppNav.vue'
import FileThumbnail from '@/components/FileThumbnail.vue'
import { sortFiles, type SortKey, type SortDir } from '@/utils/sortFiles'
import { useModel3dStore } from '@/stores/model3d'
import { useCommentsStore } from '@/stores/comments'
import { is3DModel } from '@/utils/modelFormat'
import { discussionService, type FlagCounts } from '@/services/discussionService'

const auth = useAuthStore()
const files = useFileStore()
const upload = useUploadStore()
const model3d = useModel3dStore()
const comments = useCommentsStore()

// A file is viewable in 3D when it's a known model format AND has been converted
// (its `model` XKT rendition lives among its hidden children).
const canView3D = (item: FileItem) =>
  !item.isDirectory && item.hasRenditions && is3DModel(item.name)

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

// Gate New folder / Upload on the actual WRITE permission on the current dir (the
// tiered ACL is authoritative), not the caller's global role — so a user with
// write here (e.g. their own home folder) can create/upload even as role "users".
const canModify = computed(() => files.canWrite)

// Column sorting. Folders always sort before files (independent of direction),
// then the active column decides the order within each group.
const sortKey = ref<SortKey>('name')
const sortDir = ref<SortDir>('asc')

const displayItems = computed(() => sortFiles(files.items, sortKey.value, sortDir.value))

// Attention flags (§10e): batch-fetch per-file @mention / pending-review counts for
// the current listing and badge the rows. Best-effort — if the discussion service is
// unreachable the file browser is unaffected.
const attentionFlags = ref<Record<string, FlagCounts>>({})
async function loadAttentionFlags() {
  const uids = files.items.filter((i) => !i.isDirectory && !i.deleted).map((i) => i.uid)
  if (!uids.length) {
    attentionFlags.value = {}
    return
  }
  try {
    attentionFlags.value = await discussionService.flags(uids)
  } catch {
    attentionFlags.value = {}
  }
}
function flagFor(uid: string): FlagCounts | undefined {
  return attentionFlags.value[uid]
}
function flagText(uid: string): string {
  const f = attentionFlags.value[uid]
  if (!f) return ''
  const parts: string[] = []
  if (f.mentions) parts.push(`@${f.mentions}`)
  if (f.reviews) parts.push(`⚑${f.reviews}`)
  return parts.join(' ')
}
function flagTitle(uid: string): string {
  const f = attentionFlags.value[uid]
  return f ? `${f.mentions} mention(s), ${f.reviews} pending review(s) for you` : ''
}
// Reload whenever the listing changes (navigation, refresh, show/hide deleted).
watch(
  () => files.items.map((i) => i.uid).join(','),
  () => loadAttentionFlags(),
  { immediate: true },
)

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
const listEl = ref<HTMLElement | null>(null)

// After a deep-link reveal, bring the opened file's row into view (it may be far
// down a long listing). Waits for the rows to render first.
async function scrollToRow(uid?: string) {
  if (!uid) return
  await nextTick()
  const row = listEl.value?.querySelector<HTMLElement>(`tr[data-uid="${uid}"]`)
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
// Set while applyRoute drives a tenant switch, so the tenant watch below doesn't
// ALSO reset to root and race with revealFile().
let deepLinkTenantSwitch = false
function tenantNoAccessMsg(t: string): string {
  return (
    `This link points to the “${t}” tenant, which you don’t have access to. ` +
    `Ask an administrator to grant access, then reopen the link.`
  )
}

async function applyRoute() {
  // The view is kept alive, so these watchers also fire when leaving /files —
  // only (re)load when we're actually on the Files route.
  if (route.name !== 'FileBrowser') return
  const tenant = typeof route.query.tenant === 'string' ? route.query.tenant : ''
  const file = route.query.file
  const prevTenant = auth.tenant
  const switching = !!tenant && tenant !== auth.tenant

  if (switching) {
    // Proactive: a tenant we already know (from the user's tenant list) is off
    // limits — clear message + their own workspace, no failed requests.
    if (auth.tenants.length && !auth.tenants.includes(tenant)) {
      await files.openRoot()
      files.error = tenantNoAccessMsg(tenant)
      return
    }
    deepLinkTenantSwitch = true
    auth.switchTenant(tenant) // updates X-Tenant for the reveal below
  }

  if (typeof file === 'string' && file) {
    const res = await files.revealFile(file)
    if (res.ok) scrollToRow(files.detailItem?.uid) // reveal the file's row in the list
    // Reactive: the reveal was forbidden just after a tenant switch (e.g. the
    // tenant list was stale/unavailable). Revert to a usable workspace + explain.
    if (!res.ok && switching && (res.status === 401 || res.status === 403)) {
      if (prevTenant && prevTenant !== auth.tenant) {
        deepLinkTenantSwitch = true
        auth.switchTenant(prevTenant)
        await files.openRoot()
      }
      files.error = tenantNoAccessMsg(tenant)
    }
  } else {
    await files.openRoot()
  }
}
applyRoute()
// Watch a stable key (not a fresh array) so this only fires when the deep-link
// params actually change — otherwise every route change (incl. returning to the
// kept-alive /files tab) would re-run applyRoute and reset the view.
watch(() => [route.query.file, route.query.tenant].join(' '), applyRoute)

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
  // A soft-deleted item only offers Undelete (when permitted); normal file
  // operations — and the info drawer — don't apply until it's restored.
  if (item.deleted) {
    return files.canUndelete ? [{ action: 'undelete', label: 'Undelete' }] : []
  }
  const m: KebabItem[] = []
  // Read ops (open/download/copy) apply to any visible item — the listing already
  // filtered to what the user can read. Write ops (rename/cut/delete) are gated on
  // WRITE on the current folder (files.canWrite, the tiered ACL), not the caller's
  // global role — so a user who can modify this folder (e.g. their home) gets them.
  if (item.isDirectory) m.push({ action: 'open', label: 'Open' })
  else if (canDo('download', auth.accessLevel)) m.push({ action: 'download', label: 'Download' })
  if (canView3D(item)) m.push({ action: 'view3d', label: 'View in 3D' })
  // Always reachable — the comment window doesn't need a preview/rendition.
  if (!item.isDirectory) m.push({ action: 'comments', label: '💬 Comments' })
  if (!item.isDirectory && item.hasRenditions)
    m.push({ action: 'renditions', label: `Renditions (${item.renditionCount})` })
  if (files.canWrite) m.push({ action: 'rename', label: 'Rename' })
  if (canDo('copy', auth.accessLevel)) m.push({ action: 'copy', label: 'Copy' })
  if (files.canWrite) m.push({ action: 'cut', label: 'Cut' })
  if (files.canWrite) m.push({ action: 'delete', label: 'Delete', danger: true })
  m.push({ action: 'info', label: 'Info' })
  return m
}

// Clipboard tooltip for the Paste button.
const clipboardTitle = computed(() => {
  const c = files.clipboard
  if (!c) return ''
  return `${c.mode === 'cut' ? 'Move' : 'Copy'} here: ${c.items.map((i) => i.name).join(', ')}`
})

const open = (item: FileItem) => {
  // A soft-deleted item can't be browsed/opened or inspected until restored.
  if (item.deleted) return
  // Directories navigate; clicking a file opens its details drawer (which carries
  // a "View model in 3D" link for 3D files; download stays on the kebab menu) so a
  // single click inspects rather than downloads.
  if (item.isDirectory) files.openDirectory(item)
  else files.openDetails(item)
}

const onAction = (action: string, item: FileItem) => {
  switch (action) {
    case 'open': return files.openDirectory(item)
    case 'download': return files.downloadItem(item)
    case 'info': return files.openDetails(item)
    case 'comments': return comments.open(item.uid, item.name)
    case 'view3d': return model3d.open(item.uid, item.name)
    case 'renditions': return files.openRenditions(item)
    case 'rename': return rename(item)
    case 'copy': return files.setClipboard('copy', [item])
    case 'cut': return files.setClipboard('cut', [item])
    case 'delete': return remove(item)
    case 'undelete': return undelete(item)
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

const undelete = async (item: FileItem) => {
  if (confirm(`Restore "${item.name}"?`)) await files.undeleteItem(item)
}

// Dim rows whose items are staged for a move (cut).
const isCut = (item: FileItem) =>
  files.clipboard?.mode === 'cut' && files.clipboard.items.some((i) => i.uid === item.uid)

// Batch operations over the checkbox selection.
const batchCopy = () => {
  files.setClipboard('copy', files.selectedItems)
  files.clearSelection()
}
const batchCut = () => {
  files.setClipboard('cut', files.selectedItems)
  files.clearSelection()
}
const batchDelete = async () => {
  const n = files.selected.size
  if (n && confirm(`Delete ${n} item${n > 1 ? 's' : ''}?`)) await files.deleteSelected()
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
  /* full-width file area (not clamped to a centered column) */
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
  background: var(--card);
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}

.btn-danger {
  border-color: #fecaca;
  color: var(--danger);
}

.btn-danger:hover {
  background: #fef2f2;
}

.clip-mode {
  margin-left: 4px;
  opacity: 0.7;
}

/* checkbox column */
.cb-col {
  width: 32px;
  text-align: center;
}

.files tr.sel {
  background: #dbeafe;
}
/* keep the selection tint on hover (generic tr:hover would otherwise wash it out) */
.files tr.sel:hover {
  background: #c7dcfa;
}
/* left accent bar so a selected row reads at a glance */
.files tr.sel td:first-child {
  box-shadow: inset 3px 0 0 var(--primary);
}

/* the row whose file is open in the details drawer — the current/active item */
.files tr.active,
.files tr.active:hover {
  background: #dbeafe;
}
.files tr.active td:first-child {
  box-shadow: inset 3px 0 0 var(--primary);
}
/* The selection tint is a fixed light blue — keep the row's ink dark in both themes
   so the file name stays legible (var(--fg) would be light in dark mode). */
.files tr.sel .name,
.files tr.active .name {
  color: #1f2933;
}

.files tr.cut {
  opacity: 0.55;
}

/* soft-deleted rows: muted, with a "deleted" badge in the name cell */
.files tr.deleted .name {
  color: var(--muted);
}

.deleted-badge {
  margin-left: 8px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
  border-radius: 10px;
  background: #fef2f2;
  color: var(--danger);
  border: 1px solid #fecaca;
  text-decoration: none;
  vertical-align: middle;
}

/* active state for the Show-deleted toggle */
.btn-active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

/* batch-operation bar */
.selbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #eff6ff;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.selcount {
  font-weight: 600;
  font-size: 13px;
  margin-right: 4px;
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
  overflow-x: auto; /* let the table expand horizontally; scroll rather than wrap */
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
  min-width: 100%;      /* fill the view when content is narrow… */
  width: max-content;   /* …but grow with long, no-wrap names (list-area scrolls) */
  border-collapse: collapse;
  background: var(--card);
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
  white-space: nowrap; /* never wrap item names; the view scrolls instead */
}

.icon {
  margin-right: 8px;
}

.size {
  width: 120px;
  color: var(--muted);
}

.datetime {
  width: 160px;
  color: var(--muted);
  white-space: nowrap;
}

.user {
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
/* Attention flag (§10e): @mention / pending-review count for the caller. */
.attn-badge {
  margin-left: 8px;
  padding: 0 7px;
  font-size: 11px;
  line-height: 18px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  text-decoration: none;
  white-space: nowrap;
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
  background: var(--card);
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
