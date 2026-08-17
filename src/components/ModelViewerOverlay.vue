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
  <Teleport to="body">
    <!-- Maximal, full-bleed overlay: the 3D canvas must own as much space as
         possible so navigation is never cramped. Not a drawer/centered modal. -->
    <div v-if="model3d.isOpen" class="mv-root theme-dark" role="dialog" aria-modal="true" aria-label="3D model viewer">
      <header class="mv-head">
        <button class="mv-toggle" :aria-pressed="!collapsed" title="Toggle the objects / tools panel" @click="toggleSidebar">
          ☰ <span class="mv-toggle-lbl">{{ collapsed ? 'Show' : 'Hide' }} panel</span>
        </button>
        <h1 class="mv-title" :title="title">{{ title }}</h1>

        <!-- Standard views live in the title bar so they're one click away without
             opening the Tools panel. -->
        <div class="mv-group" role="group" aria-label="Standard views">
          <button class="mv-act mv-icon" title="Top view" @click="view('top')">Top</button>
          <button class="mv-act mv-icon" title="Front view" @click="view('front')">Front</button>
          <button class="mv-act mv-icon" title="Isometric view" @click="view('iso')">Iso</button>
          <button class="mv-act mv-icon" title="Frame the current selection" @click="fitSel">Fit sel</button>
          <button class="mv-act mv-icon" title="Reset the camera to the default view" @click="resetCamera">⟳ Reset</button>
        </div>

        <HelpIcon topic="cad-bim" label="About CAD &amp; BIM model viewing" />
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
          <!-- Tabbed side panel: the object tree and the viewer tools. -->
          <div class="mv-tabs" role="tablist" aria-label="Side panel">
            <button
              class="mv-tab"
              :class="{ 'mv-tab-on': sideTab === 'objects' }"
              role="tab"
              :aria-selected="sideTab === 'objects'"
              @click="selectTab('objects')"
            >Objects</button>
            <button
              class="mv-tab"
              :class="{ 'mv-tab-on': sideTab === 'tools' }"
              role="tab"
              :aria-selected="sideTab === 'tools'"
              @click="selectTab('tools')"
            >Tools</button>
          </div>

          <!-- Objects: the xeokit TreeViewPlugin mounts into #mv-object-tree. Kept
               mounted (v-show) so switching tabs never detaches the tree. -->
          <div v-show="sideTab === 'objects'" class="mv-tabpanel">
            <!-- See-through (X-ray) controls: toggle the mode, then click a tree
                 node to make that element + its subtree translucent. -->
            <div class="mv-objtools" role="group" aria-label="See-through">
              <button
                class="mv-act mv-icon"
                :class="{ 'mv-on': model3d.seeThroughMode }"
                :aria-pressed="model3d.seeThroughMode"
                title="See-through mode: click a tree object to make it (and its subtree) translucent"
                @click="toggleSeeThrough"
              >🔲 See-through</button>
              <button
                class="mv-act mv-icon"
                title="Clear see-through"
                :disabled="!model3d.xrayedIds.length"
                @click="resetXRay"
              >✕ Reset<span v-if="model3d.xrayedIds.length"> ({{ model3d.xrayedIds.length }})</span></button>
            </div>
            <p v-if="model3d.seeThroughMode" class="mv-objhint">Click an object to toggle see-through.</p>
            <div id="mv-object-tree" class="mv-tree"></div>
          </div>

          <!-- Tools: navigation, views, section planes, measurement, annotate. -->
          <div v-show="sideTab === 'tools'" class="mv-tabpanel mv-tools">
            <section class="mv-toolsec">
              <h3 class="mv-toolsec-h">Navigation</h3>
              <div class="mv-toolrow" role="group" aria-label="Navigation mode">
                <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.navMode === 'orbit' }"
                        title="Orbit" @click="setNav('orbit')">⟲ Orbit</button>
                <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.navMode === 'firstPerson' }"
                        title="First-person / walk" @click="setNav('firstPerson')">🚶 Walk</button>
                <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.navMode === 'planView' }"
                        title="Plan (top-down) view" @click="setNav('planView')">▦ Plan</button>
              </div>
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
                >⟲</button>
              </label>
            </section>

            <section class="mv-toolsec">
              <h3 class="mv-toolsec-h">Section planes</h3>
              <div class="mv-toolrow" role="group" aria-label="Section planes">
                <button class="mv-act mv-icon" title="Cut along X" :disabled="!model3d.ready" @click="section('x')">✂X</button>
                <button class="mv-act mv-icon" title="Cut along Y" :disabled="!model3d.ready" @click="section('y')">✂Y</button>
                <button class="mv-act mv-icon" title="Cut along Z" :disabled="!model3d.ready" @click="section('z')">✂Z</button>
                <button class="mv-act mv-icon" title="Section box (isolate a region)" :disabled="!model3d.ready" @click="sectionBox">▣ Box</button>
                <button class="mv-act mv-icon" title="Clear all section planes" :disabled="!model3d.hasSection" @click="clearSections">
                  ✕ Cuts<span v-if="model3d.sectionPlaneIds.length"> ({{ model3d.sectionPlaneIds.length }})</span>
                </button>
              </div>
            </section>

            <section class="mv-toolsec">
              <h3 class="mv-toolsec-h">Measure</h3>
              <div class="mv-toolrow" role="group" aria-label="Measurement">
                <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.activeTool === 'distance' }"
                        title="Measure distance" :disabled="!model3d.ready" @click="measure('distance')">📏 Dist</button>
                <button class="mv-act mv-icon" :class="{ 'mv-on': model3d.activeTool === 'angle' }"
                        title="Measure angle" :disabled="!model3d.ready" @click="measure('angle')">📐 Angle</button>
                <button v-if="model3d.isMeasuring" class="mv-act mv-icon" title="Stop measuring" @click="measure('none')">■ Stop</button>
                <button class="mv-act mv-icon" title="Clear measurements" :disabled="!model3d.ready" @click="clearMeasure">✕ Meas</button>
                <select class="mv-units" :value="model3d.measureUnits" title="Measurement units"
                        aria-label="Measurement units" @change="setUnits(($event.target as HTMLSelectElement).value)">
                  <option value="mm">mm</option>
                  <option value="m">m</option>
                  <option value="ft">ft</option>
                </select>
              </div>
            </section>

            <section class="mv-toolsec">
              <h3 class="mv-toolsec-h">Annotate</h3>
              <button class="mv-act" title="Comment on the current 3D view" :disabled="!model3d.ready" @click="commentHere">💬 Comment here</button>
            </section>
          </div>
        </aside>

        <!-- Drag handle to resize the object tree; hidden when the tree is collapsed. -->
        <div
          v-if="!collapsed"
          class="mv-side-resizer"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the panel"
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
              :metamodel-uid="metamodelUid || undefined"
              :nav-step="navStep"
              tree-container-id="mv-object-tree"
              @annotation-activate="onAnnotationActivate"
              @object-context="onObjectContext"
            />
            <p v-else class="mv-muted">Loading…</p>
            <!-- Discrete hint: how to open the on-model menu (§9). -->
            <div v-if="xktUid && !resolveError" class="mv-hint" aria-hidden="true">
              <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+click an element for options
            </div>

            <!-- Drifted-anchor notice: the restored comment tagged an element that
                 isn't in this version of the model (non-IFC ids aren't stable across
                 re-conversion). The view still restored; only the selection is lost. -->
            <div v-if="anchorMiss" class="mv-anchor-note" role="status">
              <span>⚠ The tagged element isn’t in this version of the model — the view
                was restored, but the element may have changed since the comment.</span>
              <button class="mv-anchor-x" title="Dismiss" aria-label="Dismiss" @click="anchorMiss = false">✕</button>
            </div>
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
              @threads="onThreads"
              @restore-view="onRestoreView"
            />
          </section>
        </div>
      </div>

      <!-- On-model right-click menu: pick an object, then comment on it (§9). -->
      <template v-if="ctxMenu">
        <div class="mv-ctx-backdrop" @pointerdown="closeCtxMenu" @contextmenu.prevent="closeCtxMenu"></div>
        <div class="mv-ctxmenu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" role="menu">
          <button class="mv-ctxitem" role="menuitem" @click="commentOnObject">💬 Comment on this object</button>
          <button
            v-if="ctxMenu.worldPos && ctxMenu.worldDir"
            class="mv-ctxitem"
            role="menuitem"
            title="Add a section plane at this surface"
            @click="sliceHere"
          >✂ Slice here</button>
          <div class="mv-ctxsep"></div>
          <div class="mv-ctxlabel">Navigation</div>
          <button class="mv-ctxitem" role="menuitem" :class="{ 'mv-ctxitem-on': model3d.navMode === 'orbit' }" @click="setNavFromMenu('orbit')">⟲ Orbit</button>
          <button class="mv-ctxitem" role="menuitem" :class="{ 'mv-ctxitem-on': model3d.navMode === 'firstPerson' }" @click="setNavFromMenu('firstPerson')">🚶 Walk</button>
          <button class="mv-ctxitem" role="menuitem" :class="{ 'mv-ctxitem-on': model3d.navMode === 'planView' }" @click="setNavFromMenu('planView')">▦ Plan</button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Model3DViewer from '@/components/Model3DViewer.vue'
import ThreadPanel from '@/components/ThreadPanel.vue'
import HelpIcon from '@/components/HelpIcon.vue'
import { useModel3dStore, type NavMode, type MeasureTool, type MeasureUnits } from '@/stores/model3d'
import { useAuthStore } from '@/stores/auth'
import { useDiscussionDock } from '@/composables/useDiscussionDock'
import { loadRenditionSet, modelRendition, metamodelRendition } from '@/services/renditions'
import { fileService } from '@/services/fileService'
import type { Thread } from '@/services/discussionService'

const model3d = useModel3dStore()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

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
const metamodelUid = ref('')
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

// Which side-panel tab is showing: the object tree or the viewer tools.
const sideTab = ref<'objects' | 'tools'>('objects')
function selectTab(tab: 'objects' | 'tools') {
  sideTab.value = tab
}

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

// See-through (X-ray) controls: toggle the mode (tree clicks then X-ray a subtree)
// and clear all see-through.
function toggleSeeThrough() {
  model3d.setSeeThroughMode(!model3d.seeThroughMode)
}
function resetXRay() {
  viewerRef.value?.clearXRay()
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

// On-model right-click menu (§9): the viewer picked an object; show a menu at the
// cursor. Null payload = empty space → dismiss.
interface Vec3 {
  x: number
  y: number
  z: number
}
type ObjectCtx = { clientX: number; clientY: number; objectId: string; worldPos?: Vec3; worldDir?: Vec3 }
const ctxMenu = ref<{ x: number; y: number; objectId: string; worldPos?: Vec3; worldDir?: Vec3 } | null>(null)
function onObjectContext(p: ObjectCtx | null) {
  ctxMenu.value = p
    ? { x: p.clientX, y: p.clientY, objectId: p.objectId, worldPos: p.worldPos, worldDir: p.worldDir }
    : null
}
function closeCtxMenu() {
  ctxMenu.value = null
}
// "Comment on this object": capture a viewpoint anchored to the picked object +
// its world point and hand it to the composer.
function commentOnObject() {
  const m = ctxMenu.value
  ctxMenu.value = null
  if (!m) return
  const anchor = viewerRef.value?.captureViewpointAnchor(m.worldPos, m.objectId)
  if (!anchor) return
  discMin.value = false
  threadPanelRef.value?.startAnnotation(anchor)
}
// Set the navigation mode from the menu.
function setNavFromMenu(mode: NavMode) {
  ctxMenu.value = null
  viewerRef.value?.setNavMode(mode)
}
// "Slice here": drop a section plane at the picked surface (position + normal) and
// show its drag control for adjustment.
function sliceHere() {
  const m = ctxMenu.value
  ctxMenu.value = null
  if (!m?.worldPos || !m?.worldDir) return
  const id = viewerRef.value?.addSectionPlane({
    pos: [m.worldPos.x, m.worldPos.y, m.worldPos.z],
    dir: [m.worldDir.x, m.worldDir.y, m.worldDir.z],
  })
  if (id) viewerRef.value?.editSectionPlane(id)
}

// Set when a restored comment's tagged element no longer exists in the current
// model (a drifted anchor — see restoreThreadView). Cleared on the next restore.
const anchorMiss = ref(false)

// Latest thread set from the panel; also the lookup for deep-link / restore-view.
let threadsCache: Thread[] = []
// A ?view deep-link is consumed once per open (guarded so it doesn't re-fire as
// the viewer/threads settle).
let deepLinkRestored = false

// The panel surfaces its thread set; render a marker in the viewer for each
// model-viewpoint annotation (§9). Fires on load and whenever threads change,
// so a newly-created (or teammate's live) annotation gets a marker.
function onThreads(ts: Thread[]) {
  threadsCache = ts
  const markers = ts
    .filter((t) => t.anchor?.kind === 'model-viewpoint')
    .map((t) => ({
      id: t.id,
      threadId: t.id,
      marker: t.anchor?.marker,
      viewpoint: t.anchor?.viewpoint,
      measurements: t.anchor?.measurements,
    }))
  viewerRef.value?.renderAnnotations(markers)
  maybeRestoreDeepLink()
}

// Restore a thread's saved view (§9): replay the full viewpoint (camera + section
// planes + visibility + selection) and highlight the referenced element — the
// explicit deep-link object, or the anchor's first object_ref (the tagged object).
function restoreThreadView(threadId: string, objectId?: string) {
  const anchor = threadsCache.find((t) => t.id === threadId)?.anchor
  if (anchor?.kind !== 'model-viewpoint') return
  viewerRef.value?.setViewpoint(anchor.viewpoint)
  // Re-draw any measurements captured with the comment (Option B).
  viewerRef.value?.renderMeasurements(anchor.measurements)
  const objId = objectId ?? (anchor.object_refs?.[0] as { id?: string } | undefined)?.id
  anchorMiss.value = false
  if (objId) {
    // The tagged element's id may no longer resolve if the model was re-converted
    // (rendition-local ids on non-IFC formats aren't stable). Restore the view
    // either way; only select — and only flag a miss — based on what's really there.
    const found = viewerRef.value?.resolveObjectIds([objId]) ?? [objId]
    if (found.length) viewerRef.value?.highlightObjects(found)
    else anchorMiss.value = true
  }
  discMin.value = false
  threadPanelRef.value?.scrollToThread(threadId)
}

function _q(v: unknown): string | undefined {
  return Array.isArray(v) ? (v[0] ?? undefined) : (v as string) || undefined
}

// Consume a shareable deep-link: /preview/{uid}?view={threadId}&object={id} restores
// the annotation's full view once the model is open and its threads have loaded.
function maybeRestoreDeepLink() {
  if (deepLinkRestored || !model3d.ready) return
  const threadId = _q(route.query.view)
  if (!threadId) return
  if (!threadsCache.some((t) => t.id === threadId && t.anchor?.kind === 'model-viewpoint')) return
  restoreThreadView(threadId, _q(route.query.object))
  deepLinkRestored = true
}

// The panel's "restore view" affordance for an annotation thread.
function onRestoreView(threadId: string) {
  restoreThreadView(threadId)
}

// A marker was clicked: the viewer already restored the viewpoint; focus the thread.
function onAnnotationActivate(threadId: string) {
  discMin.value = false
  threadPanelRef.value?.scrollToThread(threadId)
}

// Retry the deep-link when the viewer becomes ready or the target changes; reset
// the once-guard each time the overlay (re)opens.
watch(() => model3d.ready, () => maybeRestoreDeepLink())
watch(
  () => route.query.view,
  () => {
    deepLinkRestored = false
    maybeRestoreDeepLink()
  },
)
watch(
  () => model3d.isOpen,
  (open) => {
    if (!open) {
      deepLinkRestored = false
      threadsCache = []
      anchorMiss.value = false
    }
  },
)

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
//
// A caller may instead PIN the exact children to load (model3d.xktUid): the
// version-comparison overlay does this, because a diff model is a different child
// of the same source file and resolving the file's own `model` rendition would
// silently open the current model instead of the comparison — the wrong thing,
// shown confidently.
watch(
  () => `${model3d.uid}|${model3d.xktUid}`,
  async () => {
    const uid = model3d.uid
    xktUid.value = ''
    metamodelUid.value = ''
    resolveError.value = ''
    if (!uid) return
    document.body.style.overflow = 'hidden'
    await nextTick() // ensure the sidebar tree container exists before the viewer mounts

    if (model3d.xktUid) {
      xktUid.value = model3d.xktUid
      metamodelUid.value = model3d.metamodelUid || ''
      return
    }

    try {
      const set = await loadRenditionSet(uid)
      const model = modelRendition(set)
      if (!model) {
        resolveError.value = 'No 3D preview is available for this file yet.'
        return
      }
      xktUid.value = model.uid
      metamodelUid.value = metamodelRendition(set)?.uid ?? '' // §5.2 sidecar, when present
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
  if (ctxMenu.value) {
    ctxMenu.value = null // Esc closes the object menu before the viewer
    return
  }
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
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: #1b1d21;
  border-right: 1px solid #2a2d31;
  transition: flex-basis 0.15s ease, margin-left 0.15s ease;
}
/* Tabbed side panel: Objects (tree) / Tools. */
.mv-tabs {
  display: flex;
  flex: 0 0 auto;
  border-bottom: 1px solid #2a2d31;
}
.mv-tab {
  flex: 1 1 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #9aa;
  padding: 0.5rem 0.4rem;
  cursor: pointer;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.mv-tab:hover {
  color: #e8e8ea;
}
.mv-tab-on {
  color: #cfe0ff;
  border-bottom-color: #6ea8fe;
}
.mv-tabpanel {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem 0.6rem;
}
/* Tools tab: labeled sections stacked vertically, buttons wrapping in rows. */
.mv-tools {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.mv-toolsec {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.mv-toolsec-h {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #7f8894;
  margin: 0;
}
.mv-toolrow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.mv-tools .mv-zoom {
  width: 100%;
}
.mv-tools .mv-zoom-slider {
  flex: 1 1 auto;
  width: auto;
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
/* See-through controls above the object tree. */
.mv-objtools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
.mv-objhint {
  font-size: 0.72rem;
  color: #9aa;
  margin: 0 0 0.5rem;
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
/* On-model right-click context menu + its click-away backdrop. */
.mv-ctx-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
}
.mv-ctxmenu {
  position: absolute;
  z-index: 21;
  min-width: 180px;
  background: #0f1113;
  border: 1px solid #3a3d42;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}
.mv-ctxitem {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: #e8e8ea;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 0.85rem;
}
.mv-ctxitem:hover {
  background: #2a2d31;
}
.mv-ctxitem-on {
  color: #cfe0ff;
}
.mv-ctxsep {
  height: 1px;
  background: #2a2d31;
  margin: 4px 2px;
}
.mv-ctxlabel {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #7f8894;
  padding: 0.2rem 0.6rem;
}
/* Discrete "Ctrl/⌘+click for options" hint in the viewport corner. */
.mv-hint {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.72rem;
  color: #aab;
  background: rgba(15, 17, 19, 0.6);
  border: 1px solid #2a2d31;
  border-radius: 6px;
  pointer-events: none;
  opacity: 0.7;
}
.mv-hint kbd {
  font-family: inherit;
  font-size: 0.68rem;
  padding: 0 0.25rem;
  border: 1px solid #3a3d42;
  border-radius: 3px;
  background: #1b1d21;
  color: #cfe0ff;
}
/* Drifted-anchor notice: sits top-centre of the viewport, dismissible. */
.mv-anchor-note {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(560px, 90%);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.78rem;
  line-height: 1.3;
  color: #f3e3b0;
  background: rgba(52, 42, 15, 0.92);
  border: 1px solid #6b5a1f;
  border-radius: 6px;
  z-index: 15;
}
.mv-anchor-x {
  flex: 0 0 auto;
  background: transparent;
  border: none;
  color: #f3e3b0;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  font-size: 0.85rem;
}
.mv-anchor-x:hover {
  color: #fff;
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
