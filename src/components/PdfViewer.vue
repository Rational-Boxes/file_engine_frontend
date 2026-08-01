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
  Embedded PDF.js viewer (Phase 7.1). Replaces the naive <iframe> preview: we drive
  the PDF.js engine ourselves so the SPA can (a) offer the AnnotationEditorLayer
  markup tools and (b) read the edited bytes back via saveDocument() — which the
  browser's own opaque viewer never exposes.

  This whole component (and the heavy pdfjs-dist library it statically imports) is
  lazy-loaded by DocumentPreview via defineAsyncComponent, so it stays out of the
  main bundle and only loads when a PDF is opened — the same "load on demand" posture
  as the xeokit 3D SDK.

  Contract:
    props   src (blob/object URL), editable (enable markup tools), fullWidth (sizing)
    emits   ready | error(msg) | dirty(boolean, has unsaved markup)
    exposes saveBytes(): Promise<Uint8Array>   — the edited PDF (annotations baked in)
            hasEdits(): boolean
            setMode(name)                        — switch the active markup tool
-->
<template>
  <div class="pv" :class="{ 'pv-full': fullWidth }">
    <!-- Markup toolbar — only in editable (annotate) mode. PDF.js ships no Save
         button, so the embedder (DocumentPreview) wires Save; here we only switch
         the AnnotationEditorLayer tool. -->
    <div v-if="editable" class="pv-toolbar" role="toolbar" aria-label="Markup tools">
      <span class="pv-toolbar-label">✎ Markup</span>
      <button
        v-for="t in TOOLS"
        :key="t.name"
        class="pv-tool"
        :class="{ on: mode === t.name }"
        :title="t.title"
        type="button"
        @click="setMode(t.name)"
      >{{ t.icon }} {{ t.label }}</button>
      <span class="pv-spacer"></span>
      <span v-if="dirty" class="pv-dirty" title="Unsaved markup">● unsaved markup</span>
    </div>

    <!-- PDF.js requires its `container` (pv-container) to be absolutely positioned
         inside a positioned box (pv-stage) with a resolved height; the inner
         .pdfViewer div is the element the library manages — do not touch its DOM. -->
    <div class="pv-stage" :class="{ 'pv-stage-full': fullWidth }">
      <div ref="containerRef" class="pv-container">
        <div ref="viewerRef" class="pdfViewer"></div>
      </div>
    </div>

    <p v-if="err" class="pv-err">{{ err }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, onMounted } from 'vue'

// pdfjs-dist is heavy, so it is dynamic-imported on first render (see ensureLib):
// the library, its viewer components, CSS, and worker land in their own chunk,
// fetched only when a PDF is actually shown — the same lazy posture as the xeokit
// 3D SDK. This component itself stays cheap to import statically.
/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfLib = typeof import('pdfjs-dist')
type ViewerLib = typeof import('pdfjs-dist/web/pdf_viewer.mjs')
let lib: PdfLib | null = null
let vlib: ViewerLib | null = null

async function ensureLib(): Promise<void> {
  if (lib && vlib) return
  // The prebuilt viewer components read the main library from `globalThis.pdfjsLib`
  // at module-eval time (web/pdf_viewer.mjs: `const { AbortException, … } =
  // globalThis.pdfjsLib`), so the main library MUST be imported and exposed on the
  // global BEFORE the viewer module is imported — not in parallel.
  const pdf = await import('pdfjs-dist')
  ;(globalThis as unknown as { pdfjsLib?: unknown }).pdfjsLib = pdf
  const [viewer, worker] = await Promise.all([
    import('pdfjs-dist/web/pdf_viewer.mjs'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  await import('pdfjs-dist/web/pdf_viewer.css')
  // Self-hosted worker URL (no CDN) — Vite fingerprints + serves it locally.
  pdf.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default
  lib = pdf
  vlib = viewer
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type ToolName = 'none' | 'highlight' | 'text' | 'draw' | 'image' | 'signature'

const props = defineProps<{
  src: string
  editable?: boolean
  fullWidth?: boolean
}>()

const emit = defineEmits<{
  (e: 'ready'): void
  (e: 'error', message: string): void
  // Unsaved markup: markup added since load or since the last markSaved().
  (e: 'dirty', dirty: boolean): void
  // Any markup present on the document (stays true after a save; false once cleared).
  (e: 'has-markup', present: boolean): void
}>()

const TOOLS: { name: ToolName; label: string; title: string; icon: string }[] = [
  { name: 'none', label: 'Select', title: 'Select / move', icon: '➤' },
  { name: 'highlight', label: 'Highlight', title: 'Highlight text', icon: '▤' },
  { name: 'text', label: 'Text', title: 'Add a text note', icon: 'T' },
  { name: 'draw', label: 'Draw', title: 'Freehand ink', icon: '✎' },
  { name: 'image', label: 'Image', title: 'Insert an image / stamp', icon: '🖼' },
  { name: 'signature', label: 'Sign', title: 'Add a signature', icon: '✒' },
]

// Map our tool names to PDF.js AnnotationEditorType. Read the enum at runtime so we
// never hard-code its numeric values; a member absent in this pdfjs version maps to
// NONE (the tool button becomes a no-op rather than throwing).
function editorType(name: ToolName): number {
  const T = (lib?.AnnotationEditorType ?? {}) as unknown as Record<string, number>
  const byName: Record<ToolName, number | undefined> = {
    none: T.NONE,
    highlight: T.HIGHLIGHT,
    text: T.FREETEXT,
    draw: T.INK,
    image: T.STAMP,
    signature: T.SIGNATURE,
  }
  return byName[name] ?? T.NONE ?? 0
}

const containerRef = ref<HTMLDivElement | null>(null)
const viewerRef = ref<HTMLDivElement | null>(null)
const mode = ref<ToolName>('none')
const dirty = ref(false) // markup added since load / last save (the "unsaved" flag)
const hasMarkup = ref(false) // any markup present (persists across a save)
const err = ref('')

// pdfjs runtime objects held loosely — this is the external-library boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
let eventBus: InstanceType<ViewerLib['EventBus']> | null = null
let linkService: InstanceType<ViewerLib['PDFLinkService']> | null = null
let pdfViewer: InstanceType<ViewerLib['PDFViewer']> | null = null
let pdfDoc: any = null
let loadingTask: any = null
/* eslint-enable @typescript-eslint/no-explicit-any */

// A markup edit landed (annotationStorage fired onSetModified). Mark it unsaved and
// note that markup is now present. The distinction matters: markSaved() clears the
// unsaved flag but the markup stays on the document (hasMarkup remains true), so the
// user can keep adding to it and attach the cumulative state to another comment.
function markDirty() {
  if (!dirty.value) {
    dirty.value = true
    emit('dirty', true)
  }
  if (!hasMarkup.value) {
    hasMarkup.value = true
    emit('has-markup', true)
  }
}

// The current markup has been captured/saved to a comment: reset the storage's
// "modified" flag (which re-arms onSetModified for the next edit) WITHOUT removing
// the annotations, so the drawing persists on screen.
function markSaved() {
  try {
    pdfDoc?.annotationStorage?.resetModified?.()
  } catch {
    /* older storage without resetModified — dirty simply stays until reload */
  }
  if (dirty.value) {
    dirty.value = false
    emit('dirty', false)
  }
}

function buildViewer() {
  const container = containerRef.value
  const viewer = viewerRef.value
  if (!container || !viewer || !vlib) return
  eventBus = new vlib.EventBus()
  linkService = new vlib.PDFLinkService({ eventBus })
  pdfViewer = new vlib.PDFViewer({
    container,
    viewer,
    eventBus,
    linkService,
    l10n: new vlib.GenericL10n('en-US'),
    // Enabling the editor layer up front (in NONE mode) is what makes the markup
    // tools available; a read-only viewer omits it entirely.
    annotationEditorMode: props.editable ? editorType('none') : undefined,
  })
  linkService.setViewer(pdfViewer)
  // Fit the page to the width of the pane once the first page is measured.
  eventBus.on('pagesinit', () => {
    if (pdfViewer) pdfViewer.currentScaleValue = 'page-width'
  })
}

async function loadDoc() {
  if (!props.src) return
  err.value = ''
  try {
    await ensureLib()
    if (!pdfViewer) buildViewer()
    // Tear down a previous document before loading the next (src changed).
    if (loadingTask) {
      try { await loadingTask.destroy() } catch { /* already gone */ }
      loadingTask = null
    }
    dirty.value = false
    hasMarkup.value = false
    emit('dirty', false)
    emit('has-markup', false)
    loadingTask = lib!.getDocument({ url: props.src })
    pdfDoc = await loadingTask.promise
    // The canonical "the user changed the markup" signal: annotationStorage fires
    // onSetModified when an editor edit lands. (There is no annotationeditor*changed
    // eventBus event for content in this pdfjs.)
    try {
      const storage = pdfDoc.annotationStorage
      if (storage) storage.onSetModified = markDirty
    } catch {
      /* storage not available — dirty falls back to editingstateschanged */
    }
    pdfViewer?.setDocument(pdfDoc)
    linkService?.setDocument(pdfDoc, null)
    emit('ready')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to render the PDF'
    err.value = msg
    emit('error', msg)
  }
}

function setMode(name: ToolName) {
  if (!props.editable || !pdfViewer) return
  mode.value = name
  try {
    pdfViewer.annotationEditorMode = { mode: editorType(name) }
  } catch {
    /* editor layer not ready yet — ignore; the button reflects intent regardless */
  }
}

// Produce the edited PDF bytes (annotations baked in). This is the byte round-trip
// the native browser viewer never exposes — the caller PUTs these as a markup
// rendition. Throws if no document is loaded.
async function saveBytes(): Promise<Uint8Array> {
  if (!pdfDoc) throw new Error('No PDF loaded')
  return (await pdfDoc.saveDocument()) as Uint8Array
}

function destroy() {
  try { pdfViewer?.cleanup?.() } catch { /* noop */ }
  if (loadingTask) {
    try { loadingTask.destroy() } catch { /* noop */ }
    loadingTask = null
  }
  if (pdfDoc) {
    try { pdfDoc.destroy() } catch { /* noop */ }
    pdfDoc = null
  }
  pdfViewer = null
  linkService = null
  eventBus = null
}

onMounted(loadDoc)
// Rebuild on a new document OR when toggling annotate mode (the AnnotationEditorLayer
// is wired at load time, so enabling/disabling it requires a fresh viewer). A user
// toggles annotate before drawing, so no in-progress edits are lost.
watch(() => `${props.src}|${props.editable ? 1 : 0}`, () => { destroy(); loadDoc() })
onBeforeUnmount(destroy)

defineExpose({
  saveBytes,
  hasEdits: () => dirty.value, // unsaved markup?
  markSaved, // reset the unsaved flag but keep the drawing on screen
  setMode,
})
</script>

<style scoped>
.pv {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  gap: 6px;
}
.pv-full {
  flex: 1 1 auto;
}
.pv-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 5px 6px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--card);
}
.pv-toolbar-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  margin-right: 4px;
}
.pv-tool {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--fg);
  cursor: pointer;
}
.pv-tool:hover {
  background: var(--bg);
}
.pv-tool.on {
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}
.pv-spacer {
  flex: 1 1 auto;
}
.pv-dirty {
  font-size: 12px;
  color: var(--danger, #b00020);
}
/* The positioned box the absolutely-positioned container fills. Owns the frame
   chrome (border/background) and the resolved height PDF.js needs to lay out. */
.pv-stage {
  position: relative;
  width: 100%;
  height: 70vh;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  overflow: hidden;
}
.pv-stage-full {
  height: auto;
  flex: 1 1 auto;
  min-height: 0;
}
/* PDF.js requires this (its `container`) to be absolutely positioned. */
.pv-container {
  position: absolute;
  inset: 0;
  overflow: auto;
}
.pv-err {
  color: var(--danger, #b00020);
  font-size: 12px;
}
/* PDF.js positions pages absolutely within .pdfViewer relative to the container. */
.pv-container :deep(.pdfViewer) {
  position: relative;
}
</style>
