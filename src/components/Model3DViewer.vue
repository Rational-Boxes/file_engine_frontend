<template>
  <div class="m3d" ref="rootEl">
    <canvas ref="canvasEl" class="m3d-canvas"></canvas>
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
import { renditionArrayBuffer } from '@/services/renditions'
import { fileService } from '@/services/fileService'
import { useModel3dStore, type NavMode, type MeasureTool } from '@/stores/model3d'

// `xktUid` is the rendition child's uid (the .xkt bytes). `treeContainerId`
// (optional) is the id of the sidebar element the object tree mounts into.
// `navStep` is the navigation step the overlay's slider drives (see applyNavStep)
// — it scales both zoom and pan so small-scale CAD models can be navigated finely.
const props = withDefaults(
  defineProps<{
    xktUid: string
    treeContainerId?: string
    navStep?: number
  }>(),
  { navStep: 100 },
)

// xeokit-sdk #2016: the NavCubePlugin shader crashes ("Missing input
// materialEmissive") in 2.6.104–2.6.112. Keep the integration but off until fixed.
const NAVCUBE_ENABLED = false

const store = useModel3dStore()

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
    const model = loader.load({ id: 'model', xkt })
    // Frame the whole model once it's loaded — this is the default camera view
    // that the overlay's "Reset camera" button returns to.
    if (model && typeof model.on === 'function') model.on('loaded', resetCamera)
    else resetCamera()
    // The viewer is live: publish its default state so the toolbar can reflect it.
    setNavMode('orbit')
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
    sectionPlanes?.clear?.()
  } catch {
    /* ignore */
  }
  syncSectionPlanes()
}

// Activate a transient measurement tool (or 'none' to stop). Only one at a time.
function startMeasurement(kind: MeasureTool) {
  try {
    distanceMeasurements?.control?.deactivate?.()
    angleMeasurements?.control?.deactivate?.()
    if (kind === 'distance') distanceMeasurements?.control?.activate?.()
    else if (kind === 'angle') angleMeasurements?.control?.activate?.()
  } catch {
    /* best-effort */
  }
  store.setActiveTool(kind)
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
  captureSnapshot,
  addSectionPlane,
  clearSectionPlanes,
  startMeasurement,
  setNavMode,
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
