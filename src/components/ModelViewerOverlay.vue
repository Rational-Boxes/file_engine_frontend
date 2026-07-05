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
        <label class="mv-zoom" title="How far each zoom and pan step moves — lower it for fine control on small CAD models">
          <span class="mv-zoom-lbl">Nav step</span>
          <input
            class="mv-zoom-slider"
            type="range"
            :min="NAV_MIN"
            :max="NAV_MAX"
            step="1"
            :value="navStep"
            aria-label="Viewer navigation step"
            @input="onNavInput"
          />
          <button
            class="mv-zoom-reset"
            type="button"
            title="Reset navigation step to the default"
            aria-label="Reset navigation step to default"
            :disabled="navStep === NAV_DEFAULT"
            @click="resetNav"
          >
            ⟲
          </button>
        </label>
        <button class="mv-act" title="Reset the camera to the default view" @click="resetCamera">⟳ Reset camera</button>
        <button class="mv-act" @click="downloadOriginal">⬇ Download original</button>
        <button class="mv-act" @click="openLocation">📂 Open file location</button>
        <div id="mv-titlebar" class="mv-slot"></div>
        <button class="mv-x" aria-label="Close viewer" @click="model3d.close()">✕</button>
      </header>

      <div class="mv-body">
        <!-- Collapsible sidebar: object tree (+ room for metadata). Collapsing it
             hands the entire overlay to the 3D viewport. -->
        <aside class="mv-side" :class="{ 'mv-side-collapsed': collapsed }" :aria-hidden="collapsed">
          <h2 class="mv-side-h">Objects</h2>
          <div id="mv-object-tree" class="mv-tree"></div>
        </aside>

        <!-- 3D viewport + docked discussion (same model as the document preview:
             side/bottom orientation, minimize to the title bar, draggable divider,
             independent scrolling). -->
        <div
          class="mv-main"
          :class="{
            'mv-side-by-side': combinedActive && discussionPos === 'side',
            'mv-fit-bottom': combinedActive && discussionPos === 'bottom',
            dragging,
          }"
        >
          <section class="mv-stage">
            <p v-if="resolveError" class="mv-err">{{ resolveError }}</p>
            <Model3DViewer
              v-else-if="xktUid"
              ref="viewerRef"
              :xkt-uid="xktUid"
              :nav-step="navStep"
              tree-container-id="mv-object-tree"
            />
            <p v-else class="mv-muted">Loading…</p>
          </section>

          <div
            v-if="combinedActive"
            class="mv-splitter"
            :class="discussionPos === 'side' ? 'vertical' : 'horizontal'"
            role="separator"
            title="Drag to resize"
            @pointerdown="startDrag"
          ></div>

          <section v-if="model3d.uid" class="mv-discussion" :style="discStyle">
            <ThreadPanel
              :file-uid="model3d.uid"
              embedded
              titlebar-target="#mv-titlebar"
              :pos="discussionPos"
              :class="['mv-thread', { 'mv-thread-min': discLayout === 'collapsed' }]"
              @layout="discLayout = $event"
              @update:pos="setPos"
            />
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Model3DViewer from '@/components/Model3DViewer.vue'
import ThreadPanel from '@/components/ThreadPanel.vue'
import { useModel3dStore } from '@/stores/model3d'
import { useAuthStore } from '@/stores/auth'
import { useDiscussionDock } from '@/composables/useDiscussionDock'
import { loadRenditionSet, modelRendition } from '@/services/renditions'
import { fileService } from '@/services/fileService'

const model3d = useModel3dStore()
const auth = useAuthStore()
const router = useRouter()

// Docked discussion — same behaviour as the document preview. Available whenever a
// file is open (comments are per-file, independent of the 3D rendition).
const hasDiscussion = computed(() => !!model3d.uid)
const {
  discussionPos,
  discLayout,
  discSideW,
  discBottomPct,
  dragging,
  combinedActive,
  discStyle,
  setPos,
  startDrag,
} = useDiscussionDock(hasDiscussion, computed(() => true))

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

// The 3D viewport's free space changes as the discussion docks/resizes/minimizes —
// let xeokit recompute the canvas each time (including live during a divider drag).
watch([combinedActive, discussionPos, discLayout, discSideW, discBottomPct], async () => {
  await nextTick()
  viewerRef.value?.resize()
})

const COLLAPSE_KEY = 'fe.model3d.sidebarCollapsed'
const collapsed = ref(readCollapsed())

// Navigation-step slider: scales the viewer's zoom *and* pan rates together. The
// range is centred on xeokit's default (100) so the halfway position — NAV_DEFAULT
// — is the SDK's own behaviour; dragging left gives the finer steps that small-
// scale CAD models need, right gives coarser. Persisted so the choice sticks.
const NAV_MIN = 5
const NAV_MAX = 195
const NAV_DEFAULT = (NAV_MIN + NAV_MAX) / 2 // 100 — the slider's halfway point
const NAV_KEY = 'fe.model3d.navStep'
const navStep = ref(readNavStep())

const title = computed(() => model3d.name || model3d.uid)

function readNavStep(): number {
  try {
    const v = Number(localStorage.getItem(NAV_KEY))
    if (Number.isFinite(v) && v >= NAV_MIN && v <= NAV_MAX) return v
  } catch {
    /* ignore */
  }
  return NAV_DEFAULT
}

function setNavStep(v: number) {
  navStep.value = v
  try {
    localStorage.setItem(NAV_KEY, String(v))
  } catch {
    /* ignore */
  }
}

function onNavInput(e: Event) {
  setNavStep(Number((e.target as HTMLInputElement).value))
}

function resetNav() {
  setNavStep(NAV_DEFAULT)
}

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
/* Zoom-step control: label + slider + reset, grouped so they read as one unit. */
.mv-zoom {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  color: #c7c9cc;
  font-size: 0.8rem;
  white-space: nowrap;
}
.mv-zoom-lbl {
  color: #9aa;
}
.mv-zoom-slider {
  width: 120px;
  cursor: pointer;
  accent-color: #6ea8fe;
}
.mv-zoom-reset {
  background: transparent;
  border: 1px solid #3a3d42;
  color: #e8e8ea;
  border-radius: 6px;
  padding: 0.15rem 0.4rem;
  line-height: 1;
  cursor: pointer;
}
.mv-zoom-reset:hover:not(:disabled) {
  background: #2a2d31;
}
.mv-zoom-reset:disabled {
  opacity: 0.4;
  cursor: default;
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
/* 3D viewport + docked discussion. */
.mv-main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
}
.mv-main.mv-fit-bottom {
  flex-direction: column;
}
.mv-main.dragging {
  user-select: none;
}
.mv-main.dragging canvas {
  pointer-events: none;
}
.mv-stage {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  position: relative;
}
.mv-discussion {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: var(--fg);
}
.mv-side-by-side .mv-discussion {
  border-left: 1px solid #2a2d31;
}
.mv-fit-bottom .mv-discussion {
  border-top: 1px solid #2a2d31;
}
.mv-thread {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: block;
  border: none;
}
.mv-thread-min {
  flex: 0 0 auto;
  height: auto;
}
/* Draggable divider (both orientations). */
.mv-splitter {
  flex: 0 0 auto;
  position: relative;
  align-self: stretch;
}
.mv-splitter.vertical {
  width: 9px;
  cursor: col-resize;
}
.mv-splitter.horizontal {
  height: 9px;
  cursor: row-resize;
}
.mv-splitter::before {
  content: '';
  position: absolute;
  background: #3a3d42;
  border-radius: 2px;
}
.mv-splitter.vertical::before {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
}
.mv-splitter.horizontal::before {
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
}
.mv-splitter:hover::before {
  background: #6ea8fe;
}
.mv-slot {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
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
