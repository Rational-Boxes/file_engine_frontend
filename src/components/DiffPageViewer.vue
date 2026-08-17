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

<!--
  The 2D diff view engine — consumes difference_service's §7.2 SVG contract.

  Each page is an SVG carrying three layer groups with stable ids (#diff-old,
  #diff-new, #diff-changes) and a `data-diff-state` on every element. Switching
  between before / after / difference is therefore just showing and hiding those
  groups: NO re-fetch, which is the whole point of the contract and what makes
  flipping views instant.

  Colours live here, not in the SVG. The service ships semantic state only, so the
  palette below is the single place red/green/orange is decided and a theme can
  restyle a stored diff without regenerating anything.

  One engine drives BOTH modes: a raster page embeds bitmaps inside the identical
  layer structure, so nothing here needs to know whether a page was vectorised —
  it reads the per-page mode only to label the page for the user.
-->

<template>
  <div class="dv-root">
    <div class="dv-bar">
      <div class="dv-views" role="group" aria-label="Comparison view">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          class="dv-view"
          :class="{ active: view === v.id }"
          :aria-pressed="view === v.id"
          :title="v.help"
          @click="view = v.id"
        >
          {{ v.label }}
        </button>
      </div>

      <nav v-if="pages.length > 1" class="dv-pages" aria-label="Pages">
        <button class="dv-nav" :disabled="pageIndex === 0" title="Previous page" @click="step(-1)">‹</button>
        <span class="dv-page-lbl">Page {{ pageIndex + 1 }} / {{ pages.length }}</span>
        <button
          class="dv-nav"
          :disabled="pageIndex >= pages.length - 1"
          title="Next page"
          @click="step(1)"
        >›</button>
      </nav>

      <div class="dv-zoom" role="group" aria-label="Zoom">
        <button class="dv-nav" title="Zoom out" aria-label="Zoom out" @click="zoomBy(1 / STEP)">−</button>
        <button
          class="dv-zoom-lbl"
          :title="atFit ? 'Fitted to the window' : 'Reset to fit the window'"
          @click="fit"
        >{{ Math.round(zoom * 100) }}%</button>
        <button class="dv-nav" title="Zoom in" aria-label="Zoom in" @click="zoomBy(STEP)">+</button>
        <button class="dv-nav dv-fit" :disabled="atFit" title="Fit the page to the window" @click="fit">Fit</button>
      </div>

      <span v-if="currentMode" class="dv-mode" :class="`mode-${currentMode}`" :title="modeHelp">
        {{ modeLabel }}
      </span>

      <span class="dv-legend" aria-hidden="true">
        <span class="dv-key added">added</span>
        <span class="dv-key deleted">deleted</span>
        <span class="dv-key modified">modified</span>
      </span>
    </div>

    <p v-if="error" class="dv-err">{{ error }}</p>
    <p v-else-if="loading" class="dv-muted">Loading page…</p>

    <!-- A page no tier could render still occupies its slot, so the document's
         page numbering stays truthful; saying so plainly beats an empty page that
         reads as "nothing changed here". -->
    <p v-else-if="currentMode === 'unavailable'" class="dv-muted dv-unavailable">
      No comparison could be produced for this page. Use <em>Before</em> / <em>After</em>
      on the original file to inspect it.
    </p>

    <!--
      Zoom and pan are the difference between a usable comparison of an
      engineering drawing and a picture of one. At fit-width a B1 sheet's
      dimension text is a few pixels tall, so "what changed" is legible only
      close up — and a reviewer needs to get there without leaving the page.

      The stage is a fixed viewport; the canvas inside it is transformed. The SVG
      itself is untouched, so zooming re-renders the vectors at the new scale
      rather than magnifying pixels — which is the whole reason the service ships
      vectors instead of images.
    -->
    <div
      v-else
      ref="stageEl"
      class="dv-stage"
      :class="{ panning, pannable: zoom > 1 }"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="fit"
    >
      <div
        class="dv-canvas"
        :class="[`view-${view}`, `mode-${currentMode}`]"
        :style="canvasStyle"
        v-html="svg"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { renditionText } from '@/services/renditions'
import { errorMessage } from '@/services/apiClient'
import type { DiffChildRef, DiffMode } from '@/services/differenceService'

type ViewId = 'before' | 'after' | 'difference'

const props = defineProps<{
  pages: DiffChildRef[]
  /**
   * Restore a comment's captured position: page, view, and where on the sheet the
   * author was looking. The last matters most for drawings — "page 3, difference"
   * is not a location when page 3 is a B1 sheet.
   */
  initialPage?: number
  initialView?: ViewId
  initialZoom?: number
  initialPanX?: number
  initialPanY?: number
}>()

// Where the reader is looking. A comment anchored to a comparison records this, so
// restoring one lands on the same page in the same view rather than the default.
const emit = defineEmits<{
  (e: 'state', s: { page: number; view: ViewId; zoom: number; panX: number; panY: number }): void
}>()

const VIEWS: Array<{ id: ViewId; label: string; help: string }> = [
  { id: 'before', label: 'Before', help: 'The base version on its own' },
  { id: 'after', label: 'After', help: 'The target version on its own' },
  { id: 'difference', label: 'Difference', help: 'Only what changed, over the page' },
]

const view = ref<ViewId>(props.initialView ?? 'difference')
const pageIndex = ref(props.initialPage ?? 0)
const svg = ref('')
const loading = ref(false)
const error = ref('')

// Fetched SVGs are cached per rendition uid: flipping back to a page the reader
// has already seen must not re-download it.
const cache = new Map<string, string>()

const current = computed<DiffChildRef | undefined>(() => props.pages[pageIndex.value])
const currentMode = computed<DiffMode | ''>(() => current.value?.mode ?? '')

const modeLabel = computed(() => {
  switch (currentMode.value) {
    case 'vector': return 'vector'
    case 'raster': return 'scanned'
    case 'hybrid': return 'hybrid'
    case 'unavailable': return 'unavailable'
    default: return String(currentMode.value || '')
  }
})

const modeHelp = computed(() => {
  switch (currentMode.value) {
    case 'vector':
      return 'Compared object by object — text and shapes are matched individually.'
    case 'raster':
      return 'This page is scanned or image-only, so it was compared as an image: '
        + 'changed regions are highlighted rather than individual objects.'
    case 'hybrid':
      return 'Text was compared semantically; the graphics layer as an image.'
    case 'unavailable':
      return 'No comparison could be produced for this page.'
    default:
      return ''
  }
})

// ------------------------------------------------------------------ zoom/pan
//
// 1.0 is "fits the window", not "actual size": the SVG is laid out at the width
// of its container, so fit-width is the only scale with a meaning independent of
// the reader's monitor. Percentages are therefore relative to fit, which is what
// the label says and what a drawing reviewer actually thinks in.
const STEP = 1.25
const MIN_ZOOM = 1        // below fit there is nothing to see — the page is already whole
const MAX_ZOOM = 24       // enough to read a dimension callout on a large sheet

const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const panning = ref(false)
const stageEl = ref<HTMLElement | null>(null)

let dragFrom: { x: number; y: number; panX: number; panY: number } | null = null

const atFit = computed(() => zoom.value === 1 && panX.value === 0 && panY.value === 0)

const canvasStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: '0 0',
}))

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

// Keep the page inside the viewport: panning a drawing off-screen and having to
// hunt for it is a worse failure than a slightly restrictive drag.
function clampPan() {
  const el = stageEl.value
  if (!el) return
  const overflowX = el.clientWidth * (zoom.value - 1)
  const overflowY = el.scrollHeight * zoom.value - el.clientHeight
  panX.value = Math.min(0, Math.max(-overflowX, panX.value))
  panY.value = Math.min(0, Math.max(-Math.max(0, overflowY), panY.value))
}

function fit() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

/** Zoom about the centre of the viewport (the toolbar buttons). */
function zoomBy(factor: number) {
  const el = stageEl.value
  zoomAbout(factor, el ? el.clientWidth / 2 : 0, el ? el.clientHeight / 2 : 0)
}

/**
 * Zoom keeping the point under (cx, cy) fixed. Anchoring to the cursor rather
 * than the centre is what makes wheel-zoom feel like moving a magnifier over the
 * drawing instead of scrolling a picture.
 */
function zoomAbout(factor: number, cx: number, cy: number) {
  const next = clampZoom(zoom.value * factor)
  if (next === zoom.value) return
  const k = next / zoom.value
  panX.value = cx - (cx - panX.value) * k
  panY.value = cy - (cy - panY.value) * k
  zoom.value = next
  if (next === 1) { panX.value = 0; panY.value = 0 } else clampPan()
}

function onWheel(e: WheelEvent) {
  const el = stageEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  // A trackpad reports fractional deltas; scaling by a fixed step per notch would
  // make it lurch, so the factor follows the delta.
  const factor = Math.exp(-e.deltaY / 300)
  zoomAbout(factor, e.clientX - r.left, e.clientY - r.top)
}

function onPointerDown(e: PointerEvent) {
  if (zoom.value === 1 || e.button !== 0) return  // nothing to pan when the page is whole
  dragFrom = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
  panning.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragFrom) return
  panX.value = dragFrom.panX + (e.clientX - dragFrom.x)
  panY.value = dragFrom.panY + (e.clientY - dragFrom.y)
  clampPan()
}

function onPointerUp(e: PointerEvent) {
  if (!dragFrom) return
  dragFrom = null
  panning.value = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    // The capture is already gone (pointercancel); nothing to release.
  }
}

function step(delta: number) {
  const next = pageIndex.value + delta
  if (next >= 0 && next < props.pages.length) pageIndex.value = next
}

async function loadPage() {
  const child = current.value
  svg.value = ''
  error.value = ''
  if (!child || !child.uid || child.mode === 'unavailable') return

  const cached = cache.get(child.uid)
  if (cached) {
    svg.value = cached
    return
  }

  loading.value = true
  try {
    const text = await renditionText(child.uid)
    cache.set(child.uid, text)
    svg.value = text
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load this page of the comparison')
  } finally {
    loading.value = false
  }
}

// Reset when a different comparison is shown, so a reader is never left on page 9
// of a two-page result — unless the caller is restoring a captured position, which
// is the whole point of the props and must not be stomped on.
watch(() => props.pages, () => {
  pageIndex.value = Math.min(props.initialPage ?? 0, Math.max(props.pages.length - 1, 0))
  if (props.initialView) view.value = props.initialView
  zoom.value = clampZoom(props.initialZoom ?? 1)
  panX.value = props.initialPanX ?? 0
  panY.value = props.initialPanY ?? 0
  loadPage()
}, { immediate: true, deep: false })

watch(pageIndex, loadPage)

// Zoom survives a page change on purpose: a reviewer checking the same detail
// across sheets should not have to zoom back in every time. It resets only when
// the comparison itself changes (the watch above), where keeping it would mean
// landing zoomed into a corner of an unrelated document.
watch([pageIndex, view, zoom, panX, panY], () => emit('state', {
  page: pageIndex.value,
  view: view.value,
  zoom: zoom.value,
  panX: panX.value,
  panY: panY.value,
}), { immediate: true })
</script>

<style scoped>
/*
 * Theme tokens are the app's own (App.vue :root / [data-theme='dark']):
 * --fg --muted --border --bg --card --primary --danger --success.
 * An earlier version invented --surface/--ink/--accent with hard-coded
 * fallbacks, which is why this panel never followed the theme: the variables
 * did not exist, so every rule silently used its fallback.
 *
 * The diff palette is declared per theme rather than fixed, because the light
 * red/green/orange that reads well on white paper is muddy on a dark surface.
 */
.dv-root {
  --diff-added: #16a34a;
  --diff-deleted: #dc2626;
  --diff-modified: #ea580c;
  /* The page itself is paper. It stays light in both themes — inverting a
     drawing would misrepresent the document, and every PDF viewer in the stack
     keeps the page white while the chrome follows the theme. */
  --diff-paper: #ffffff;
  --diff-unchanged: #111827;
}

:root[data-theme='dark'] .dv-root,
.theme-dark .dv-root {
  /* Lifted for contrast against the darker chrome; the paper stays paper. */
  --diff-added: #4ade80;
  --diff-deleted: #f87171;
  --diff-modified: #fb923c;
}

.dv-root {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  height: 100%;
}

.dv-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dv-views {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.dv-view {
  border: 0;
  background: transparent;
  color: var(--fg);
  padding: 0.3rem 0.7rem;
  cursor: pointer;
  font: inherit;
}

.dv-view.active {
  background: var(--primary);
  color: #fff;
}

.dv-pages { display: inline-flex; align-items: center; gap: 0.4rem; }
.dv-nav { border: 1px solid var(--border); background: transparent; color: var(--fg); border-radius: 4px; cursor: pointer; padding: 0.15rem 0.5rem; }
.dv-nav:disabled { opacity: 0.4; cursor: default; }
.dv-page-lbl { font-size: 0.85rem; color: var(--muted); }

.dv-mode {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
  opacity: 0.8;
}
.dv-mode { color: var(--muted); }
.dv-mode.mode-raster { border-color: var(--diff-modified); color: var(--diff-modified); }
.dv-mode.mode-unavailable { border-color: var(--muted); color: var(--muted); }

.dv-zoom { display: inline-flex; align-items: center; gap: 0.25rem; }
.dv-zoom-lbl {
  font: inherit;
  font-size: 0.8rem;
  color: var(--muted);
  background: transparent;
  border: 0;
  cursor: pointer;
  min-width: 3.2rem;      /* fixed, so the toolbar does not jitter while zooming */
  text-align: center;
}
.dv-zoom-lbl:hover { color: var(--fg); }
.dv-fit { font-size: 0.8rem; }

.dv-legend { margin-left: auto; display: inline-flex; gap: 0.6rem; font-size: 0.75rem; }
.dv-key::before {
  content: '';
  display: inline-block;
  width: 0.7em; height: 0.7em;
  margin-right: 0.25em;
  border-radius: 2px;
  vertical-align: baseline;
}
.dv-key.added::before { background: var(--diff-added); }
.dv-key.deleted::before { background: var(--diff-deleted); }
.dv-key.modified::before { background: var(--diff-modified); }

.dv-err { color: var(--danger); }
.dv-muted { color: var(--muted); }
.dv-unavailable { padding: 1rem; border: 1px dashed var(--border); border-radius: 6px; color: var(--muted); }

.dv-stage {
  flex: 1;
  min-height: 0;
  /* A viewport, not a scroller: the canvas inside is transformed, so letting this
     scroll as well would give two competing ways to move the same drawing. */
  overflow: hidden;
  position: relative;
  background: var(--diff-paper);
  border: 1px solid var(--border);
  border-radius: 6px;
  /* Pointer events must own the gesture for drag-pan to work under touch. */
  touch-action: none;
}

.dv-stage.pannable { cursor: grab; }
.dv-stage.panning { cursor: grabbing; }

.dv-canvas { will-change: transform; }

.dv-canvas :deep(svg) { display: block; width: 100%; height: auto; }

/*
 * View switching = showing/hiding the three layer groups (§7.2). No re-fetch, and
 * no dependence on anything inside the page beyond the stable layer ids.
 */
.dv-canvas :deep(#diff-old),
.dv-canvas :deep(#diff-new),
.dv-canvas :deep(#diff-changes) { display: none; }

.dv-canvas.view-before :deep(#diff-old) { display: block; }
.dv-canvas.view-after :deep(#diff-new) { display: block; }

/* The difference view paints the changes OVER the after-state, so a reader sees
   what changed in context rather than floating in empty space. */
.dv-canvas.view-difference :deep(#diff-new) { display: block; opacity: 0.25; }
.dv-canvas.view-difference :deep(#diff-changes) { display: block; }

/*
 * State -> colour, applied HERE rather than in the stored SVG. The service ships
 * semantic state only, so a theme change restyles existing diffs with no
 * regeneration. Vector elements are painted; raster pages carry <image> layers
 * that are tinted instead, since a bitmap has no fill to set.
 */
.dv-canvas :deep([data-diff-state='added']) { fill: var(--diff-added); stroke: var(--diff-added); }
.dv-canvas :deep([data-diff-state='deleted']) { fill: var(--diff-deleted); stroke: var(--diff-deleted); }
.dv-canvas :deep([data-diff-state='modified']) { fill: var(--diff-modified); stroke: var(--diff-modified); }
.dv-canvas :deep([data-diff-state='unchanged']) { fill: var(--diff-unchanged); stroke: var(--diff-unchanged); }

/* A path drawn with fill="none" (an unfilled stroke) must keep its stroke-only
   rendering — forcing a fill would turn every outlined rectangle into a slab. */
.dv-canvas :deep(path[fill='none']) { fill: none !important; }

/* Raster layers: tint the overlay rather than recolouring pixels. */
.dv-canvas :deep(image[data-diff-state='modified']) { filter: sepia(1) saturate(4) hue-rotate(-25deg); }
</style>
