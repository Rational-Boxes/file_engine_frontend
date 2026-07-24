<template>
  <div class="m3d" ref="rootEl">
    <canvas
      ref="canvasEl"
      class="m3d-canvas"
      @contextmenu.prevent="openObjectMenu"
      @click="onCanvasClick"
    ></canvas>
    <!-- Navigation cube: a small in-canvas corner widget. Temporarily disabled —
         xeokit-sdk #2016: NavCubePlugin throws "Missing input materialEmissive"
         (regressed in 2.6.104, unfixed through the current latest 2.6.112) which
         crashes the render loop. Re-enable via NAVCUBE_ENABLED when upstream fixes. -->
    <canvas v-if="NAVCUBE_ENABLED" ref="navCubeEl" class="m3d-navcube"></canvas>

    <p v-if="loading" class="m3d-state m3d-muted">Loading 3D model…</p>
    <div v-else-if="error" class="m3d-state m3d-err">
      <p>{{ error }}</p>
      <button class="link" @click="downloadOriginal">⬇ Download original</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { renditionArrayBuffer, renditionText } from '@/services/renditions'
import { fileService } from '@/services/fileService'
import { useModel3dStore, type NavMode, type MeasureTool, type MeasureUnits } from '@/stores/model3d'
import type { ModelViewpointAnchor } from '@/services/discussionService'

// `xktUid` is the rendition child's uid (the .xkt bytes). `treeContainerId`
// (optional) is the id of the sidebar element the object tree mounts into.
// `navStep` is the navigation step the overlay's slider drives (see applyNavStep)
// — it scales both zoom and pan so small-scale CAD models can be navigated finely.
const props = withDefaults(
  defineProps<{
    xktUid: string
    // Optional xeokit MetaModel JSON rendition (objects/tree/props — §5.2). When
    // present it is loaded alongside the geometry so the object tree, selection,
    // and annotation object_refs work against real model objects.
    metamodelUid?: string
    treeContainerId?: string
    navStep?: number
  }>(),
  { navStep: 100 },
)

// annotation-activate: an in-scene marker was clicked (viewer restored the
//   viewpoint; host focuses the thread).
// object-context: a right-click picked an object — the host opens a context menu
//   at (clientX, clientY); null means the click hit empty space (dismiss).
const emit = defineEmits<{
  (e: 'annotation-activate', threadId: string): void
  (e: 'object-context', payload: ObjectContext | null): void
}>()

interface ObjectContext {
  clientX: number
  clientY: number
  objectId: string
  worldPos?: { x: number; y: number; z: number }
  worldDir?: { x: number; y: number; z: number } // surface normal — a slice plane's direction
}

// xeokit-sdk #2016: the NavCubePlugin shader crashes ("Missing input
// materialEmissive") in 2.6.104–2.6.112. Keep the integration but off until fixed.
const NAVCUBE_ENABLED = false

const store = useModel3dStore()

// Marker id → its thread + viewpoint, so a marker click restores the right view
// and focuses the right thread. Rebuilt on every renderAnnotations().
let annotationMeta: Record<string, { threadId: string; viewpoint: unknown }> = {}

const rootEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const navCubeEl = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)
const error = ref('')

// xeokit handles (kept untyped — the SDK is loaded lazily). Disposed on unmount.
// This component is the plugin HOST: it owns the Viewer plus the markup/BCF plugin
// suite and exposes a typed imperative API (see defineExpose) that the markup
// toolbar and the annotation layer drive; live state is mirrored into the store.
let viewer: any = null
let treeView: any = null
let sectionPlanes: any = null // SectionPlanesPlugin — cut-away (Workstream B / §7)
let distanceMeasurements: any = null // DistanceMeasurementsPlugin (Workstream C / §8)
let angleMeasurements: any = null // AngleMeasurementsPlugin (Workstream C / §8)
let annotations: any = null // AnnotationsPlugin — markers (Workstream D / §9)
let bcfViewpoints: any = null // BCFViewpointsPlugin — viewpoint get/set (§4)

async function load() {
  destroy()
  if (!props.xktUid || !canvasEl.value) return
  loading.value = true
  error.value = ''
  try {
    // Lazy-load the (large, AGPL) xeokit SDK only when a model is actually opened.
    const xeokit: any = await import('@xeokit/xeokit-sdk')
    viewer = new xeokit.Viewer({ canvasElement: canvasEl.value, transparent: true })
    applyNavStep()
    patchCameraPan()
    applyCameraControlDefaults()

    // The core requirement is rendering the model. The nav-cube, object tree and
    // camera fit are *enhancements* — a failure in any of them (e.g. a model with
    // no metadata for the tree) must never break the preview, so each is isolated.
    try {
      if (NAVCUBE_ENABLED && navCubeEl.value) {
        new xeokit.NavCubePlugin(viewer, { canvasElement: navCubeEl.value })
      }
    } catch (e) {
      console.warn('[Model3DViewer] navigation cube unavailable', e)
    }
    try {
      if (props.treeContainerId && document.getElementById(props.treeContainerId)) {
        treeView = new xeokit.TreeViewPlugin(viewer, {
          containerElementId: props.treeContainerId,
          hierarchy: 'containment',
          autoExpandDepth: 1,
        })
      }
    } catch (e) {
      console.warn('[Model3DViewer] object tree unavailable (model may have no metadata)', e)
    }

    // Instantiate the markup / BCF plugin suite. Each is the backing capability
    // for one imperative method below; a plugin that fails to construct must
    // never break the preview, so each is isolated (same discipline as the tree).
    makePlugins(xeokit)

    const loader = new xeokit.XKTLoaderPlugin(viewer)
    const xkt = await renditionArrayBuffer(props.xktUid)
    // Load the MetaModel sidecar alongside the geometry when present (§5.2), so the
    // object tree/selection resolve to real objects. Best-effort — geometry loads
    // regardless if the metamodel is missing or malformed.
    const metaModelData = await loadMetamodel()
    const model = loader.load(
      metaModelData ? { id: 'model', xkt, metaModelData } : { id: 'model', xkt },
    )
    // Frame the whole model once it's loaded — this is the default camera view
    // that the overlay's "Reset camera" button returns to.
    if (model && typeof model.on === 'function') model.on('loaded', resetCamera)
    else resetCamera()
    // The viewer is live: publish its default state so the toolbar can reflect it.
    setNavMode('orbit')
    setMeasurementUnits(store.measureUnits)
    store.setReady(true)
    loading.value = false
  } catch (e) {
    // Surface the real cause (do not swallow it) so failures are diagnosable.
    console.error('[Model3DViewer] failed to load 3D model', e)
    error.value = 'Could not load the 3D preview.'
    loading.value = false
    destroy()
  }
}

// Build the markup/BCF plugin suite over the live viewer. Guarded on export
// presence (a version bump could drop one — see the plugin smoke test) and
// wrapped so a constructor failure only warns.
function makePlugins(xeokit: any) {
  const mk = (label: string, Ctor: any): any => {
    if (typeof Ctor !== 'function') return null
    try {
      return new Ctor(viewer)
    } catch (e) {
      console.warn(`[Model3DViewer] ${label} plugin unavailable`, e)
      return null
    }
  }
  sectionPlanes = mk('section planes', xeokit.SectionPlanesPlugin)
  distanceMeasurements = mk('distance measurement', xeokit.DistanceMeasurementsPlugin)
  angleMeasurements = mk('angle measurement', xeokit.AngleMeasurementsPlugin)
  annotations = mk('annotations', xeokit.AnnotationsPlugin)
  bcfViewpoints = mk('BCF viewpoints', xeokit.BCFViewpointsPlugin)
  wireAnnotationClicks()
}

// Fetch + parse the MetaModel JSON sidecar rendition, or null when there is none
// / it can't be parsed (the viewer then loads geometry only).
async function loadMetamodel(): Promise<unknown | null> {
  if (!props.metamodelUid) return null
  try {
    return JSON.parse(await renditionText(props.metamodelUid))
  } catch (e) {
    console.warn('[Model3DViewer] metamodel unavailable — loading geometry only', e)
    return null
  }
}

function destroy() {
  try {
    treeView?.destroy?.()
  } catch {
    /* ignore */
  }
  treeView = null
  // Tear the plugin suite down before the viewer (documented clean order), then
  // drop our handles so nothing dangles onto a dead viewer. Each destroy is
  // guarded — a plugin may be absent or already gone.
  for (const plugin of [sectionPlanes, distanceMeasurements, angleMeasurements, annotations, bcfViewpoints]) {
    try {
      plugin?.destroy?.()
    } catch {
      /* ignore */
    }
  }
  sectionPlanes = distanceMeasurements = angleMeasurements = annotations = bcfViewpoints = null
  try {
    viewer?.destroy?.()
  } catch {
    /* ignore */
  }
  viewer = null
  // The live viewer is gone — clear the mirrored state so the toolbar doesn't
  // reflect a viewer that no longer exists.
  store.resetViewerState()
}

// ---------------------------------------------------------------------------
// Imperative API (the plugin host's surface). Every method is defensive — the
// SDK is untyped and a plugin may be absent — and mirrors any state the markup
// toolbar / annotation layer needs into the model3d store.
// ---------------------------------------------------------------------------

// Capture the current view as a BCF-2.1 viewpoint (camera + visibility +
// selection + clipping planes + optional snapshot). This is the `anchor.viewpoint`
// the annotation/BCF layers persist and round-trip (§4).
function getViewpoint(options?: unknown): unknown {
  try {
    return bcfViewpoints?.getViewpoint?.(options) ?? null
  } catch {
    return null
  }
}

// Restore a previously captured viewpoint — the deep-link "take me to exactly
// what the author framed, cut-planes and all" primitive (§9).
function setViewpoint(viewpoint: unknown, options?: unknown) {
  try {
    bcfViewpoints?.setViewpoint?.(viewpoint, options)
  } catch {
    /* best-effort */
  }
}

// Capture the current view as a model-viewpoint annotation anchor (§9): the BCF
// viewpoint (camera + visibility + selection + clipping + snapshot) plus an
// optional world-space marker. object_refs stay empty until the §5.2 metamodel
// lands — camera/section-only anchors work now. Returns null if there is no
// viewpoint (e.g. the BCF plugin is unavailable).
function captureViewpointAnchor(
  marker?: { x: number; y: number; z: number },
  objectId?: string,
): ModelViewpointAnchor | null {
  const viewpoint = getViewpoint()
  if (!viewpoint) return null
  return {
    kind: 'model-viewpoint',
    schema: 'fileengine.anchor.v1',
    viewpoint,
    ...(marker ? { marker } : {}),
    // A picked object anchors the annotation to a real element (source-tagging
    // lands with the §5.2 metamodel; the id is the xeokit entity id today).
    object_refs: objectId ? [{ id: objectId }] : [],
  }
}

// Ctrl/⌘ + left-click opens the on-model menu — plain left/right buttons stay free
// for navigation (pan/orbit). metaKey covers macOS ⌘.
function onCanvasClick(e: MouseEvent) {
  if ((e.ctrlKey || e.metaKey) && e.button === 0) {
    e.preventDefault()
    openObjectMenu(e)
  }
}

// Pick the object/surface under the cursor and ask the host to open a context menu
// there (the marker/object/normal flow into an annotation or a section plane).
// Triggered by right-click or Ctrl/⌘+left-click.
function openObjectMenu(e: MouseEvent) {
  if (!viewer || !canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const canvasPos = [e.clientX - rect.left, e.clientY - rect.top]
  let hit: { entity?: { id?: string }; worldPos?: number[]; worldNormal?: number[] } | null = null
  try {
    hit = viewer.scene?.pick?.({ canvasPos, pickSurface: true }) ?? null
  } catch {
    hit = null
  }
  const objectId = hit?.entity?.id
  if (!objectId) {
    emit('object-context', null) // empty space → dismiss any open menu
    return
  }
  const toVec = (a?: number[]) =>
    Array.isArray(a) && a.length >= 3 ? { x: a[0], y: a[1], z: a[2] } : undefined
  highlightObjects([String(objectId)]) // show what was picked
  emit('object-context', {
    clientX: e.clientX,
    clientY: e.clientY,
    objectId: String(objectId),
    worldPos: toVec(hit?.worldPos),
    worldDir: toVec(hit?.worldNormal), // slice-plane direction at the surface
  })
}

// One model-viewpoint annotation to render as an in-scene marker.
interface AnnotationMarker {
  id: string
  threadId: string
  marker?: { x: number; y: number; z: number }
  viewpoint: unknown
}

// Render the given annotations as in-scene markers (§9). Each needs a world-space
// marker point; camera-only annotations have no badge but still exist as comments.
// Clicking a marker restores its viewpoint and activates its thread (see
// wireAnnotationClicks). Rebuilds the marker set each call.
function renderAnnotations(items: AnnotationMarker[]) {
  if (!annotations) return
  try {
    annotations.clear?.()
    annotationMeta = {}
    for (const it of items || []) {
      if (!it.marker) continue
      const aid = 'ann-' + it.id
      annotations.createAnnotation?.({
        id: aid,
        worldPos: [it.marker.x, it.marker.y, it.marker.z],
        occludable: true,
        markerShown: true,
        labelShown: false,
      })
      annotationMeta[aid] = { threadId: it.threadId, viewpoint: it.viewpoint }
    }
  } catch {
    /* best-effort */
  }
}

// One-time wiring: clicking any annotation marker restores its saved viewpoint and
// asks the host to focus the matching thread.
function wireAnnotationClicks() {
  try {
    annotations?.on?.('markerClicked', (annotation: { id?: string }) => {
      const meta = annotationMeta[annotation?.id ?? '']
      if (!meta) return
      if (meta.viewpoint) setViewpoint(meta.viewpoint)
      emit('annotation-activate', meta.threadId)
    })
  } catch {
    /* best-effort */
  }
}

// PNG data-URL of the current canvas — the annotation / BCF snapshot.
function captureSnapshot(opts?: { width?: number; height?: number }): string | null {
  try {
    return viewer?.getSnapshot?.({ format: 'png', ...(opts || {}) }) ?? null
  } catch {
    return null
  }
}

function syncSectionPlanes() {
  const planes = sectionPlanes?.sectionPlanes || {}
  store.setSectionPlanes(Object.keys(planes))
}

// Add a cut-away plane (Workstream B). Returns its id; mirrors the live plane set
// into the store so viewpoints capture them and annotations restore them.
function addSectionPlane(cfg?: { pos?: number[]; dir?: number[] }): string | null {
  try {
    const plane = sectionPlanes?.createSectionPlane?.(cfg || {})
    if (plane?.id != null) {
      syncSectionPlanes()
      return String(plane.id)
    }
  } catch {
    /* best-effort */
  }
  return null
}

function clearSectionPlanes() {
  try {
    sectionPlanes?.hideControl?.()
  } catch {
    /* ignore */
  }
  try {
    sectionPlanes?.clear?.()
  } catch {
    /* ignore */
  }
  syncSectionPlanes()
}

// Centre of the model's bounding box — the anchor for axis quick-cuts / the box.
function sceneCenter(): number[] | null {
  const aabb = viewer?.scene?.aabb
  if (!aabb || aabb.length < 6) return null
  return [(aabb[0] + aabb[3]) / 2, (aabb[1] + aabb[4]) / 2, (aabb[2] + aabb[5]) / 2]
}

// Axis-aligned quick-cut through the model centre (§7). Shows the drag control on
// the new plane so it can be slid/rotated immediately. Returns the plane id.
function addAxisSection(axis: 'x' | 'y' | 'z'): string | null {
  const c = sceneCenter()
  if (!c) return null
  const dir = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1]
  const id = addSectionPlane({ pos: c, dir })
  if (id) editSectionPlane(id)
  return id
}

// A 6-plane "section box" at the bounding-box faces (§7) — drag the faces inward
// to isolate a region. Each plane's normal points into the box. Returns the ids.
function addSectionBox(): string[] {
  const aabb = viewer?.scene?.aabb
  if (!aabb || aabb.length < 6) return []
  const cx = (aabb[0] + aabb[3]) / 2
  const cy = (aabb[1] + aabb[4]) / 2
  const cz = (aabb[2] + aabb[5]) / 2
  const faces = [
    { pos: [aabb[0], cy, cz], dir: [1, 0, 0] },
    { pos: [aabb[3], cy, cz], dir: [-1, 0, 0] },
    { pos: [cx, aabb[1], cz], dir: [0, 1, 0] },
    { pos: [cx, aabb[4], cz], dir: [0, -1, 0] },
    { pos: [cx, cy, aabb[2]], dir: [0, 0, 1] },
    { pos: [cx, cy, aabb[5]], dir: [0, 0, -1] },
  ]
  const ids: string[] = []
  for (const f of faces) {
    const id = addSectionPlane(f)
    if (id) ids.push(id)
  }
  return ids
}

// Flip a plane's cut direction (show the other half) — §7.
function flipSectionPlane(id: string) {
  try {
    sectionPlanes?.sectionPlanes?.[id]?.flipDir?.()
  } catch {
    /* best-effort */
  }
}

// Per-plane visibility: enable/disable a plane without removing it (§7).
function setSectionPlaneActive(id: string, active: boolean) {
  try {
    const plane = sectionPlanes?.sectionPlanes?.[id]
    if (plane) plane.active = active
  } catch {
    /* best-effort */
  }
}

// Show the interactive drag/rotate control on a plane (click a plane to edit) — §7.
function editSectionPlane(id: string) {
  try {
    sectionPlanes?.showControl?.(id)
  } catch {
    /* best-effort */
  }
}

// Activate a transient measurement tool (or 'none' to stop). Only one at a time.
// Snapping to vertices/edges is enabled so picks land on real geometry (§8).
function startMeasurement(kind: MeasureTool) {
  try {
    distanceMeasurements?.control?.deactivate?.()
    angleMeasurements?.control?.deactivate?.()
    if (kind === 'distance' && distanceMeasurements?.control) {
      distanceMeasurements.control.snapping = true
      distanceMeasurements.control.activate?.()
    } else if (kind === 'angle' && angleMeasurements?.control) {
      angleMeasurements.control.snapping = true
      angleMeasurements.control.activate?.()
    }
  } catch {
    /* best-effort */
  }
  store.setActiveTool(kind)
}

// Remove all measurements (they are transient viewer aids by default; a
// measurement is only persisted when promoted into an annotation — §9).
function clearMeasurements() {
  try {
    distanceMeasurements?.clear?.()
  } catch {
    /* ignore */
  }
  try {
    angleMeasurements?.clear?.()
  } catch {
    /* ignore */
  }
}

// Measurement display units (§8). xeokit's Metrics drives what the measurement
// labels show; BCF export is always metres regardless (§17).
const XEOKIT_UNITS: Record<MeasureUnits, string> = {
  mm: 'millimeters',
  m: 'meters',
  ft: 'feet',
}
function setMeasurementUnits(units: MeasureUnits) {
  try {
    const metrics = viewer?.scene?.metrics
    if (metrics) metrics.units = XEOKIT_UNITS[units]
  } catch {
    /* best-effort */
  }
  store.setMeasureUnits(units)
}

// Set the camera navigation mode (orbit / first-person / plan) — Workstream A.
function setNavMode(mode: NavMode) {
  try {
    if (viewer?.cameraControl) viewer.cameraControl.navMode = mode
  } catch {
    /* best-effort */
  }
  store.setNavMode(mode)
}

// Feel defaults (§6): pivot orbiting about the point under the cursor — the single
// biggest navigation-feel win — with smart pivoting when the cursor is on empty
// space. Applied once per viewer, right after construction.
function applyCameraControlDefaults() {
  const cc = viewer?.cameraControl
  if (!cc) return
  try {
    cc.followPointer = true
    cc.smartPivot = true
  } catch {
    /* best-effort — never let a control tweak break the preview */
  }
}

// Standard orientation shortcuts (§6): top / front / iso, plus 'fit' to frame the
// whole model. They double as the seeds of saved viewpoints. Best-effort — falls
// back to the default framing when the scene AABB isn't available.
function standardView(kind: 'top' | 'front' | 'iso' | 'fit') {
  const scene = viewer?.scene
  if (!scene) return
  const aabb = kind === 'fit' ? null : scene.aabb
  if (kind === 'fit' || !aabb || aabb.length < 6) {
    resetCamera()
    return
  }
  const cx = (aabb[0] + aabb[3]) / 2
  const cy = (aabb[1] + aabb[4]) / 2
  const cz = (aabb[2] + aabb[5]) / 2
  const dx = aabb[3] - aabb[0]
  const dy = aabb[4] - aabb[1]
  const dz = aabb[5] - aabb[2]
  const dist = (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1) * 1.3
  let eye: number[]
  let up: number[]
  if (kind === 'top') {
    eye = [cx, cy + dist, cz]
    up = [0, 0, -1]
  } else if (kind === 'front') {
    eye = [cx, cy, cz + dist]
    up = [0, 1, 0]
  } else {
    const k = dist / Math.sqrt(3) // iso — equal offset on each axis
    eye = [cx + k, cy + k, cz + k]
    up = [0, 1, 0]
  }
  try {
    viewer.cameraFlight.flyTo({ eye, look: [cx, cy, cz], up })
  } catch {
    resetCamera()
  }
}

// Frame the current selection (§6): fly to the AABB of the highlighted objects,
// or the whole model when nothing is selected.
function fitToSelection() {
  const scene = viewer?.scene
  try {
    const ids: string[] = scene?.highlightedObjectIds || []
    if (ids.length && typeof scene.getAABB === 'function') {
      viewer.cameraFlight.flyTo({ aabb: scene.getAABB(ids) })
      return
    }
  } catch {
    /* best-effort */
  }
  resetCamera()
}

// Highlight a set of objects by id (clearing any prior highlight) and record the
// selection. Centering-on-object within a restored view is annotation deep-link
// work (§9); this is the primitive it builds on.
function highlightObjects(ids: string[]) {
  const scene = viewer?.scene
  try {
    const prev: string[] = scene?.highlightedObjectIds || []
    if (prev.length) scene?.setObjectsHighlighted?.(prev, false)
    if (ids?.length) scene?.setObjectsHighlighted?.(ids, true)
  } catch {
    /* best-effort */
  }
  store.setSelection(ids || [])
}

// Called by the overlay when the sidebar collapses/expands so xeokit recomputes
// the viewport for the new canvas size.
function resize() {
  viewer?.scene?.canvas?.resize?.()
}

// xeokit's default *dolly* (zoom) rates, tuned for building-scale models — they
// step far too coarsely on small CAD parts. `navStep` is the slider value; its
// halfway position, NAV_STEP_DEFAULT, equals the wheel-dolly default, so
// navStep/NAV_STEP_DEFAULT is the scale factor applied uniformly to every rate.
// Panning is scaled by the same factor, but through camera.pan (see
// patchCameraPan) rather than a config — so zoom and pan stay in lockstep.
const NAV_STEP_DEFAULT = 100
const XEOKIT_DOLLY_RATES: Record<string, number> = {
  mouseWheelDollyRate: 100,
  keyboardDollyRate: 10,
  touchDollyRate: 0.2,
}

function applyNavStep() {
  const cc = viewer?.cameraControl
  if (!cc) return
  const scale = props.navStep / NAV_STEP_DEFAULT
  try {
    for (const [rate, base] of Object.entries(XEOKIT_DOLLY_RATES)) cc[rate] = base * scale
  } catch {
    /* best-effort — never let a control tweak break the preview */
  }
}

// Scale panning by the same nav factor as zoom. xeokit exposes no mouse-pan rate
// (mouse drag-pan uses a hardcoded factor; only keyboard/touch have rate configs),
// but *every* pan mode funnels through camera.pan(vec) — so we wrap it once to
// scale the pan vector, reading navStep live so the slider takes effect
// immediately. A fresh array is passed through (we never mutate xeokit's reused
// delta) so momentum/inertia frames scale correctly too. At the halfway default
// (scale 1) it's a no-op. Programmatic framing uses cameraFlight, not camera.pan,
// so "Reset camera" is unaffected. Because pan is governed here, the keyboard/
// touch pan-rate configs are intentionally left at their defaults (no double-scale).
function patchCameraPan() {
  const cam = viewer?.camera
  if (!cam || cam.__navPanPatched) return
  try {
    const pan = cam.pan.bind(cam)
    cam.pan = (vec: number[]) => {
      const scale = props.navStep / NAV_STEP_DEFAULT
      pan([vec[0] * scale, vec[1] * scale, vec[2] * scale])
    }
    cam.__navPanPatched = true
  } catch {
    /* best-effort — panning simply stays at xeokit's default scale */
  }
}

// Fly the camera back to the default view (frames the whole model). Exposed for
// the overlay's "Reset camera" button; no-op until the model is loaded.
function resetCamera() {
  try {
    viewer?.cameraFlight?.flyTo?.(viewer.scene)
  } catch {
    /* best-effort */
  }
}

// Load after mount (the canvas ref must exist); reload if the model changes.
onMounted(load)
watch(() => props.xktUid, load)
// Live-apply slider changes to the already-running viewer (no reload needed).
watch(() => props.navStep, applyNavStep)
onBeforeUnmount(destroy)
defineExpose({
  // camera / canvas (existing)
  resize,
  resetCamera,
  // markup / BCF imperative API (§5.3) — the plugin host's surface
  getViewpoint,
  setViewpoint,
  captureViewpointAnchor,
  renderAnnotations,
  captureSnapshot,
  addSectionPlane,
  addAxisSection,
  addSectionBox,
  flipSectionPlane,
  setSectionPlaneActive,
  editSectionPlane,
  clearSectionPlanes,
  startMeasurement,
  clearMeasurements,
  setMeasurementUnits,
  setNavMode,
  standardView,
  fitToSelection,
  highlightObjects,
})

async function downloadOriginal() {
  try {
    const blob = await fileService.downloadFile(props.xktUid)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'model.xkt'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    /* best effort */
  }
}
</script>

<style scoped>
.m3d {
  position: relative;
  width: 100%;
  height: 100%;
  background: #1b1d21;
}
.m3d-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}
.m3d-navcube {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 120px;
  height: 120px;
  z-index: 2;
}
.m3d-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
}
.m3d-muted {
  color: #aab;
}
.m3d-err {
  color: #f3b0b0;
}
</style>
