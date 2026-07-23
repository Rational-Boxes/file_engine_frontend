<template>
  <Teleport to="body">
    <!-- Maximal, full-bleed overlay: the 3D canvas must own as much space as
         possible so navigation is never cramped. Not a drawer/centered modal. -->
    <div v-if="model3d.isOpen" class="mv-root theme-dark" role="dialog" aria-modal="true" aria-label="3D model viewer">
      <header class="mv-head">
        <button class="mv-toggle" :aria-pressed="!collapsed" title="Toggle object tree" @click="toggleSidebar">
          ☰ <span class="mv-toggle-lbl">{{ collapsed ? 'Show' : 'Hide' }} tree</span>
        </button>
        <h1 class="mv-title" :title="title">{{ title }}</h1>
        <HelpIcon topic="cad-bim" label="About CAD &amp; BIM model viewing" />
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

        <!-- Navigation mode (§6): orbit / walk (first-person) / plan. Active state
             reflects the live viewer via the store. -->
        <div class="mv-group" role="group" aria-label="Navigation mode">
          <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.navMode === 'orbit' }"
                  title="Orbit" aria-label="Orbit navigation" @click="setNav('orbit')">⟲</button>
          <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.navMode === 'firstPerson' }"
                  title="First-person / walk" aria-label="First-person navigation" @click="setNav('firstPerson')">🚶</button>
          <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.navMode === 'planView' }"
                  title="Plan (top-down) view" aria-label="Plan navigation" @click="setNav('planView')">▦</button>
        </div>

        <!-- Standard views (§6): quick orientations + fit-to-selection. -->
        <div class="mv-group" role="group" aria-label="Standard views">
          <button class="mv-act mv-icon" title="Top view" @click="view('top')">Top</button>
          <button class="mv-act mv-icon" title="Front view" @click="view('front')">Front</button>
          <button class="mv-act mv-icon" title="Isometric view" @click="view('iso')">Iso</button>
          <button class="mv-act mv-icon" title="Frame the current selection" @click="fitSel">Fit sel</button>
        </div>

        <!-- Section planes (§7): axis quick-cuts, a section box, and clear-all. -->
        <div class="mv-group" role="group" aria-label="Section planes">
          <button class="mv-act mv-icon" title="Cut along X" :disabled="!model3d.ready" @click="section('x')">✂X</button>
          <button class="mv-act mv-icon" title="Cut along Y" :disabled="!model3d.ready" @click="section('y')">✂Y</button>
          <button class="mv-act mv-icon" title="Cut along Z" :disabled="!model3d.ready" @click="section('z')">✂Z</button>
          <button class="mv-act mv-icon" title="Section box (isolate a region)" :disabled="!model3d.ready" @click="sectionBox">▣ Box</button>
          <button class="mv-act mv-icon" title="Clear all section planes" :disabled="!model3d.hasSection" @click="clearSections">
            ✕ Cuts<span v-if="model3d.sectionPlaneIds.length"> ({{ model3d.sectionPlaneIds.length }})</span>
          </button>
        </div>

        <!-- Measurement (§8): distance / angle (transient), clear, and a units switch. -->
        <div class="mv-group" role="group" aria-label="Measurement">
          <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.activeTool === 'distance' }"
                  title="Measure distance" :disabled="!model3d.ready" @click="measure('distance')">📏</button>
          <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.activeTool === 'angle' }"
                  title="Measure angle" :disabled="!model3d.ready" @click="measure('angle')">📐</button>
          <button v-if="model3d.isMeasuring" class="mv-act mv-icon" title="Stop measuring" @click="measure('none')">■</button>
          <button class="mv-act mv-icon" title="Clear measurements" :disabled="!model3d.ready" @click="clearMeasure">✕ Meas</button>
          <select class="mv-units" :value="model3d.measureUnits" title="Measurement units"
                  aria-label="Measurement units" @change="setUnits(($event.target as HTMLSelectElement).value)">
            <option value="mm">mm</option>
            <option value="m">m</option>
            <option value="ft">ft</option>
          </select>
        </div>

        <!-- Comment on the current 3D view (§9): captures a viewpoint and hands it
             to the discussion composer as an anchored annotation. -->
        <button class="mv-act" title="Comment on the current 3D view" :disabled="!model3d.ready" @click="commentHere">💬 Comment here</button>

        <button class="mv-act" @click="downloadOriginal">⬇ Download original</button>
        <button class="mv-act" @click="openLocation">📂 Open file location</button>

        <!-- Discussion controls live in the viewer's title bar (dark chrome). -->
        <div class="mv-disc">
          <template v-if="!discMin">
            <button class="mv-act mv-icon" :class="{ 'mv-on': discussionPos === 'side' }" title="Comments on the right" @click="setPos('side')">▐</button>
            <button class="mv-act mv-icon" :class="{ 'mv-on': discussionPos === 'bottom' }" title="Comments below" @click="setPos('bottom')">▄</button>
            <button class="mv-act mv-icon" title="Minimize comments" @click="discMin = true">💬 —</button>
          </template>
          <button v-else class="mv-act" title="Show comments" @click="discMin = false">
            💬 Comments ({{ discCount }})
          </button>
        </div>

        <button class="mv-x" aria-label="Close viewer" @click="model3d.close()">✕</button>
      </header>

      <div class="mv-body" :class="{ 'mv-resizing': sideResizing }">
        <!-- Collapsible sidebar: object tree (+ room for metadata). Collapsing it
             hands the entire overlay to the 3D viewport. Its width is drag-resizable
             (the handle just to its right) and persisted. -->
        <aside
          class="mv-side"
          :class="{ 'mv-side-collapsed': collapsed }"
          :style="collapsed ? undefined : sideStyle"
          :aria-hidden="collapsed"
        >
          <h2 class="mv-side-h">Objects</h2>
          <div id="mv-object-tree" class="mv-tree"></div>
        </aside>

        <!-- Drag handle to resize the object tree; hidden when the tree is collapsed. -->
        <div
          v-if="!collapsed"
          class="mv-side-resizer"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the object tree"
          @pointerdown="startSideResize"
        ></div>

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

          <section v-show="!discMin" class="mv-discussion" :style="discStyle">
            <ThreadPanel
              v-if="model3d.uid"
              ref="threadPanelRef"
              :file-uid="model3d.uid"
              embedded
              hide-dock
              :pos="discussionPos"
              class="mv-thread"
              @layout="discLayout = $event"
              @update:pos="setPos"
              @count="discCount = $event"
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
import HelpIcon from '@/components/HelpIcon.vue'
import { useModel3dStore, type NavMode, type MeasureTool, type MeasureUnits } from '@/stores/model3d'
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
const discMin = ref(false) // comments minimized to the title-bar chip
const discCount = ref(0) // comment count surfaced by the panel (for the chip)
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
} = useDiscussionDock(hasDiscussion, computed(() => !discMin.value))

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
const threadPanelRef = ref<InstanceType<typeof ThreadPanel> | null>(null)

// Drag-resizable object-tree sidebar width (px), clamped and persisted.
const SIDE_KEY = 'fe.model3d.sidebarWidth'
const SIDE_MIN = 180
const SIDE_MAX = 560
const sideW = ref(readSideW())
const sideResizing = ref(false)
const sideStyle = computed(() => ({ flexBasis: `${sideW.value}px`, maxWidth: `${sideW.value}px` }))

// The 3D viewport's free space changes as the sidebar resizes or the discussion
// docks/resizes/minimizes — let xeokit recompute the canvas each time (including
// live during a divider drag).
watch([combinedActive, discussionPos, discLayout, discSideW, discBottomPct, sideW], async () => {
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

function readSideW(): number {
  try {
    const v = Number(localStorage.getItem(SIDE_KEY))
    if (Number.isFinite(v) && v >= SIDE_MIN && v <= SIDE_MAX) return v
  } catch {
    /* ignore */
  }
  return 280
}

// Drag the handle right of the object tree to resize it; clamp + persist on release.
function startSideResize(e: PointerEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startW = sideW.value
  sideResizing.value = true
  const onMove = (ev: PointerEvent) => {
    sideW.value = Math.min(SIDE_MAX, Math.max(SIDE_MIN, startW + (ev.clientX - startX)))
  }
  const onUp = () => {
    sideResizing.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    try {
      localStorage.setItem(SIDE_KEY, String(sideW.value))
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

// Return the 3D camera to its default framing of the whole model.
function resetCamera() {
  viewerRef.value?.resetCamera()
}

// Navigation-mode toggle + standard-view shortcuts (§6) — drive the live viewer
// through its imperative API; the active nav mode is reflected from the store.
function setNav(mode: NavMode) {
  viewerRef.value?.setNavMode(mode)
}
function view(kind: 'top' | 'front' | 'iso' | 'fit') {
  viewerRef.value?.standardView(kind)
}
function fitSel() {
  viewerRef.value?.fitToSelection()
}

// Section-plane controls (§7): axis quick-cuts, a section box, and clear-all.
function section(axis: 'x' | 'y' | 'z') {
  viewerRef.value?.addAxisSection(axis)
}
function sectionBox() {
  viewerRef.value?.addSectionBox()
}
function clearSections() {
  viewerRef.value?.clearSectionPlanes()
}

// Measurement controls (§8): activate distance/angle (or 'none' to stop), clear
// all measurements, and switch display units.
function measure(kind: MeasureTool) {
  viewerRef.value?.startMeasurement(kind)
}
function clearMeasure() {
  viewerRef.value?.clearMeasurements()
}
function setUnits(units: string) {
  viewerRef.value?.setMeasurementUnits(units as MeasureUnits)
}

// "Comment here" (§9): capture the current view as an annotation anchor and hand
// it to the discussion composer, which attaches it to the next new thread. The
// created annotation surfaces in the panel (live) like any comment.
function commentHere() {
  const anchor = viewerRef.value?.captureViewpointAnchor()
  if (!anchor) return
  discMin.value = false // make sure the comment panel is visible
  threadPanelRef.value?.startAnnotation(anchor)
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
/* Drag handle to resize the object tree (mirrors the discussion splitter). */
.mv-side-resizer {
  flex: 0 0 7px;
  align-self: stretch;
  position: relative;
  cursor: col-resize;
  z-index: 2;
}
.mv-side-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: #3a3d42;
  border-radius: 2px;
}
.mv-side-resizer:hover::before,
.mv-body.mv-resizing .mv-side-resizer::before {
  background: #5b6470;
}
/* Keep the drag crisp: no width animation and no canvas/selection interference. */
.mv-body.mv-resizing {
  user-select: none;
}
.mv-body.mv-resizing .mv-side {
  transition: none;
}
.mv-body.mv-resizing canvas {
  pointer-events: none;
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
  background: var(--card);
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
.mv-disc {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex: 0 0 auto;
}
/* Navigation-mode + standard-view button clusters. */
.mv-group {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  flex: 0 0 auto;
}
.mv-units {
  background: transparent;
  border: 1px solid #3a3d42;
  color: #e8e8ea;
  border-radius: 6px;
  padding: 0.2rem 0.3rem;
  cursor: pointer;
}
.mv-units option {
  color: #000;
}
.mv-icon {
  padding: 0.25rem 0.45rem;
}
.mv-on {
  background: #2a2d31;
  border-color: #6ea8fe;
  color: #cfe0ff;
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
