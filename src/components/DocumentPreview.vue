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
          :key="markupView ? `markup:${markupView.renditionUid}` : 'doc'"
          :src="viewerSrc"
          :editable="canAnnotate"
          :full-width="fullWidth"
          @dirty="pdfDirty = $event"
          @error="error = $event"
        />
        <div class="dp-actions">
          <template v-if="markupView">
            <span class="dp-markup-tag">📄 Marked-up copy{{ markupView.name ? ` — ${markupView.name}` : '' }}</span>
            <button class="link" @click="closeMarkupView">← Back to document</button>
            <button class="link" :disabled="markupDownloading" @click="downloadMarkupView">⬇ Download this copy</button>
          </template>
          <template v-else>
            <!-- The markup toolbar (in PdfViewer) is always visible for a writer;
                 Save appears once there's markup to save. -->
            <button
              v-if="canAnnotate && pdfDirty"
              class="link dp-save-markup"
              :disabled="markupSaving"
              @click="saveMarkup"
            >💬 {{ markupSaving ? 'Saving…' : 'Save markup to a comment' }}</button>
            <span v-else-if="canAnnotate" class="dp-hint">✎ Use the toolbar above to mark up this PDF</span>
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
        <img
          v-if="previewUrl"
          :src="previewUrl"
          class="dp-img"
          :class="{ clickable: canOpen }"
          alt="Preview"
          :title="canOpen ? openHint : ''"
          @click="canOpen && openMedia()"
        />
        <!-- No rendition yet: ask CSAI to (re)generate the preview on demand. -->
        <template v-else>
          <p class="dp-muted">{{ generating ? 'Generating preview…' : 'No preview available yet.' }}</p>
          <button class="btn" :disabled="generating" @click="generate">
            {{ generating ? 'Generating…' : 'Generate preview' }}
          </button>
          <p v-if="genError" class="dp-err">{{ genError }}</p>
        </template>

        <button
          v-if="previewUrl && canOpen"
          class="btn"
          :class="{ 'btn-end': mediaKind === 'video' }"
          :disabled="opening"
          @click="openMedia"
        >
          {{ opening ? 'Opening…' : openLabel }}
        </button>
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
          ref="threadPanelRef"
          :file-uid="uid"
          :focus-thread="focusThread"
          :focus-comment="focusComment"
          embedded
          :titlebar-target="titlebar"
          :pos="discussionPos"
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
import { ref, computed, watch, onBeforeUnmount, onMounted } from 'vue'
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

// --- PDF markup (Phase 7.1) ---
const pdfViewerRef = ref<{ saveBytes: () => Promise<Uint8Array>; hasEdits: () => boolean } | null>(null)
const threadPanelRef = ref<{ startMarkupAttach: (m: CommentMarkup) => void } | null>(null)
const pdfDirty = ref(false) // the viewer has unsaved markup
const markupSaving = ref(false)
const canWrite = ref(false) // WRITE on the file → may annotate + save
// When set, we're reshowing a comment's saved marked-up copy (read-only) instead of
// the live document; markupUrl is that rendition's object URL.
const markupView = ref<CommentMarkup | null>(null)
const markupUrl = ref('')
const markupDownloading = ref(false)
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
const canOpen = computed(() => mediaKind.value !== null)
// Whether a document preview is actually on screen (vs. the "no preview" state).
const hasPreview = computed(() =>
  !!(previewUrl.value || pdfUrl.value || videoUrl.value || set.value.chatlog),
)
const openLabel = computed(() => (mediaKind.value === 'video' ? '▶ Preview 10 seconds' : 'Open document (PDF)'))
const openHint = computed(() => (mediaKind.value === 'video' ? 'Play the video' : 'Open the full document'))

// What the PDF.js viewer renders: a comment's marked-up copy (read-only) when
// reshowing, else the live document.
const viewerSrc = computed(() => (markupView.value ? markupUrl.value : pdfUrl.value))
// Whether the markup toolbar is shown + editing enabled: on the full review surface,
// for a writer, on the live document (never while reshowing a saved copy). The
// discussion panel — where a saved markup attaches — lives on this surface too.
const canAnnotate = computed(() => !!props.fullWidth && canWrite.value && !markupView.value)

// Docking behaviour (orientation, minimize, draggable divider) is shared with the
// 3D viewer via a composable; combined only on the full preview surface.
const { discussionPos, discLayout, dragging, combinedActive, discStyle, setPos, startDrag } =
  useDiscussionDock(hasPreview, computed(() => !!props.fullWidth))

watch(() => props.uid, reload, { immediate: true })
onBeforeUnmount(cleanup)

async function reload() {
  cleanup()
  set.value = {}
  activeTab.value = 'document'
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
// discussion panel — exactly how a 3D "Comment here" attaches a viewpoint.
async function saveMarkup() {
  const viewer = pdfViewerRef.value
  const panel = threadPanelRef.value
  if (!viewer || !panel || !props.uid) return
  markupSaving.value = true
  error.value = ''
  try {
    const bytes = await viewer.saveBytes()
    const { uid, name } = await createMarkupRendition(props.uid, auth.user || 'anon', bytes)
    panel.startMarkupAttach({ renditionUid: uid, name })
    pdfDirty.value = false
  } catch (e) {
    error.value = errorMessage(e, 'Failed to save the marked-up copy')
  } finally {
    markupSaving.value = false
  }
}

// Reshow a comment's saved marked-up copy read-only (from the panel's "View
// marked-up copy" link). Loads the rendition into the same PDF.js viewer.
async function onShowMarkup(markup: CommentMarkup) {
  closeMarkupUrl()
  error.value = ''
  try {
    markupUrl.value = await renditionObjectUrl(markup.renditionUid, 'application/pdf')
    markupView.value = markup
  } catch (e) {
    markupView.value = null
    error.value = errorMessage(e, 'Failed to open the marked-up copy')
  }
}

function closeMarkupView() {
  markupView.value = null
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
  closeMarkupUrl()
  pdfDirty.value = false
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
