<template>
  <div class="doc-preview">
    <p v-if="error" class="dp-err">{{ error }}</p>
    <p v-else-if="loading" class="dp-muted">Loading preview…</p>

    <template v-else>
      <!-- Inline PDF viewer — shown only after the user explicitly asks for it. -->
      <div v-if="pdfUrl" class="dp-pdf">
        <iframe :src="pdfUrl" title="Document" class="dp-frame"></iframe>
        <button class="link" @click="closePdf">← Back to preview</button>
      </div>

      <!-- Lightweight first-page preview image (no PDF fetched yet). -->
      <template v-else>
        <img
          v-if="previewUrl"
          :src="previewUrl"
          class="dp-img"
          :class="{ clickable: canOpenPdf }"
          alt="First-page preview"
          :title="canOpenPdf ? 'Open the full document' : ''"
          @click="canOpenPdf && openPdf()"
        />
        <p v-else class="dp-muted">No preview available{{ hasRenditions ? '' : ' yet' }}.</p>

        <button v-if="canOpenPdf" class="btn" :disabled="opening" @click="openPdf">
          {{ opening ? 'Opening…' : 'Open document (PDF)' }}
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
  type RenditionSet,
} from '@/services/renditions'
import { errorMessage } from '@/services/apiClient'

const props = defineProps<{ uid: string; name?: string; hasRenditions?: boolean }>()

const set = ref<RenditionSet>({})
const previewUrl = ref('') // object URL for the first-page preview image
const pdfUrl = ref('') // object URL for the inline PDF (loaded on demand)
const loading = ref(false)
const opening = ref(false)
const error = ref('')

// A native PDF is its own inline document, so it has no `pdf` rendition — open
// the source itself. Office docs expose a `pdf` rendition instead.
const isNativePdf = computed(() => (props.name || '').toLowerCase().endsWith('.pdf'))
const canOpenPdf = computed(() => !!set.value.pdf || isNativePdf.value)

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
    if (set.value.preview) {
      previewUrl.value = await renditionObjectUrl(set.value.preview.uid)
    }
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load preview')
  } finally {
    loading.value = false
  }
}

async function openPdf() {
  // Fetch the PDF bytes ONLY now (explicit user action) — never on open, so a
  // potentially large PDF is not pulled unless the user wants to read it.
  const pdfUid = set.value.pdf?.uid ?? (isNativePdf.value ? props.uid : '')
  if (!pdfUid || pdfUrl.value) return
  opening.value = true
  error.value = ''
  try {
    pdfUrl.value = await renditionObjectUrl(pdfUid)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to open document')
  } finally {
    opening.value = false
  }
}

function closePdf() {
  if (pdfUrl.value) {
    revokeRenditionUrl(pdfUrl.value)
    pdfUrl.value = ''
  }
}

function cleanup() {
  if (previewUrl.value) {
    revokeRenditionUrl(previewUrl.value)
    previewUrl.value = ''
  }
  closePdf()
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
