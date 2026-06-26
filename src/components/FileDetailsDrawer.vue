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
      <button v-for="t in tabs" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
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
      </div>
      <!-- First-page preview lives in the general Info tab (no separate tab). -->
      <DocumentPreview
        v-if="item && !item.isDirectory"
        class="info-preview"
        :uid="item.uid"
        :name="item.name"
        :has-renditions="item.hasRenditions"
      />
      <dl v-if="info">
        <dt>Type</dt><dd>{{ info.type }}</dd>
        <dt>Size</dt><dd>{{ formatSize(info.size) }}</dd>
        <dt>Owner</dt><dd>{{ info.owner || '—' }}</dd>
        <dt>Version</dt><dd>{{ info.version ? formatVersionTimestamp(info.version) : '—' }}</dd>
      </dl>
      <p v-else class="muted">Loading…</p>

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
        <p class="muted">Access control list</p>
        <AclEditor :uid="item.uid" :can-manage="isAdmin" @changed="loadAll(item.uid)" />
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fileService, type NodeInfo } from '@/services/fileService'
import { useFileStore } from '@/stores/files'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'
import { formatSize, formatVersionTimestamp } from '@/utils/format'
import { PERMS, canDo } from '@/utils/permissions'
import AclEditor from '@/components/AclEditor.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import FileVersions from '@/components/FileVersions.vue'

const files = useFileStore()
const auth = useAuthStore()

const tabs = ['Info', 'Metadata', 'Versions', 'Access'] as const
type Tab = (typeof tabs)[number]
const tab = ref<Tab>('Info')

const item = computed(() => files.detailItem)
const router = useRouter()
const canEdit = computed(() => auth.hasAccessLevel('editor'))
const isAdmin = computed(() => auth.hasAccessLevel('admin'))
const canDownload = computed(() => canDo('download', auth.accessLevel))

// Copy a shareable deep link (opens the file's folder, selects it, opens this
// drawer) to the clipboard.
const linkCopied = ref(false)
async function copyDeepLink() {
  if (!item.value) return
  // Include the tenant — UIDs are tenant-scoped, so a shared link must carry it.
  const query: Record<string, string> = { file: item.value.uid }
  if (auth.tenant) query.tenant = auth.tenant
  const href = router.resolve({ name: 'FileBrowser', query }).href
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
  tab.value = 'Info'
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
    if (open && uid) loadAll(uid)
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
  width: 340px;
  background: #fff;
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

.dl-btn {
  margin-top: 14px;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
  background: #fff;
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
