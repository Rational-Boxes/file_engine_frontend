<template>
  <div class="doc-preview">
    <p v-if="error" class="dp-err">{{ error }}</p>
    <p v-else-if="loading" class="dp-muted">Loading preview…</p>

    <template v-else>
      <!-- Inline PDF viewer — shown only after the user explicitly asks for it. -->
      <div v-if="pdfUrl" class="dp-pdf">
        <iframe :src="pdfUrl" title="Document" class="dp-frame" :class="{ 'dp-frame-full': fullWidth }"></iframe>
        <button class="link" @click="closeMedia">← Back to preview</button>
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
        <button class="link" @click="closeMedia">← Back to preview</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  loadRenditionSet,
  renditionObjectUrl,
  revokeRenditionUrl,
  previewImage,
  type RenditionSet,
} from '@/services/renditions'
import { searchService } from '@/services/searchService'
import { usePreviewStore } from '@/stores/preview'
import { errorMessage } from '@/services/apiClient'

// `fullWidth` = the overlay review (PdfPreviewOverlay): the PDF is embedded in a
// full-width iframe and auto-opened. Otherwise (the narrow drawer), opening the
// PDF raises that overlay instead of cramming an iframe into the drawer — an
// overlay, NOT a route change, so the underlying view never resets.
const props = defineProps<{ uid: string; name?: string; hasRenditions?: boolean; fullWidth?: boolean }>()

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
const openLabel = computed(() => (mediaKind.value === 'video' ? '▶ Preview 10 seconds' : 'Open document (PDF)'))
const openHint = computed(() => (mediaKind.value === 'video' ? 'Play the video' : 'Open the full document'))

watch(() => props.uid, reload, { immediate: true })
onBeforeUnmount(cleanup)

async function reload() {
  cleanup()
  set.value = {}
  if (!props.uid) return
  loading.value = true
  error.value = ''
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

function closeMedia() {
  if (pdfUrl.value) {
    revokeRenditionUrl(pdfUrl.value)
    pdfUrl.value = ''
  }
  if (videoUrl.value) {
    revokeRenditionUrl(videoUrl.value)
    videoUrl.value = ''
  }
}

function cleanup() {
  if (previewUrl.value) {
    revokeRenditionUrl(previewUrl.value)
    previewUrl.value = ''
  }
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

.dp-frame {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
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
</style>
