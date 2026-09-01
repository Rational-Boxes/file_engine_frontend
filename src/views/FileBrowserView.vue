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
        <HelpIcon topic="files" label="Uploading &amp; organizing files" />
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
        <!--
          The drawer for the folder you are IN. Without this a folder's own
          permissions, metadata and Actions are only reachable by going up to
          its parent and selecting it there.

          Disabled rather than hidden at root: root is not a real node and has
          nothing to show, and a control that vanishes as you navigate is harder
          to find again than one that greys out.
        -->
        <button
          class="btn"
          :disabled="atRoot"
          :title="atRoot ? 'Home has no folder properties' : 'Properties of the current folder'"
          @click="files.openCurrentFolderDetails()"
        >Folder Properties</button>
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
            @dblclick="onRowDoubleClick(item)"
          >
            <td class="cb-col" @click.stop>
              <input
                type="checkbox"
                :checked="files.selected.has(item.uid)"
                @change="files.toggleSelect(item.uid)"
              />
            </td>
            <td class="name" @click="onRowClick(item)">
              <FileThumbnail :item="item" /><span :title="item.name">{{ truncateMiddle(item.name, 60) }}</span>
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
              <!--
                Arrived from outside. Shows the VERIFIED address, never the
                sender-typed name, and reads from the redemption ledger rather
                than the file's share.* metadata — those keys are editable by
                anyone with WRITE and so are not evidence.
              -->
              <span
                v-if="dropFrom(item.uid)"
                class="drop-badge"
                :title="dropTitle(item.uid)"
              >⇩ {{ dropFrom(item.uid)!.email }}</span>
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

    <p v-if="eraseNotice" class="erase-notice" role="status">
      {{ eraseNotice }}
      <button class="link" @click="eraseNotice = ''">Dismiss</button>
    </p>

    <ConfirmModal
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-label="confirmState.confirmLabel"
      :danger="confirmState.danger"
      :require-text="confirmState.requireText"
      @confirm="onConfirm"
      @cancel="confirmState.open = false"
    />

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
import { ref, reactive, computed, watch, onActivated, onDeactivated, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ROOT_UID } from '@/services/apiClient'
import { fileBrowserLocation } from '@/utils/fileLocation'
import { useAuthStore } from '@/stores/auth'
import { useFileStore, type FileItem } from '@/stores/files'
import { useUploadStore } from '@/stores/upload'
import { canDo } from '@/utils/permissions'
import { formatSize, formatDateTime, truncateMiddle } from '@/utils/format'
import KebabMenu, { type KebabItem } from '@/components/KebabMenu.vue'
import FileDetailsDrawer from '@/components/FileDetailsDrawer.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import UploadTray from '@/components/UploadTray.vue'
import AppNav from '@/components/AppNav.vue'
import FileThumbnail from '@/components/FileThumbnail.vue'
import HelpIcon from '@/components/HelpIcon.vue'
import { sortFiles, type SortKey, type SortDir } from '@/utils/sortFiles'
import { useModel3dStore } from '@/stores/model3d'
import { useCommentsStore } from '@/stores/comments'
import { usePreviewStore } from '@/stores/preview'
import { useCapabilities } from '@/composables/useCapabilities'
import { previewVerdictFromRow, canPreviewWithRenditions, canView3DModel } from '@/utils/previewable'
import { loadRenditionSet, toRenditionSet } from '@/services/renditions'
import { shareService, type DropProvenance } from '@/services/shareService'
import { discussionService, type FlagCounts } from '@/services/discussionService'

const auth = useAuthStore()
const files = useFileStore()
const upload = useUploadStore()
const model3d = useModel3dStore()
const comments = useCommentsStore()
const preview = usePreviewStore()
const { features } = useCapabilities()

// A file is viewable in 3D when it's a known model format AND has been converted
// (its `model` XKT rendition lives among its hidden children).
const canView3D = (item: FileItem) => canView3DModel(item)

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

// Gate New folder / Upload on the actual WRITE permission on the current dir (the
// tiered ACL is authoritative), not the caller's global role — so a user with
// write here (e.g. their own home folder) can create/upload even as role "users".
const canModify = computed(() => files.canWrite)
// Home is not a real node — it has no properties, no owner and no ACL of its
// own — so the folder-properties button is disabled there rather than opening
// an empty drawer.
const atRoot = computed(() => files.currentUid === ROOT_UID)

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
// Drop provenance: which rows came from outside. Fetched with the same
// per-page batch shape as the attention flags above, and equally best-effort —
// if share_service is off or unreachable the browser is unaffected and the
// markers simply do not appear.
const dropProvenance = ref<Record<string, DropProvenance>>({})
async function loadDropProvenance() {
  // No sharing service means nothing ever arrived by a link, so the badge
  // has nothing to show and this would be a failed request per listing.
  if (!features.sharing) return
  const uids = files.items.filter((i) => !i.isDirectory && !i.deleted).map((i) => i.uid)
  if (!uids.length) {
    dropProvenance.value = {}
    return
  }
  try {
    dropProvenance.value = await shareService.provenance(uids)
  } catch {
    dropProvenance.value = {}
  }
}
function dropFrom(uid: string): DropProvenance | undefined {
  return dropProvenance.value[uid]
}
function dropTitle(uid: string): string {
  const p = dropProvenance.value[uid]
  if (!p) return ''
  const when = formatDateTime(Date.parse(p.at) / 1000)
  return `Sent from outside by ${p.email} on ${when}, `
    + `via a link shared by ${p.shared_by}`
    + (p.stored_name ? `. Arrived as "${p.stored_name}"` : '')
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
  () => { loadAttentionFlags(); loadDropProvenance() },
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
const router = useRouter()
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

// True while applyRoute() is driving a reveal, so syncUrl() below stands down and
// doesn't overwrite an incoming file-specific deep link with its folder's UID.
let applyingRoute = false

async function applyRoute(opts?: { initial?: boolean }) {
  // The view is kept alive, so these watchers also fire when leaving /files —
  // only (re)load when we're actually on the Files route.
  if (route.name !== 'FileBrowser') return
  const tenant = typeof route.query.tenant === 'string' ? route.query.tenant : ''
  const file = typeof route.query.file === 'string' ? route.query.file : ''
  const folder = typeof route.query.folder === 'string' ? route.query.folder : ''
  const target = folder || file // a folder opens; a file opens-parent-and-selects
  const prevTenant = auth.tenant
  const switching = !!tenant && tenant !== auth.tenant

  // Re-entry from our own URL sync: navigation already moved us here, so the URL
  // merely mirrors the current location — skip the redundant reveal (breaks the
  // write->read->write loop). The initial call always proceeds so the first
  // listing loads even at the root.
  if (!opts?.initial && !switching) {
    const atTarget = target ? target === files.currentUid : files.currentUid === ROOT_UID
    if (atTarget) return
  }

  applyingRoute = true
  try {
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

  if (target) {
    const res = await files.revealFile(target)
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
  } else if (!opts?.initial && files.currentUid !== ROOT_UID) {
    // Returning to the kept-alive view with a bare /files URL (e.g. the top-nav
    // "Files" link): restore the folder we're in — put the query params back —
    // rather than resetting to root.
    await router
      .replace(fileBrowserLocation(files.currentUid, auth.tenant, 'folder'))
      .catch(() => {})
  } else {
    await files.openRoot()
  }
  } finally {
    applyingRoute = false
  }
}
applyRoute({ initial: true })
// Watch a stable key (not a fresh array) so this only fires when the deep-link
// params actually change — otherwise every route change (incl. returning to the
// kept-alive /files tab) would re-run applyRoute and reset the view.
watch(() => [route.query.folder, route.query.file, route.query.tenant].join(' '), () => applyRoute())

// WRITE side of the sync: mirror the current folder + tenant into the URL (reusing
// the Copy-link deep-link shape) so reload and bookmarks restore where you were.
// Skipped while a reveal runs, and a no-op when already in sync — so it never
// fights applyRoute or spams history. replace (not push): folder nav stays out of
// the back-stack; reload/bookmarks still work.
async function syncUrl() {
  if (route.name !== 'FileBrowser' || applyingRoute) return
  // The browser location is always a directory, so it maps to the `folder` key.
  const targetFolder = files.currentUid === ROOT_UID ? '' : files.currentUid
  const targetTenant = auth.tenant || ''
  const curFolder = typeof route.query.folder === 'string' ? route.query.folder : ''
  const curTenant = typeof route.query.tenant === 'string' ? route.query.tenant : ''
  if (targetFolder === curFolder && targetTenant === curTenant) return
  await router
    .replace(fileBrowserLocation(targetFolder || undefined, targetTenant || undefined, 'folder'))
    .catch(() => {})
}
watch(() => [files.currentUid, auth.tenant].join('|'), syncUrl)

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
    // Deletion is two steps, and this is the second. Erase is offered ONLY on an
    // already-soft-deleted item: reaching an irreversible destruction should
    // require having first taken the reversible one and then come back to it,
    // rather than sitting one menu click away from a live file.
    const m: KebabItem[] = []
    if (files.canUndelete) m.push({ action: 'undelete', label: 'Undelete' })
    if (files.canErase) m.push({ action: 'erase', label: '⚠ Erase permanently' })
    return m
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

// Double click opens the preview; where there is nothing to preview it opens the
// comment window instead, so the gesture always lands somewhere useful rather
// than on an empty frame. Directories keep navigating, which is what a double
// click on a folder has always done.
//
// Which preview a file gets depends on WHICH rendition it has — a `pdf`, the
// XKT `model`, a playable `preview` clip — and the listing row carries only a
// count, not the names. So the set is fetched, but only when the row cannot
// settle it: a .pdf or an inline image previews on its own, and a file with no
// renditions at all has nothing to look up. That leaves one request, on a
// gesture, for the cases that genuinely need it — rather than one per row on
// every listing.
// Files only — onRowDoubleClick handles directories before calling this, so the
// folder case lives in one place rather than being duplicated here.
const openPreview = async (item: FileItem) => {
  if (item.deleted || item.isDirectory) return

  // Opens the preview OVERLAY, not the /preview route.
  //
  // Routing there works but leaves the browser one navigation deeper, so closing
  // the preview drops the user on a page they have to press Back on to get
  // their listing again — for a gesture whose whole job is a quick look. The
  // overlays are mounted in App.vue and close straight back onto the row that
  // opened them, which is also how search hits and chat citations already open.
  //
  // 3D models go to their own viewer: DocumentPreview has nothing to render for
  // geometry, and PreviewView routed them to model3d for the same reason.
  const toPreview = () =>
    canView3D(item) ? model3d.open(item.uid, item.name) : preview.open(item.uid, item.name)
  const verdict = previewVerdictFromRow(item)
  if (verdict === 'yes') return toPreview()
  if (verdict === 'no') return comments.open(item.uid, item.name)

  // The listing asked for side-car children, so the answer is usually already
  // here and the gesture costs nothing. `undefined` means the bridge did not
  // send them — it bounds that work per listing — which is NOT the same as
  // "has none", so that case falls through to enquiring rather than deciding.
  if (item.children) {
    if (canPreviewWithRenditions(item.name, toRenditionSet(item.children))) return toPreview()
    return comments.open(item.uid, item.name)
  }

  try {
    const set = await loadRenditionSet(item.uid)
    if (canPreviewWithRenditions(item.name, set)) return toPreview()
    return comments.open(item.uid, item.name)
  } catch {
    // The lookup is an optimisation, not a gate. If it fails, send the user to
    // the preview: that page loads the same renditions itself and has its own
    // error and "generate preview" handling, whereas the comment window would
    // silently deny a preview that may well exist.
    return toPreview()
  }
}

// Single click opens the drawer. Double click opens the drawer AND the preview
// overlay — the two are complementary, not alternatives: the drawer carries the
// file's detail while the overlay shows the document itself.
//
// That is why there is no click/double-click disambiguation here, and why there
// should not be. An earlier version delayed the single click by 250ms so a
// double click could cancel it and avoid "also" opening the drawer. With both
// wanted, the browser's own sequence — click, click, dblclick — already produces
// exactly the right result, and the delay bought nothing while making every
// single click feel slow.
const onRowClick = (item: FileItem) => open(item)

const onRowDoubleClick = (item: FileItem) => {
  // A folder navigates, and only once. open() and openPreview() BOTH used to
  // handle directories, so doing them in sequence entered the folder twice.
  if (item.isDirectory) return open(item)

  // Opens the drawer explicitly rather than relying on the click that preceded
  // it: the click handler sits on the NAME cell, so a double click anywhere else
  // on the row never fires it. openDetails on the row that is already open is a
  // no-op, so the name cell is not a special case.
  open(item)
  void openPreview(item)
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
    case 'erase': return erasePermanently(item)
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

// Destructive/confirmable actions use one in-app modal (never window.confirm).
// Each opener fills in the copy + the action to run on confirm.
// What to tell the user after an erasure starts. Held here rather than being a
// toast that vanishes: "3 services still to confirm" is a statement about an
// obligation in progress, and it should stay readable until dismissed.
const eraseNotice = ref('')

const confirmState = reactive<{
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  requireText: string
  action: (() => Promise<void>) | null
}>({
  open: false,
  title: '',
  message: '',
  requireText: '',
  confirmLabel: 'Confirm',
  danger: false,
  action: null,
})

function askConfirm(cfg: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  requireText?: string
  action: () => Promise<void>
}) {
  // requireText reset explicitly: it is absent from most callers' config, so
  // without this a previous typed-confirmation dialog would leave its value
  // behind and the NEXT ordinary confirm would refuse to enable.
  Object.assign(confirmState, { danger: false, requireText: '', ...cfg, open: true })
}

async function onConfirm() {
  const action = confirmState.action
  confirmState.open = false
  confirmState.action = null
  if (action) await action()
}

const remove = (item: FileItem) =>
  askConfirm({
    // Deleting a folder soft-deletes it and hides its contents (recoverable);
    // no need to delete each child — the server hides the subtree by reachability.
    title: `Delete “${item.name}”?`,
    message: item.isDirectory
      ? 'This folder and its contents will be deleted. Deletes are soft — restore it with Undelete.'
      : 'This file will be deleted. Deletes are soft — restore it with Undelete.',
    confirmLabel: 'Delete',
    danger: true,
    action: () => files.deleteItem(item),
  })

const erasePermanently = (item: FileItem) =>
  askConfirm({
    title: `Erase “${item.name}” permanently?`,
    // States what actually happens, in the order it matters: irreversible
    // first, scope second. "Cannot be undone" is the part people skim past, so
    // it leads, and the typed confirmation below makes skimming insufficient.
    message:
      'This cannot be undone. The file, every version of it, and everything ' +
      'derived from it — previews, extracted text, search results and comments ' +
      '— are destroyed across the whole system. A record that the file existed ' +
      'is kept; its contents are not.',
    confirmLabel: 'Erase permanently',
    danger: true,
    requireText: item.name,
    action: async () => {
      const erasure = await files.eraseItem(item)
      if (!erasure) return
      // Deliberately NOT "erased". The core's copy is gone, but other services
      // have yet to confirm destroying what they derived from it, and saying
      // "erased" here would be a claim the platform cannot yet stand behind.
      eraseNotice.value =
        erasure.state === 'complete'
          ? `“${item.name}” has been erased.`
          : `Erasing “${item.name}”. ${erasure.awaiting.length} service(s) still to confirm.`
    },
  })

const undelete = (item: FileItem) =>
  askConfirm({
    title: `Undelete “${item.name}”?`,
    message: item.isDirectory ? 'This folder will be restored.' : 'This file will be restored.',
    confirmLabel: 'Undelete',
    action: () => files.undeleteItem(item),
  })

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
const batchDelete = () => {
  if (!files.selected.size) return
  const items = files.selectedItems
  askConfirm({
    title: `Delete ${items.length} item${items.length > 1 ? 's' : ''}?`,
    message: 'The selected items will be deleted. Deletes are soft — restore them with Undelete.',
    confirmLabel: 'Delete',
    danger: true,
    action: () => files.deleteSelected(),
  })
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

// Background sync: periodically re-pull the current directory (silent refresh —
// no spinner or selection reset) so out-of-band changes appear without a manual
// reload: a folder-action moving files in/out, another user's upload, a new
// version. Interval is configurable via VITE_FILE_LIST_POLL_MS (milliseconds);
// 0, negative, or non-numeric disables polling. Tied to activation, so a
// backgrounded (kept-alive) tab doesn't poll.
const FILE_LIST_POLL_MS = Number(import.meta.env.VITE_FILE_LIST_POLL_MS ?? 10000)
let pollTimer: ReturnType<typeof setInterval> | null = null
function stopPoll() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
function startPoll() {
  stopPoll()
  if (!(FILE_LIST_POLL_MS > 0)) return // disabled / invalid interval
  if (document.hidden) return // suspended until the tab is visible again
  pollTimer = setInterval(() => {
    if (files.loading) return // never overlap an in-flight full load()
    void files.refresh()
  }, FILE_LIST_POLL_MS)
}
// Fully suspend the poll while the tab is backgrounded — no wake-ups when the user
// isn't looking at the file view — and resume with an immediate catch-up sync (so
// they don't wait out the interval) when it returns to the foreground.
function onVisibilityChange() {
  if (document.hidden) {
    stopPoll()
  } else {
    void files.refresh()
    startPoll()
  }
}

// Window-level drag listeners are tied to activation (not mount): under
// <KeepAlive> this view stays alive in the background, and we must not handle
// drops while another tab (Search/Chat) is showing.
onActivated(() => {
  // Returning to the (kept-alive) Files tab lands on a bare /files URL, which
  // doesn't change the deep-link query, so applyRoute's watch won't fire. Put the
  // current folder + tenant back in the URL so reload/bookmarks still work.
  syncUrl()
  startPoll()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('dragenter', onWinDragEnter)
  window.addEventListener('dragover', onWinDragOver)
  window.addEventListener('dragleave', onWinDragLeave)
  window.addEventListener('drop', onWinDrop)
})
onDeactivated(() => {
  dragOver.value = false
  dragDepth.value = 0
  stopPoll()
  document.removeEventListener('visibilitychange', onVisibilityChange)
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
/* Arrived from outside. Deliberately quiet — this is a fact about the file,
   not a warning about it. */
.drop-badge {
  margin-left: 8px;
  padding: 0 7px;
  font-size: 11px;
  line-height: 18px;
  border-radius: 10px;
  border: 1px solid var(--border);
  color: var(--muted);
  white-space: nowrap;
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  vertical-align: middle;
}

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

.erase-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
  background: var(--card);
  font-size: 14px;
}
</style>
