<template>
  <div class="m3d" ref="rootEl">
    <canvas ref="canvasEl" class="m3d-canvas"></canvas>
    <!-- Navigation cube: a small in-canvas corner widget, always available
         (even when the overlay sidebar is collapsed). -->
    <canvas ref="navCubeEl" class="m3d-navcube"></canvas>

    <p v-if="loading" class="m3d-state m3d-muted">Loading 3D model…</p>
    <div v-else-if="error" class="m3d-state m3d-err">
      <p>{{ error }}</p>
      <button class="link" @click="downloadOriginal">⬇ Download original</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, defineExpose } from 'vue'
import { renditionArrayBuffer } from '@/services/renditions'
import { fileService } from '@/services/fileService'

// `xktUid` is the rendition child's uid (the .xkt bytes). `treeContainerId`
// (optional) is the id of the sidebar element the object tree mounts into.
const props = defineProps<{
  xktUid: string
  treeContainerId?: string
}>()

const rootEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const navCubeEl = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)
const error = ref('')

// xeokit handles (kept untyped — the SDK is loaded lazily). Disposed on unmount.
let viewer: any = null
let treeView: any = null

async function load() {
  destroy()
  if (!props.xktUid || !canvasEl.value) return
  loading.value = true
  error.value = ''
  try {
    // Lazy-load the (large, AGPL) xeokit SDK only when a model is actually opened.
    const xeokit: any = await import('@xeokit/xeokit-sdk')
    viewer = new xeokit.Viewer({ canvasElement: canvasEl.value, transparent: true })

    // The core requirement is rendering the model. The nav-cube, object tree and
    // camera fit are *enhancements* — a failure in any of them (e.g. a model with
    // no metadata for the tree) must never break the preview, so each is isolated.
    try {
      if (navCubeEl.value) new xeokit.NavCubePlugin(viewer, { canvasElement: navCubeEl.value })
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

    const loader = new xeokit.XKTLoaderPlugin(viewer)
    const xkt = await renditionArrayBuffer(props.xktUid)
    const model = loader.load({ id: 'model', xkt })
    const fit = () => {
      try {
        viewer.cameraFlight?.flyTo?.(viewer.scene)
      } catch {
        /* camera fit is best-effort */
      }
    }
    if (model && typeof model.on === 'function') model.on('loaded', fit)
    else fit()
    loading.value = false
  } catch (e) {
    // Surface the real cause (do not swallow it) so failures are diagnosable.
    console.error('[Model3DViewer] failed to load 3D model', e)
    error.value = 'Could not load the 3D preview.'
    loading.value = false
    destroy()
  }
}

function destroy() {
  try {
    treeView?.destroy?.()
  } catch {
    /* ignore */
  }
  treeView = null
  try {
    viewer?.destroy?.()
  } catch {
    /* ignore */
  }
  viewer = null
}

// Called by the overlay when the sidebar collapses/expands so xeokit recomputes
// the viewport for the new canvas size.
function resize() {
  viewer?.scene?.canvas?.resize?.()
}

// Load after mount (the canvas ref must exist); reload if the model changes.
onMounted(load)
watch(() => props.xktUid, load)
onBeforeUnmount(destroy)
defineExpose({ resize })

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
