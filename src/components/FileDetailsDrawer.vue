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
  <aside v-if="files.drawerOpen" class="drawer">
    <header class="drawer-head">
      <div class="title">
        <span class="icon">{{ item?.isDirectory ? '📁' : '📄' }}</span>
        <span class="name" :title="item?.name">{{ item?.name }}</span>
      </div>
      <button class="x" aria-label="Close" @click="files.closeDetails()">✕</button>
    </header>

    <nav class="tabs">
      <button v-for="t in visibleTabs" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
    </nav>

    <p v-if="error" class="err">{{ error }}</p>

    <!-- Info -->
    <section v-show="tab === 'Info'" class="pane">
      <div v-if="item" class="info-top">
        <button
          class="copy-link"
          :title="linkCopied ? 'Copied!' : 'Copy a deep link to this file'"
          @click="copyDeepLink"
        >
          🔗 {{ linkCopied ? 'Copied!' : 'Copy link' }}
        </button>
        <!-- Always-available comment window — independent of any preview/rendition. -->
        <button
          v-if="!item.isDirectory"
          class="copy-link"
          title="Open the discussion for this file"
          @click="comments.open(item.uid, item.name)"
        >
          💬 Comments
        </button>
      </div>
      <!-- 3D/BIM models use the dedicated viewer, never the document preview.
           If no model rendition exists yet, offer an on-demand conversion. -->
      <template v-if="isModelFormat">
        <button v-if="canView3D" class="btn view3d-btn" @click="openModel">🧊 View model in 3D</button>
        <template v-else>
          <button class="btn view3d-btn" :disabled="generating" @click="generateModel">
            {{ generating ? 'Generating 3D model…' : '🧊 Generate 3D model' }}
          </button>
          <p v-if="genMessage" class="gen-msg" :class="{ err: genError }">{{ genMessage }}</p>
          <p v-else class="muted">No 3D model has been generated for this file yet.</p>
        </template>
      </template>

      <!-- First-page preview lives in the general Info tab (no separate tab). -->
      <DocumentPreview
        v-else-if="item && !item.isDirectory"
        class="info-preview"
        :uid="item.uid"
        :name="item.name"
        :has-renditions="item.hasRenditions"
      />
      <dl v-if="info">
        <dt>Type</dt><dd>{{ info.type }}</dd>
        <dt>Size</dt><dd>{{ formatSize(info.size) }}</dd>
        <dt>Owner</dt><dd>{{ info.owner || '—' }}</dd>
        <dt>Created</dt><dd>{{ formatDateTime(info.created_at ?? 0) }}</dd>
        <dt>Modified</dt><dd>{{ formatDateTime(info.modified_at ?? 0) }}</dd>
      </dl>
      <p v-else class="muted">Loading…</p>

      <!-- In-browser editing for office documents (ONLYOFFICE, Phase 1.7). Gated on
           the file NAME's extension; the editor page enforces WRITE + surfaces
           "editing not enabled" when the backend flag is off. -->
      <button
        v-if="item && !item.isDirectory && isOfficeEditable"
        class="btn edit-btn"
        @click="openEditor"
      >
        ✎ Edit in browser
      </button>

      <button
        v-if="item && !item.isDirectory && canDownload"
        class="btn dl-btn"
        @click="files.downloadItem(item)"
      >
        ⬇ Download original
      </button>
    </section>

    <!-- Metadata -->
    <section v-show="tab === 'Metadata'" class="pane">
      <table v-if="metaKeys.length" class="meta">
        <tr v-for="k in metaKeys" :key="k">
          <td class="mono key">{{ k }}</td>
          <td>{{ metadata[k] }}</td>
          <td v-if="canEdit" class="act">
            <button class="link danger" @click="removeMeta(k)">delete</button>
          </td>
        </tr>
      </table>
      <p v-else class="muted">No metadata.</p>
      <form v-if="canEdit" class="meta-add" @submit.prevent="addMeta">
        <input v-model="newKey" placeholder="key" />
        <input v-model="newValue" placeholder="value" />
        <button class="btn" type="submit" :disabled="!newKey.trim()">Set</button>
      </form>
    </section>

    <!-- Versions -->
    <section v-show="tab === 'Versions'" class="pane">
      <p class="muted">Version history <HelpIcon topic="versions" label="About version history" /></p>
      <FileVersions
        v-if="item && !item.isDirectory"
        :uid="item.uid"
        :name="item.name"
        :current="info?.version"
        :can-manage="canEdit"
        @changed="loadAll(item.uid)"
      />
      <p v-else class="muted">Folders are not versioned.</p>
    </section>

    <!-- Access -->
    <section v-show="tab === 'Access'" class="pane">
      <dl><dt>Owner</dt><dd>{{ info?.owner || '—' }}</dd></dl>
      <p class="muted">Your effective permissions</p>
      <div class="badges">
        <span v-for="p in PERMS" :key="p.key" class="badge" :class="{ on: effective[p.key] }">
          {{ p.label }}
        </span>
      </div>

      <div v-if="item" class="acl">
        <p class="muted">Access control list <HelpIcon topic="sharing" label="Sharing files &amp; setting permissions" /></p>
        <AclEditor :uid="item.uid" :can-manage="!!effective['m']" :is-directory="item.isDirectory" @changed="loadAll(item.uid)" />
      </div>
    </section>

    <!-- Actions (folders only) -->
    <section v-show="tab === 'Actions'" class="pane">
      <FolderActionsPanel
        v-if="item && item.isDirectory"
        :uid="item.uid"
        :can-write="!!effective['w']"
        :can-manage="!!effective['m']"
        @changed="loadAll(item.uid)"
      />
    </section>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { fileService, type NodeInfo } from '@/services/fileService'
import { useFileStore } from '@/stores/files'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'
import { formatSize, formatDateTime } from '@/utils/format'
import { fileBrowserLocation } from '@/utils/fileLocation'
import { PERMS, canDo } from '@/utils/permissions'
import AclEditor from '@/components/AclEditor.vue'
import FolderActionsPanel from '@/components/FolderActionsPanel.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import FileVersions from '@/components/FileVersions.vue'
import HelpIcon from '@/components/HelpIcon.vue'
import { useModel3dStore } from '@/stores/model3d'
import { useCommentsStore } from '@/stores/comments'
import { is3DModel } from '@/utils/modelFormat'
import { isEditableOffice } from '@/utils/office'
import { loadRenditionSet, modelRendition } from '@/services/renditions'
import { searchService } from '@/services/searchService'

const files = useFileStore()
const auth = useAuthStore()
const model3d = useModel3dStore()
const comments = useCommentsStore()
// Close the drawer on Escape. Capture phase so a focused in-content element (e.g.
// the 3D canvas) can't swallow the key; defaultPrevented means an overlay above
// the drawer (3D viewer / PDF preview, mounted earlier in App.vue so they run
// first) already handled this Esc — so only the topmost surface closes per press.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || !files.drawerOpen) return
  e.preventDefault()
  files.closeDetails()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

// A 3D/BIM model by format (regardless of conversion state). Such files never
// use the document preview — they get the 3D section instead.
const isModelFormat = computed(() => !!item.value && !item.value.isDirectory && is3DModel(item.value.name))
// Viewable in 3D only once its model (.xkt) rendition has been generated — either
// already present, or produced by an on-demand generate this session.
const modelReady = ref(false)
const canView3D = computed(
  () => isModelFormat.value && ((!!item.value && item.value.hasRenditions) || modelReady.value),
)
function openModel() {
  if (item.value) model3d.open(item.value.uid, item.value.name)
}

// On-demand conversion request for a 3D file that has no model rendition yet.
const generating = ref(false)
const genMessage = ref('')
const genError = ref(false)
async function generateModel() {
  if (!item.value) return
  generating.value = true
  genMessage.value = ''
  genError.value = false
  try {
    const res = await searchService.generatePreview(item.value.uid)
    const set = await loadRenditionSet(item.value.uid)
    if (modelRendition(set)) {
      modelReady.value = true // a model.xkt now exists → show the viewer link
    } else {
      genError.value = true
      genMessage.value =
        'Conversion finished but produced no 3D model — this file’s format or schema is not supported by the converter' +
        (res.hasMarkdown ? '. Its text was still indexed for search.' : '.')
    }
  } catch (e) {
    genError.value = true
    genMessage.value = errorMessage(e, 'Could not reach the conversion service.')
  } finally {
    generating.value = false
  }
}

const tabs = ['Info', 'Metadata', 'Versions', 'Access'] as const
// 'Actions' is folder-only, appended via visibleTabs — widen Tab to include it.
type Tab = (typeof tabs)[number] | 'Actions'
const tab = ref<Tab>('Info')

const item = computed(() => files.detailItem)
// Folders gain an extra "Actions" tab (folder-actions bindings + run log).
const visibleTabs = computed<Tab[]>(() =>
  item.value?.isDirectory ? [...tabs, 'Actions'] : [...tabs],
)
const router = useRouter()
const canEdit = computed(() => auth.hasAccessLevel('editor'))
const canDownload = computed(() => canDo('download', auth.accessLevel))
// Editability is decided by the file NAME's extension (an office document), not the
// UID; the backend still enforces WRITE when the editor opens.
const isOfficeEditable = computed(() => !!item.value && isEditableOffice(item.value.name))
function openEditor() {
  if (item.value) router.push(`/edit/${item.value.uid}`)
}

// Copy a shareable deep link (opens the file's folder, selects it, opens this
// drawer) to the clipboard.
const linkCopied = ref(false)
async function copyDeepLink() {
  if (!item.value) return
  // Include the tenant — UIDs are tenant-scoped, so a shared link must carry it.
  // Same deep-link shape the browser keeps in the URL as you navigate; name the
  // query key by kind (folder vs file).
  const kind = item.value.isDirectory ? 'folder' : 'file'
  const href = router.resolve(fileBrowserLocation(item.value.uid, auth.tenant, kind)).href
  try {
    await navigator.clipboard.writeText(window.location.origin + href)
    linkCopied.value = true
    setTimeout(() => (linkCopied.value = false), 1500)
  } catch {
    /* clipboard may be unavailable (insecure context) */
  }
}

const info = ref<NodeInfo | null>(null)
const metadata = ref<Record<string, string>>({})
const metaKeys = computed(() => Object.keys(metadata.value).sort())
const effective = ref<Record<string, boolean>>({})
const error = ref<string | null>(null)

const newKey = ref('')
const newValue = ref('')

async function loadAll(uid: string) {
  error.value = null
  info.value = null
  metadata.value = {}
  effective.value = {}
  // NB: the active tab is intentionally NOT reset here — loadAll also runs after
  // in-tab edits (ACL grant, version restore) via @changed, and those must keep
  // the user on their current tab. The tab is reset only on file-select (watch).
  // Reset the per-file 3D conversion state.
  modelReady.value = false
  generating.value = false
  genMessage.value = ''
  genError.value = false
  try {
    const [stat, meta, ...checks] = await Promise.all([
      fileService.stat(uid),
      fileService.getMetadata(uid).catch(() => ({})),
      ...PERMS.map((p) => fileService.checkPermission(uid, { permission: p.key }).catch(() => false)),
    ])
    info.value = stat
    metadata.value = meta
    PERMS.forEach((p, i) => (effective.value[p.key] = checks[i] as boolean))
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load details')
  }
}

watch(
  () => [files.drawerOpen, files.detailItem?.uid] as const,
  ([open, uid]) => {
    if (open && uid) {
      tab.value = 'Info' // reset the tab only when a (different) file is opened
      loadAll(uid)
    }
  },
  { immediate: true },
)

async function addMeta() {
  if (!item.value || !newKey.value.trim()) return
  try {
    await fileService.setMetadata(item.value.uid, newKey.value.trim(), newValue.value)
    metadata.value = await fileService.getMetadata(item.value.uid)
    newKey.value = ''
    newValue.value = ''
  } catch (e) {
    error.value = errorMessage(e, 'Failed to set metadata')
  }
}

async function removeMeta(key: string) {
  if (!item.value) return
  try {
    await fileService.deleteMetadata(item.value.uid, key)
    metadata.value = await fileService.getMetadata(item.value.uid)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to delete metadata')
  }
}

</script>

<style scoped>
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  /* Wide enough for the ACL editor's permission/effect/grant row; capped so it
     stays usable on small viewports. */
  width: min(440px, 92vw);
  background: var(--card);
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
  z-index: 25;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.title .name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.x {
  border: none;
  background: none;
  font-size: 16px;
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 4px;
  margin: 14px 0;
  border-bottom: 1px solid var(--border);
}

.tabs button {
  border: none;
  background: none;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}

.tabs button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.pane {
  overflow: auto;
}

.info-top {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.copy-link {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
}

.info-preview {
  margin-bottom: 16px;
}

.view3d-btn {
  width: 100%;
  text-align: center;
  margin-bottom: 16px;
}

.gen-msg {
  font-size: 13px;
  margin: 0 0 16px;
  color: var(--muted);
}

.gen-msg.err {
  color: var(--danger);
}

/* Compound `.btn.edit-btn` so the accent background wins over the later `.btn`
   rule (equal specificity + source order would otherwise leave the .btn light-card
   background under the white text — unreadable in light mode). */
.btn.edit-btn {
  margin-top: 14px;
  width: 100%;
  text-align: center;
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.btn.edit-btn:hover:not(:disabled) {
  filter: brightness(1.05);
  background: var(--primary);
}

.dl-btn {
  margin-top: 10px;
  width: 100%;
  text-align: center;
}

dl {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 6px 10px;
  font-size: 13px;
  margin: 0;
}

dt {
  color: var(--muted);
}

dd {
  margin: 0;
  word-break: break-word;
}

.mono {
  font-family: var(--font-sans);
  font-size: 12px;
}

.muted {
  color: var(--muted);
  font-size: 13px;
  margin: 14px 0 6px;
}

.meta {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.meta td {
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.meta .key {
  width: 40%;
}

.meta .act {
  text-align: right;
}

.meta-add {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.meta-add input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.badge {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
  background: var(--bg);
}

.badge.on {
  color: #fff;
  background: var(--primary);
  border-color: var(--primary);
}

.acl {
  margin-top: 16px;
}

.acl-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.acl-form input,
.acl-form select {
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
}

.acl-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  font-size: 13px;
}

.btn:hover:not(:disabled) {
  background: var(--bg);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.link {
  border: none;
  background: none;
  color: var(--primary);
  font-size: 13px;
}

.link.danger {
  color: var(--danger);
}

.err {
  color: var(--danger);
  font-size: 13px;
}
</style>
