<template>
  <Teleport to="body">
    <!-- Maximal, full-bleed overlay: the 3D canvas must own as much space as
         possible so navigation is never cramped. Not a drawer/centered modal. -->
    <div v-if="model3d.isOpen" class="mv-root" role="dialog" aria-modal="true" aria-label="3D model viewer">
      <header class="mv-head">
        <button class="mv-toggle" :aria-pressed="!collapsed" title="Toggle object tree" @click="toggleSidebar">
          ☰ <span class="mv-toggle-lbl">{{ collapsed ? 'Show' : 'Hide' }} tree</span>
        </button>
        <h1 class="mv-title" :title="title">{{ title }}</h1>
        <button class="mv-act" title="Reset the camera to the default view" @click="resetCamera">⟳ Reset camera</button>
        <button class="mv-act" @click="downloadOriginal">⬇ Download original</button>
        <button class="mv-act" @click="openLocation">📂 Open file location</button>
        <button class="mv-x" aria-label="Close viewer" @click="model3d.close()">✕</button>
      </header>

      <div class="mv-body">
        <!-- Collapsible sidebar: object tree (+ room for metadata). Collapsing it
             hands the entire overlay to the 3D viewport. -->
        <aside class="mv-side" :class="{ 'mv-side-collapsed': collapsed }" :aria-hidden="collapsed">
          <h2 class="mv-side-h">Objects</h2>
          <div id="mv-object-tree" class="mv-tree"></div>
        </aside>

        <section class="mv-stage">
          <p v-if="resolveError" class="mv-err">{{ resolveError }}</p>
          <Model3DViewer
            v-else-if="xktUid"
            ref="viewerRef"
            :xkt-uid="xktUid"
            tree-container-id="mv-object-tree"
          />
          <p v-else class="mv-muted">Loading…</p>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Model3DViewer from '@/components/Model3DViewer.vue'
import { useModel3dStore } from '@/stores/model3d'
import { useAuthStore } from '@/stores/auth'
import { loadRenditionSet, modelRendition } from '@/services/renditions'
import { fileService } from '@/services/fileService'

const model3d = useModel3dStore()
const auth = useAuthStore()
const router = useRouter()

// Download the source file (same affordance as the document preview).
async function downloadOriginal() {
  const uid = model3d.uid
  const name = model3d.name || uid
  if (!uid) return
  try {
    const blob = await fileService.downloadFile(uid)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    /* best effort */
  }
}

// Close the viewer and navigate the Files browser to the source file's folder.
function openLocation() {
  const uid = model3d.uid
  if (!uid) return
  const query: Record<string, string> = { file: uid }
  if (auth.tenant) query.tenant = auth.tenant // UIDs are tenant-scoped
  model3d.close()
  router.push({ name: 'FileBrowser', query })
}

const xktUid = ref('')
const resolveError = ref('')
const viewerRef = ref<InstanceType<typeof Model3DViewer> | null>(null)

const COLLAPSE_KEY = 'fe.model3d.sidebarCollapsed'
const collapsed = ref(readCollapsed())

const title = computed(() => model3d.name || model3d.uid)

function readCollapsed(): boolean {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY)
    if (v !== null) return v === '1'
  } catch {
    /* ignore */
  }
  // Default: collapsed on small screens, expanded on wide.
  return typeof window !== 'undefined' && window.innerWidth < 768
}

// Return the 3D camera to its default framing of the whole model.
function resetCamera() {
  viewerRef.value?.resetCamera()
}

async function toggleSidebar() {
  collapsed.value = !collapsed.value
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed.value ? '1' : '0')
  } catch {
    /* ignore */
  }
  // The canvas free space changed — let xeokit recompute the viewport.
  await nextTick()
  viewerRef.value?.resize()
}

// Resolve the source file's `model` (.xkt) rendition whenever the viewer opens.
watch(
  () => model3d.uid,
  async (uid) => {
    xktUid.value = ''
    resolveError.value = ''
    if (!uid) return
    document.body.style.overflow = 'hidden'
    await nextTick() // ensure the sidebar tree container exists before the viewer mounts
    try {
      const set = await loadRenditionSet(uid)
      const model = modelRendition(set)
      if (!model) {
        resolveError.value = 'No 3D preview is available for this file yet.'
        return
      }
      xktUid.value = model.uid
    } catch {
      resolveError.value = 'Could not load the 3D model.'
    }
  },
  { immediate: true },
)

// Restore body scroll whenever the overlay closes.
watch(
  () => model3d.isOpen,
  (open) => {
    if (!open) document.body.style.overflow = ''
  },
)

// Capture phase so the focused WebGL canvas (xeokit binds keys) can't swallow
// Esc; preventDefault marks it handled so lower surfaces (the drawer) don't also
// close on the same press.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || !model3d.isOpen) return
  e.preventDefault()
  model3d.close()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.mv-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: #15171a;
  color: #e8e8ea;
}
.mv-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.75rem;
  background: #0f1113;
  border-bottom: 1px solid #2a2d31;
  flex: 0 0 auto;
}
.mv-title {
  flex: 1 1 auto;
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mv-toggle,
.mv-act,
.mv-x {
  background: transparent;
  border: 1px solid #3a3d42;
  color: #e8e8ea;
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  white-space: nowrap;
}

.mv-act:hover {
  background: #2a2d31;
}
.mv-body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}
.mv-side {
  flex: 0 0 280px;
  max-width: 280px;
  overflow: auto;
  background: #1b1d21;
  border-right: 1px solid #2a2d31;
  padding: 0.5rem 0.6rem;
  transition: flex-basis 0.15s ease, margin-left 0.15s ease;
}
/* Collapsed → fully out of the way so the viewport gets the whole overlay. */
.mv-side-collapsed {
  flex-basis: 0;
  max-width: 0;
  margin-left: -1px;
  padding: 0;
  overflow: hidden;
  border-right: none;
}
.mv-side-h {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9aa;
  margin: 0.25rem 0 0.5rem;
}
.mv-tree {
  font-size: 0.85rem;
}
.mv-stage {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
}
.mv-err,
.mv-muted {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  text-align: center;
}
.mv-muted {
  color: #aab;
}
.mv-err {
  color: #f3b0b0;
}
</style>
