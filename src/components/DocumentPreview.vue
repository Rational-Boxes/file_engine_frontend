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
  <div class="doc-preview">
    <p v-if="error" class="dp-err">{{ error }}</p>
    <p v-else-if="loading" class="dp-muted">Loading preview…</p>

    <template v-else>
      <div
        class="dp-combined"
        :class="{
          'dp-side-by-side': combinedActive && discussionPos === 'side',
          'dp-fit-bottom': combinedActive && discussionPos === 'bottom',
          'dp-full-min': fullWidth && !combinedActive,
          dragging,
        }"
      >
      <div class="dp-main">
      <!-- A chat-generated report carries a hidden "chatlog" provenance child;
           when present, split the preview into Document / Chat log tabs. -->
      <div v-if="set.chatlog" class="dp-tabs" role="tablist">
        <button
          class="dp-tab"
          :class="{ active: activeTab === 'document' }"
          role="tab"
          :aria-selected="activeTab === 'document'"
          @click="activeTab = 'document'"
        >
          Document
        </button>
        <button
          class="dp-tab"
          :class="{ active: activeTab === 'chatlog' }"
          role="tab"
          :aria-selected="activeTab === 'chatlog'"
          @click="selectChatlog"
        >
          🧾 Chat log
        </button>
      </div>

      <!-- Document tab: the report preview (PDF / video / still image). -->
      <template v-if="activeTab === 'document'">
      <!-- Inline PDF viewer (Phase 7.1) — PDF.js, replacing the old <iframe>. The
           heavy library is dynamic-imported inside PdfViewer. For a user with WRITE
           the markup toolbar is always shown (editable) so the tools are obvious;
           reshowing a comment's marked-up copy loads that rendition read-only. -->
      <div v-if="viewerSrc" class="dp-pdf">
        <PdfViewer
          ref="pdfViewerRef"
          :key="markupView ? `markup:${markupView.renditionUid}` : `doc:${viewerNonce}`"
          :src="viewerSrc"
          :editable="canAnnotate"
          :full-width="fullWidth"
          @dirty="pdfDirty = $event"
          @has-markup="pdfHasMarkup = $event"
          @download="downloadPdf"
          @error="error = $event"
        />
        <div class="dp-actions">
          <template v-if="markupView">
            <span class="dp-markup-tag">📄 Marked-up copy{{ markupView.name ? ` — ${markupView.name}` : '' }}</span>
            <button class="link" @click="closeMarkupView">← Back to document</button>
            <button class="link" :disabled="markupDownloading" @click="downloadMarkupView">⬇ Download this copy</button>
          </template>
          <template v-else>
            <!-- No separate save step: markup is uploaded + linked automatically when a
                 comment is posted (attachMarkup). The markup persists after saving, so
                 you can add more and attach it to a further comment. -->
            <span v-if="canAnnotate && pdfDirty" class="dp-hint dp-hint-live">
              ● Your markup will be saved with your next comment
            </span>
            <span v-else-if="canAnnotate" class="dp-hint">✎ Mark up with the toolbar; it saves with your comment</span>
            <!-- Discard all markup and return to the clean original (guarded). -->
            <button v-if="canAnnotate && pdfHasMarkup" class="link" @click="clearMarkup">↺ Return to original</button>
            <!-- The source file itself (for an Office doc that's the .docx/.xlsx). The
                 PDF being viewed is downloaded from the toolbar's ⬇ button instead. -->
            <button class="link" @click="downloadOriginal">⬇ Download original</button>
            <button class="link" @click="openLocation">📂 Open file location</button>
          </template>
        </div>
      </div>

      <!-- Inline video player — the poster frame becomes the <video> poster. -->
      <div v-else-if="videoUrl" class="dp-pdf">
        <video
          :src="videoUrl"
          :poster="previewUrl || undefined"
          class="dp-frame dp-video"
          :class="{ 'dp-frame-full': fullWidth }"
          controls
          autoplay
        ></video>
        <div class="dp-actions">
          <button class="link" @click="downloadOriginal">⬇ Download original</button>
          <button class="link" @click="openLocation">📂 Open file location</button>
        </div>
      </div>

      <!-- Lightweight still preview image (PDF/video not fetched yet). -->
      <template v-else>
        <!-- Image zoom (overlay only): a slider + 1:1 (actual-size) reset, teleported
             into the modal's title-bar slot. A zoomed image overflows the pane, which
             scrolls to pan around it. Shown only while the still image is the media.
             (Placed before the v-if/v-else image pair so it doesn't split them.) -->
        <Teleport v-if="titlebar && showImage" :to="titlebar">
          <div class="dp-imgzoom" role="group" aria-label="Image zoom">
            <input
              class="dp-imgzoom-range"
              type="range"
              min="10"
              max="400"
              step="5"
              v-model.number="imgZoom"
              aria-label="Zoom"
              :title="`Zoom ${imgZoom}%`"
            />
            <span class="dp-imgzoom-pct">{{ imgZoom }}%</span>
            <button class="dp-imgzoom-reset" type="button" title="Actual size (1:1)" @click="resetImgZoom">1:1</button>
          </div>
        </Teleport>
        <template v-if="previewUrl">
          <!-- Overlay: a dedicated scroll pane so a zoomed image can be panned, plus a
               mini-map navigator. The pane holds ONLY the image, so its scroll metrics
               map cleanly onto the navigator's viewport box. -->
          <div v-if="fullWidth" class="dp-img-frame">
            <div ref="imgPaneRef" class="dp-img-pane" @scroll="syncNav">
              <img :src="previewUrl" class="dp-img" :style="imgStyle" alt="Preview" @load="onImgLoad" />
            </div>
            <!-- Mini-map: shown whenever the image is larger than the viewport. The box
                 marks the portion in view; click or drag it to pan. Pinned to the pane's
                 top-left (outside the scrolling content), so it stays put as you pan. -->
            <div
              v-if="showNavigator"
              class="dp-nav"
              title="Drag to pan"
              @pointerdown="startNavDrag"
              @pointermove="onNavMove"
              @pointerup="endNavDrag"
              @pointercancel="endNavDrag"
            >
              <img
                ref="navThumbRef"
                :src="previewUrl"
                class="dp-nav-thumb"
                :style="navThumbStyle"
                alt=""
                aria-hidden="true"
              />
              <div class="dp-nav-box" :style="navBoxStyle"></div>
            </div>
          </div>
          <!-- Drawer: a clickable thumbnail that opens the overlay (unchanged). -->
          <img
            v-else
            :src="previewUrl"
            class="dp-img"
            :class="{ clickable: canOpen }"
            alt="Preview"
            :title="canOpen ? openHint : ''"
            @load="onImgLoad"
            @click="canOpen && openMedia()"
          />
        </template>
        <!-- No rendition yet: ask CSAI to (re)generate the preview on demand. -->
        <template v-else>
          <p class="dp-muted">{{ generating ? 'Generating preview…' : 'No preview available yet.' }}</p>
          <button class="btn" :disabled="generating" @click="generate">
            {{ generating ? 'Generating…' : 'Generate preview' }}
          </button>
          <p v-if="genError" class="dp-err">{{ genError }}</p>
        </template>

        <!-- Inline embed/play button for a PDF/video only. A plain image has no inline
             view — its thumbnail (above) opens the overlay on click instead. -->
        <button
          v-if="previewUrl && mediaKind"
          class="btn"
          :class="{ 'btn-end': mediaKind === 'video' }"
          :disabled="opening"
          @click="openMedia"
        >
          {{ opening ? 'Opening…' : openLabel }}
        </button>

        <!-- Same file actions as the PDF/video views, so an image preview is
             consistent: get the source file, or jump to it in the browser. -->
        <div v-if="previewUrl" class="dp-actions">
          <button class="link" @click="downloadOriginal">⬇ Download original</button>
          <button class="link" @click="openLocation">📂 Open file location</button>
        </div>
      </template>
      </template>

      <!-- Chat log tab: the provenance transcript (who chatted + full transcript
           + sources), fetched on first view. Rendered in a shadow root so its own
           styles stay isolated and any embedded <script> never runs. -->
      <div v-else class="dp-chatlog">
        <p v-if="!chatlogHtml" class="dp-muted">Loading chat log…</p>
        <ShadowHtml v-else :html="chatlogHtml" bare class="dp-chatlog-body" />
      </div>
      </div><!-- /dp-main -->

      <!-- Draggable divider between preview and discussion (both orientations). -->
      <div
        v-if="combinedActive"
        class="dp-splitter"
        :class="discussionPos === 'side' ? 'vertical' : 'horizontal'"
        role="separator"
        title="Drag to resize"
        @pointerdown="startDrag"
      ></div>

      <!-- Discussion (§10b): only on the full preview surface (not the compact
           drawer). Shown alongside the preview — side-by-side or stacked, and
           minimizable to a toggle. No preview → a button that opens the overlay. -->
      <section v-if="fullWidth" class="dp-discussion" :style="discStyle">
        <ThreadPanel
          v-if="hasPreview"
          :file-uid="uid"
          :focus-thread="focusThread"
          :focus-comment="focusComment"
          embedded
          :titlebar-target="titlebar"
          :pos="discussionPos"
          :markup-provider="attachMarkup"
          :active-comment-id="activeMarkupCommentId"
          :class="['dp-thread', { 'dp-thread-min': discLayout === 'collapsed' }]"
          @layout="discLayout = $event"
          @update:pos="setPos"
          @show-markup="onShowMarkup"
        />
        <button v-else class="btn dp-discuss-btn" @click="discussionOpen = true">
          💬 Discussion
        </button>
      </section>
      </div><!-- /dp-combined -->
    </template>

    <ThreadOverlay
      v-if="fullWidth"
      :open="discussionOpen"
      :file-uid="uid"
      :name="name"
      :focus-thread="focusThread"
      :focus-comment="focusComment"
      @close="discussionOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import {
  loadRenditionSet,
  renditionObjectUrl,
  renditionText,
  revokeRenditionUrl,
  previewImage,
  createMarkupRendition,
  type RenditionSet,
} from '@/services/renditions'
import type { CommentMarkup } from '@/services/discussionService'
import ShadowHtml from '@/components/ShadowHtml.vue'
// The PDF.js viewer is a cheap component to import; it dynamic-imports the heavy
// pdfjs-dist library internally, so the library loads only when a PDF is shown —
// the same lazy posture as the xeokit 3D SDK (loaded inside Model3DViewer).
import PdfViewer from '@/components/PdfViewer.vue'
import ThreadPanel from '@/components/ThreadPanel.vue'
import ThreadOverlay from '@/components/ThreadOverlay.vue'
import { useRoute, useRouter } from 'vue-router'
import { useDiscussionDock } from '@/composables/useDiscussionDock'
import { searchService } from '@/services/searchService'
import { fileService } from '@/services/fileService'
import { usePreviewStore } from '@/stores/preview'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// Discussion (§10f deep-link). A ?thread/?comment on the route focuses the panel
// and (when there's no inline panel) auto-opens the overlay.
const discussionOpen = ref(false)
const focusThread = computed(() => (route.query?.thread as string) || undefined)
const focusComment = computed(() => (route.query?.comment as string) || undefined)

// `fullWidth` = the overlay review (PdfPreviewOverlay): the PDF is embedded in a
// full-width iframe and auto-opened. Otherwise (the narrow drawer), opening the
// PDF raises that overlay instead of cramming an iframe into the drawer — an
// overlay, NOT a route change, so the underlying view never resets.
const props = defineProps<{
  uid: string
  name?: string
  hasRenditions?: boolean
  fullWidth?: boolean
  titlebar?: string // CSS selector of the window's title-bar slot (for the minimized chip)
}>()

const preview = usePreviewStore()

const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov']
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/mp4',
}

const set = ref<RenditionSet>({})
const previewUrl = ref('') // object URL for the still preview/poster image
const pdfUrl = ref('') // object URL for the inline PDF (loaded on demand)
const videoUrl = ref('') // object URL for the inline video clip (loaded on demand)

// --- Image zoom + navigator (overlay only) ---
// imgZoom is a percentage of the image's natural size; 100 = 1:1 (actual pixels). The
// title-bar slider drives it and the "1:1" button resets to 100. A zoomed image is
// sized explicitly (see imgStyle) so it overflows its scroll pane, which pans.
const imgZoom = ref(100)
const imgNaturalW = ref(0) // natural pixel width of the loaded image (0 until it loads)
const imgNaturalH = ref(0) // natural pixel height (for the navigator's aspect ratio)
const imgPaneRef = ref<HTMLElement | null>(null) // the scrolling pane around the image
const navThumbRef = ref<HTMLElement | null>(null) // the mini-map thumbnail element
// Live scroll metrics of the pane, refreshed on scroll / zoom; drives the navigator box.
const paneMetrics = ref({ left: 0, top: 0, cw: 0, ch: 0, sw: 0, sh: 0 })
const NAV_MAX = 168 // px — the mini-map's longer side

// Read the pane's current scroll position/size so the navigator can mirror it.
function syncNav() {
  const el = imgPaneRef.value
  if (!el) return
  paneMetrics.value = {
    left: el.scrollLeft,
    top: el.scrollTop,
    cw: el.clientWidth,
    ch: el.clientHeight,
    sw: el.scrollWidth,
    sh: el.scrollHeight,
  }
}

// --- PDF markup (Phase 7.1) ---
const pdfViewerRef = ref<{
  saveBytes: () => Promise<Uint8Array>
  hasEdits: () => boolean
  markSaved: () => void
} | null>(null)
const pdfDirty = ref(false) // markup not yet attached to a comment (unsaved)
const pdfHasMarkup = ref(false) // any markup on the live document (persists across a save)
const viewerNonce = ref(0) // bump to remount the viewer (the "return to original" clear)
const canWrite = ref(false) // WRITE on the file → may annotate + save
// When set, we're reshowing a comment's saved marked-up copy (read-only) instead of
// the live document; markupUrl is that rendition's object URL.
const markupView = ref<CommentMarkup | null>(null)
const markupUrl = ref('')
const markupDownloading = ref(false)
const activeMarkupCommentId = ref<string | null>(null) // the comment whose copy is shown
const chatlogHtml = ref('') // chat provenance log HTML (fetched on demand)
const activeTab = ref<'document' | 'chatlog'>('document') // report preview vs. provenance log
const loading = ref(false)
const opening = ref(false)
const generating = ref(false)
const genError = ref('')
const error = ref('')

// A native PDF is its own inline document, so it has no `pdf` rendition — open
// the source itself. Office docs expose a `pdf` rendition instead.
const isNativePdf = computed(() => (props.name || '').toLowerCase().endsWith('.pdf'))
const canOpenPdf = computed(() => !!set.value.pdf || isNativePdf.value)
// Videos expose a web-optimized `preview` MP4 clip (the `poster` is the still).
const videoRef = computed(() => {
  const p = set.value.preview
  return p && VIDEO_EXTS.includes(p.ext.toLowerCase()) ? p : undefined
})

// What clicking the still opens: an inline PDF, an inline video, or nothing.
const mediaKind = computed<'pdf' | 'video' | null>(() =>
  canOpenPdf.value ? 'pdf' : videoRef.value ? 'video' : null,
)
// Whether the still is clickable-to-open. A PDF/video always is (inline player, or the
// overlay from the drawer). A plain image (mediaKind null) has nothing to embed, but in
// the drawer its thumbnail should still open the full preview overlay; on the full-width
// surface the image is already shown full size, so it stays inert.
const canOpen = computed(() => mediaKind.value !== null || (!props.fullWidth && !!previewUrl.value))
// Whether a document preview is actually on screen (vs. the "no preview" state).
const hasPreview = computed(() =>
  !!(previewUrl.value || pdfUrl.value || videoUrl.value || set.value.chatlog),
)
const openLabel = computed(() => (mediaKind.value === 'video' ? '▶ Preview 10 seconds' : 'Open document (PDF)'))
const openHint = computed(() =>
  mediaKind.value === 'video'
    ? 'Play the video'
    : mediaKind.value === 'pdf'
      ? 'Open the full document'
      : 'Open the full preview',
)

// What the PDF.js viewer renders: a comment's marked-up copy (read-only) when
// reshowing, else the live document.
const viewerSrc = computed(() => (markupView.value ? markupUrl.value : pdfUrl.value))
// Whether the markup toolbar is shown + editing enabled: on the full review surface,
// for a writer. Applies to BOTH the live document and a reshown marked-up copy — the
// user can add further markup to a saved copy and attach it to another comment.
const canAnnotate = computed(() => !!props.fullWidth && canWrite.value)

// The still image is the shown media (on the document tab, no PDF/video open) on the
// overlay — gates the title-bar zoom controls and the explicit zoom sizing.
const showImage = computed(
  () =>
    !!props.fullWidth &&
    activeTab.value === 'document' &&
    !viewerSrc.value &&
    !videoUrl.value &&
    !!previewUrl.value,
)
// While an image is shown on the overlay, size it explicitly so zoom is exact (width =
// natural × zoom, 1:1 at 100%) and the pane scrolls to pan. Left unset otherwise, so the
// drawer thumbnail keeps its fit-to-pane CSS (max-width:100%, object-fit).
const imgStyle = computed(() => {
  if (!showImage.value || !imgNaturalW.value) return undefined
  return {
    width: `${Math.round((imgNaturalW.value * imgZoom.value) / 100)}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    height: 'auto',
    objectFit: 'unset' as const,
  }
})

// The mini-map navigator shows whenever the image is larger than the viewport (its pane
// overflows in either axis) — i.e. whenever there is something to pan. This includes a
// tall image at fit-to-width that overflows vertically, not just images zoomed past 1:1.
const showNavigator = computed(
  () =>
    showImage.value &&
    (paneMetrics.value.sw > paneMetrics.value.cw + 1 || paneMetrics.value.sh > paneMetrics.value.ch + 1),
)
// The mini-map thumbnail's rendered size: the image's aspect ratio bounded to NAV_MAX on
// its longer side (computed from natural dims so we needn't measure the DOM node).
const navThumb = computed(() => {
  const w = imgNaturalW.value
  const h = imgNaturalH.value
  if (!w || !h) return { w: 0, h: 0 }
  return w >= h ? { w: NAV_MAX, h: Math.round((NAV_MAX * h) / w) } : { w: Math.round((NAV_MAX * w) / h), h: NAV_MAX }
})
const navThumbStyle = computed(() => ({ width: `${navThumb.value.w}px`, height: `${navThumb.value.h}px` }))
// The viewport box: the visible fraction of the image, mapped onto the thumbnail.
const navBoxStyle = computed(() => {
  const p = paneMetrics.value
  const t = navThumb.value
  if (!p.sw || !p.sh || !t.w || !t.h) return {}
  return {
    left: `${(p.left / p.sw) * t.w}px`,
    top: `${(p.top / p.sh) * t.h}px`,
    width: `${(p.cw / p.sw) * t.w}px`,
    height: `${(p.ch / p.sh) * t.h}px`,
  }
})

// Docking behaviour (orientation, minimize, draggable divider) is shared with the
// 3D viewer via a composable; combined only on the full preview surface.
const { discussionPos, discLayout, dragging, combinedActive, discStyle, setPos, startDrag } =
  useDiscussionDock(hasPreview, computed(() => !!props.fullWidth))

watch(() => props.uid, reload, { immediate: true })
onBeforeUnmount(cleanup)

// After a zoom change (or a new image), the pane's scrollable size changes once the new
// width lays out — re-measure so the navigator box tracks it. Also reset the natural
// height alongside the width on a new file.
watch([imgZoom, imgNaturalW, showImage], async () => {
  await nextTick()
  syncNav()
})

async function reload() {
  cleanup()
  set.value = {}
  activeTab.value = 'document'
  // A new file re-fits on the next image load; clear so no stale zoom flashes first.
  imgNaturalW.value = 0
  imgNaturalH.value = 0
  imgZoom.value = 100
  if (!props.uid) return
  loading.value = true
  error.value = ''
  // Whether the user may annotate + save a marked-up copy (WRITE on the file). Only
  // needed on the full review surface; best-effort (a failed check hides Annotate).
  if (props.fullWidth) {
    try {
      canWrite.value = await fileService.checkPermission(props.uid, { permission: 'w' })
    } catch {
      canWrite.value = false
    }
  }
  try {
    set.value = await loadRenditionSet(props.uid)
    // The still image: the preview (documents/images) or a video's poster frame.
    const still = previewImage(set.value)
    if (still) {
      previewUrl.value = await renditionObjectUrl(still.uid, 'image/png')
    }
    // On the full-width review overlay, open the media (PDF/video) straight away.
    if (props.fullWidth && canOpen.value) await openMedia()
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load preview')
  } finally {
    loading.value = false
  }
  // A discussion deep-link with no inline panel (no preview, or the compact drawer)
  // pops the overlay so the linked comment is reachable (§10f/§10g).
  if ((focusThread.value || focusComment.value) && !(props.fullWidth && hasPreview.value)) {
    discussionOpen.value = true
  }
}

async function openMedia() {
  // In the drawer, raise the full-width review overlay rather than embed a
  // cramped player; the bytes are fetched there (only on this explicit action).
  // An overlay — not navigation — so the Files/Chat view is preserved.
  if (!props.fullWidth) {
    preview.open(props.uid, props.name)
    return
  }
  if (mediaKind.value === 'pdf') {
    // Fetch the PDF bytes and embed them in the iframe.
    const pdfUid = set.value.pdf?.uid ?? (isNativePdf.value ? props.uid : '')
    if (!pdfUid || pdfUrl.value) return
    opening.value = true
    error.value = ''
    try {
      pdfUrl.value = await renditionObjectUrl(pdfUid, 'application/pdf')
    } catch (e) {
      error.value = errorMessage(e, 'Failed to open document')
    } finally {
      opening.value = false
    }
  } else if (mediaKind.value === 'video' && videoRef.value) {
    // Fetch the preview clip and play it inline (poster = the still image).
    if (videoUrl.value) return
    const ref_ = videoRef.value
    opening.value = true
    error.value = ''
    try {
      videoUrl.value = await renditionObjectUrl(ref_.uid, VIDEO_MIME[ref_.ext.toLowerCase()] || 'video/mp4')
    } catch (e) {
      error.value = errorMessage(e, 'Failed to open video')
    } finally {
      opening.value = false
    }
  }
}

// On (re)load of the still image, record its natural width and default the zoom to
// fit-to-width — but never upscale a small image past 1:1 — measuring the pane from the
// image's container. The "1:1" button then jumps to actual pixels.
function onImgLoad(e: Event) {
  const el = e.target as HTMLImageElement
  imgNaturalW.value = el.naturalWidth || 0
  imgNaturalH.value = el.naturalHeight || 0
  const paneW = el.parentElement?.clientWidth || el.clientWidth || 0
  imgZoom.value =
    imgNaturalW.value && paneW
      ? Math.min(100, Math.max(10, Math.round((paneW / imgNaturalW.value) * 100)))
      : 100
}

// Reset the image to 1:1 (actual pixel size).
function resetImgZoom() {
  imgZoom.value = 100
}

// --- Navigator drag: click or drag the mini-map to recentre the pane's viewport. ---
let navDragging = false

// Scroll the pane so the point (clientX, clientY) within the thumbnail becomes the centre
// of the visible area. Clamping to valid scroll range is left to the browser.
function navMoveTo(clientX: number, clientY: number) {
  const el = imgPaneRef.value
  const thumb = navThumbRef.value
  if (!el || !thumb) return
  const r = thumb.getBoundingClientRect()
  if (!r.width || !r.height) return
  const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
  el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2
  el.scrollTop = fy * el.scrollHeight - el.clientHeight / 2
  syncNav()
}
function startNavDrag(e: PointerEvent) {
  navDragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  navMoveTo(e.clientX, e.clientY)
  e.preventDefault()
}
function onNavMove(e: PointerEvent) {
  if (navDragging) navMoveTo(e.clientX, e.clientY)
}
function endNavDrag(e: PointerEvent) {
  navDragging = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}

// Ask CSAI to (re)generate this file's renditions, then reload to show them.
async function generate() {
  generating.value = true
  genError.value = ''
  try {
    await searchService.generatePreview(props.uid)
    await reload()
  } catch (e) {
    genError.value = errorMessage(e, 'Failed to generate preview')
  } finally {
    generating.value = false
  }
}

// Deep-link to this file's folder, select it, and open the details drawer.
// Closes the preview overlay (if open) and navigates the Files view there.
function openLocation() {
  preview.close()
  const query: Record<string, string> = { file: props.uid }
  if (auth.tenant) query.tenant = auth.tenant // UIDs are tenant-scoped
  router.push({ name: 'FileBrowser', query })
}

// Handles the PdfViewer toolbar's ⬇ download (the affordance the native browser PDF
// viewer has and the embedded one lacked). Downloads the PDF the viewer is showing —
// any file with a PDF preview, a native PDF or an Office doc's generated `pdf` rendition
// alike (which downloadOriginal does NOT give: that returns the source .docx/.xlsx).
// When the user has marked the
// document up, the download is the marked-up version (annotations baked in via the
// viewer's saveBytes); with no markup it's the plain preview rendition, reusing the
// object URL already loaded into the viewer (viewerSrc) so there's no second fetch. For
// a reshown marked-up copy, viewerSrc already IS that copy, so its bytes come straight
// through (plus any further markup the user layered on).
async function downloadPdf() {
  if (!viewerSrc.value) return
  const base = props.name || props.uid
  const filename = /\.pdf$/i.test(base) ? base : `${base.replace(/\.[^./\\]+$/, '')}.pdf`
  // Any markup on the live document (a fresh drawing, or further edits on a copy) means
  // the on-screen PDF differs from the loaded rendition — bake the annotations in.
  const marked = (pdfViewerRef.value?.hasEdits?.() ?? false) || pdfHasMarkup.value
  let href = viewerSrc.value
  let revoke = false
  try {
    if (marked && pdfViewerRef.value) {
      const bytes = await pdfViewerRef.value.saveBytes()
      href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      revoke = true
    }
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to download')
  } finally {
    // Only the baked-markup blob is ours to revoke; viewerSrc stays live for the viewer.
    if (revoke) URL.revokeObjectURL(href)
  }
}

// Download the original source file (with its real filename).
async function downloadOriginal() {
  try {
    const blob = await fileService.downloadFile(props.uid)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = props.name || props.uid
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to download')
  }
}

// Save the current markup: read the edited bytes, write them as a `markup` rendition
// (a hidden child of this file), then attach the pointer to the next comment via the
// The markup provider handed to the discussion panel: called right before a comment
// (root or reply) is posted. If the live document carries markup, write the edited
// bytes as a `markup` rendition and return the pointer so it's linked to that
// comment — no separate save step. Then clear the markup from the live document (so
// the next comment starts fresh and navigating away no longer warns). Returns null
// when there's nothing to attach. Throws propagate to the panel, which aborts the
// post and shows the error, so a failed upload never posts an orphaned comment.
async function attachMarkup(): Promise<CommentMarkup | null> {
  const viewer = pdfViewerRef.value
  // Captures whatever is on screen — the live document OR a reshown copy the user has
  // marked up further — as a new rendition child of the source file.
  if (!viewer || !props.uid || !viewer.hasEdits()) return null
  const bytes = await viewer.saveBytes()
  const { uid, name } = await createMarkupRendition(props.uid, auth.user || 'anon', bytes)
  // The markup is now saved to the comment, but it STAYS on the live document so the
  // user can keep adding to it and attach the cumulative state to a further comment.
  // markSaved() just clears the "unsaved" flag (it does not remove the drawing).
  viewer.markSaved()
  return { renditionUid: uid, name }
}

// The "Return to original" action: discard ALL markup and reload the clean document.
// Guarded — if there's unsaved markup, confirm before losing it.
function clearMarkup() {
  if (!confirmDiscard()) return
  viewerNonce.value++ // remount → fresh clean load
}

// Called before any navigation that would lose unsaved markup (overlay close, viewing
// a saved copy, returning to the original). Only prompts when markup is unsaved.
function confirmDiscard(): boolean {
  if (!canAnnotate.value || !pdfDirty.value) return true
  return window.confirm(
    'You have PDF markup that has not been added to a comment yet. Add a comment to save it, ' +
      'or leave and discard the markup?',
  )
}
defineExpose({ confirmDiscard })

// Reshow a comment's saved marked-up copy read-only (from the panel's "View
// marked-up copy" link). Loads the rendition into the same PDF.js viewer.
async function onShowMarkup(markup: CommentMarkup, commentId: string) {
  // Switching to a saved copy replaces the editable viewer; confirm first if there's
  // unsaved markup, so the drawing isn't silently discarded.
  if (!confirmDiscard()) return
  closeMarkupUrl()
  error.value = ''
  try {
    markupUrl.value = await renditionObjectUrl(markup.renditionUid, 'application/pdf')
    markupView.value = markup
    activeMarkupCommentId.value = commentId // highlight the source comment
  } catch (e) {
    markupView.value = null
    activeMarkupCommentId.value = null
    error.value = errorMessage(e, 'Failed to open the marked-up copy')
  }
}

function closeMarkupView() {
  // Guard: returning to the live document discards unsaved further-markup on the copy.
  if (!confirmDiscard()) return
  markupView.value = null
  activeMarkupCommentId.value = null
  closeMarkupUrl()
}

async function downloadMarkupView() {
  const m = markupView.value
  if (!m) return
  markupDownloading.value = true
  try {
    const blob = await fileService.downloadFile(m.renditionUid)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = m.name || 'marked-up.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to download')
  } finally {
    markupDownloading.value = false
  }
}

function closeMarkupUrl() {
  if (markupUrl.value) {
    revokeRenditionUrl(markupUrl.value)
    markupUrl.value = ''
  }
}

// Warn before leaving with unsaved markup (no beforeunload guard existed before).
function beforeUnloadGuard(e: BeforeUnloadEvent) {
  if (canAnnotate.value && pdfDirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnloadGuard))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnloadGuard))

// The pane resizes with the window (and the discussion splitter), which changes what
// fraction of the image is visible — keep the navigator box in sync.
onMounted(() => window.addEventListener('resize', syncNav))
onBeforeUnmount(() => window.removeEventListener('resize', syncNav))

function closeMedia() {
  if (pdfUrl.value) {
    revokeRenditionUrl(pdfUrl.value)
    pdfUrl.value = ''
  }
  if (videoUrl.value) {
    revokeRenditionUrl(videoUrl.value)
    videoUrl.value = ''
  }
  // Reset markup/annotate state when the media is torn down (file change / close).
  markupView.value = null
  activeMarkupCommentId.value = null
  closeMarkupUrl()
  pdfDirty.value = false
  pdfHasMarkup.value = false
}

// Switch to the Chat log tab, fetching the provenance HTML on first view. The
// HTML is injected into a shadow root (ShadowHtml) for style isolation.
async function selectChatlog() {
  activeTab.value = 'chatlog'
  const c = set.value.chatlog
  if (!c || chatlogHtml.value) return
  try {
    chatlogHtml.value = await renditionText(c.uid)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load the chat log')
  }
}

function cleanup() {
  if (previewUrl.value) {
    revokeRenditionUrl(previewUrl.value)
    previewUrl.value = ''
  }
  chatlogHtml.value = '' // plain text — no blob URL to revoke
  closeMedia()
}
</script>

<style scoped>
.doc-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.dp-err {
  color: #b00020;
  font-size: 12px;
}

.dp-muted {
  color: var(--muted);
  font-size: 12px;
}

.dp-tabs {
  display: flex;
  gap: 4px;
  width: 100%;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}

.dp-tab {
  appearance: none;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}

.dp-tab:hover {
  color: inherit;
}

.dp-tab.active {
  color: var(--accent, #2563eb);
  border-bottom-color: var(--accent, #2563eb);
  font-weight: 600;
}

.dp-chatlog {
  width: 100%;
  /* The chat-log is a self-contained provenance *document* (dark ink on white
     message bubbles). It renders in a Shadow DOM as a fragment, so its own
     `body { color }` rule never applies and the text would otherwise inherit the
     app's theme ink — light on white in dark mode. Pin it to a light document
     surface: `color` inherits across the shadow boundary, so the whole transcript
     (headings, bubbles, notes) stays readable in any theme, like the PDF preview.
     Fixed values on purpose — do NOT use theme vars here. */
  background: #ffffff;
  color: #1f2937;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 14px;
}

.dp-chatlog-body {
  display: block;
  width: 100%;
}

.dp-img {
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.dp-img.clickable {
  cursor: pointer;
}

/* Image zoom controls, teleported into the modal title-bar slot (#ov-titlebar). They
   still carry this component's scoped style id, so these rules apply after the move. */
.dp-imgzoom {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dp-imgzoom-range {
  width: 130px;
  cursor: pointer;
  accent-color: var(--primary);
}
.dp-imgzoom-pct {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-width: 3.2em;
  text-align: right;
}
.dp-imgzoom-reset {
  appearance: none;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.dp-imgzoom-reset:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* Overlay image: a frame that clips + a pane that scrolls (so a zoomed image pans). The
   frame is position:relative so the navigator can pin to it, outside the scroll flow.
   Base rules are inert; the overlay layouts below turn on the fill/clip/scroll. */
.dp-img-frame {
  position: relative;
  width: 100%;
}
.dp-img-pane .dp-img {
  display: block;
}
.dp-side-by-side .dp-img-frame,
.dp-fit-bottom .dp-img-frame,
.dp-full-min .dp-img-frame {
  flex: 1 1 auto;
  min-height: 0;
  align-self: stretch;
  overflow: hidden;
}
.dp-side-by-side .dp-img-pane,
.dp-fit-bottom .dp-img-pane,
.dp-full-min .dp-img-pane {
  position: absolute;
  inset: 0;
  overflow: auto;
}

/* Mini-map navigator: pinned to the pane's top-left, above the scrolling image. */
.dp-nav {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 5;
  padding: 3px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  cursor: crosshair;
  line-height: 0;
  touch-action: none; /* pointer-drag to pan, not a scroll gesture */
}
.dp-nav-thumb {
  display: block;
  border-radius: 3px;
  opacity: 0.95;
  user-select: none;
  -webkit-user-drag: none;
}
/* The viewport rectangle — the portion of the image currently in view. Clicks pass
   through to the navigator (which recentres), so the box itself is not a pointer target. */
.dp-nav-box {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid var(--primary);
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  pointer-events: none;
}

.dp-pdf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.dp-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}
.dp-markup-tag {
  font-size: 12px;
  color: var(--primary);
  font-weight: 600;
}
.dp-hint {
  font-size: 12px;
  color: var(--muted);
}
.dp-save-markup {
  font-weight: 600;
}

.dp-frame {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
}

.dp-frame-full {
  height: calc(100vh - 150px);
}

.dp-video {
  background: #000;
  object-fit: contain;
}

.btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--accent, #2563eb);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Right-align the video "Preview" action (the container is left-aligned). */
.btn-end {
  align-self: flex-end;
}

.link {
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--accent, #2563eb);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

/* Combined preview + discussion (§10b). Stacked by default (e.g. the drawer);
   side-by-side when there's room on a full-width page. */
.dp-combined {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
}
.dp-combined.dp-side-by-side {
  flex-direction: row;
  align-items: stretch;
  /* Bound to the viewport so each pane scrolls independently — the document stays
     put while the chat scrolls, and vice versa (no page scroll). */
  height: calc(100vh - 140px);
  min-height: 0;
}
.dp-side-by-side .dp-main {
  overflow: auto;
}
.dp-side-by-side .dp-main .dp-frame,
.dp-side-by-side .dp-frame-full {
  height: 100%;
}
.dp-side-by-side .dp-main .dp-pdf {
  flex: 1 1 auto;
  min-height: 0;
}
.dp-main {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.dp-discussion {
  width: 100%;
  min-width: 0;
}
.dp-combined:not(.dp-side-by-side) .dp-discussion {
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
.dp-side-by-side .dp-discussion {
  flex: 0 0 380px;
  width: 380px;
  min-height: 0;
  border-left: 1px solid var(--border);
  padding-left: 10px;
}

/* Docked below: fit preview + discussion within the viewport (no page scroll) —
   shrink the preview and let each pane scroll internally. */
.dp-fit-bottom {
  height: calc(100vh - 140px);
  min-height: 0;
}
.dp-fit-bottom .dp-main {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.dp-fit-bottom .dp-main .dp-pdf {
  flex: 1 1 auto;
  min-height: 0;
}
.dp-fit-bottom .dp-frame,
.dp-fit-bottom .dp-frame-full {
  height: 100%;
}
.dp-fit-bottom .dp-img {
  max-height: 100%;
  object-fit: contain;
}
.dp-fit-bottom .dp-discussion {
  flex: 0 0 42%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Minimized discussion on the full overlay: the panel collapses to a title-bar
   chip (combinedActive is false), so the layout gets neither the side-by-side nor
   the fit-bottom height cap. Without one, the fixed frame height (100vh - 150px)
   plus the action links beneath it overflow the overlay and force an outer
   scrollbar. Bound the preview to the viewport and let the PDF/video frame
   flex-shrink so the frame + the links below it fit with no scrolling. */
.dp-full-min {
  height: calc(100vh - 140px);
  min-height: 0;
}
.dp-full-min .dp-main {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.dp-full-min .dp-main .dp-pdf {
  flex: 1 1 auto;
  min-height: 0;
}
.dp-full-min .dp-frame-full {
  flex: 1 1 auto;
  min-height: 0;
  height: auto; /* override the fixed calc; fill the flex space instead */
}
.dp-full-min .dp-img {
  max-height: 100%;
  object-fit: contain;
}

/* Draggable divider (both orientations). */
.dp-splitter {
  flex: 0 0 auto;
  position: relative;
  align-self: stretch;
}
.dp-splitter.vertical {
  width: 9px;
  cursor: col-resize;
}
.dp-splitter.horizontal {
  height: 9px;
  cursor: row-resize;
}
.dp-splitter::before {
  content: '';
  position: absolute;
  background: var(--border);
  border-radius: 2px;
}
.dp-splitter.vertical::before {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
}
.dp-splitter.horizontal::before {
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
}
.dp-splitter:hover::before {
  background: var(--primary);
}
.dp-combined.dragging {
  user-select: none;
}
.dp-combined.dragging iframe {
  pointer-events: none;
}
.dp-fit-bottom .dp-thread {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}
.dp-thread {
  display: block;
  height: 65vh;
  border: 1px solid var(--border);
  border-radius: 8px;
}
/* Minimized: the panel is just its toggle button — no fixed height/border. */
.dp-thread-min {
  height: auto;
  border: none;
}
.dp-side-by-side .dp-thread {
  height: 100%;
}
.dp-discuss-btn {
  background: transparent;
  color: var(--accent, #2563eb);
  border: 1px solid var(--border);
}
</style>
