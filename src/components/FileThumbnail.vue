<template>
  <span ref="root" class="file-thumb">
    <img v-if="url" :src="url" class="thumb-img" alt="" />
    <span v-else class="thumb-icon">{{ icon }}</span>
  </span>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { FileItem } from '@/services/fileService'
import {
  loadRenditionSet,
  renditionObjectUrl,
  revokeRenditionUrl,
  thumbnailImage,
} from '@/services/renditions'

// A file tile's leading glyph: a lazily-loaded icon-sized `thumbnail` rendition
// when the file has one, else the plain type icon. Fetching is deferred until
// the row scrolls into view (IntersectionObserver) so a long listing doesn't
// trigger N rendition requests up front.
const props = defineProps<{ item: FileItem }>()

const root = ref<HTMLElement | null>(null)
const url = ref('')
let observer: IntersectionObserver | null = null
let started = false

const icon = computed(() => (props.item.isDirectory ? '📁' : '📄'))
const eligible = computed(() => !props.item.isDirectory && props.item.hasRenditions)

onMounted(() => {
  if (!eligible.value) return
  // Without IntersectionObserver (e.g. jsdom), just load immediately.
  if (typeof IntersectionObserver === 'undefined') {
    void loadThumb()
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        disconnect()
        void loadThumb()
      }
    },
    { rootMargin: '100px' },
  )
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  disconnect()
  if (url.value) revokeRenditionUrl(url.value)
})

async function loadThumb() {
  if (started) return
  started = true
  try {
    const set = await loadRenditionSet(props.item.uid)
    const thumb = thumbnailImage(set) // thumbnail, or a video's poster frame
    if (thumb) url.value = await renditionObjectUrl(thumb.uid)
  } catch {
    // Keep the fallback icon on any failure.
  }
}

function disconnect() {
  observer?.disconnect()
  observer = null
}
</script>

<style scoped>
.file-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 8px;
  vertical-align: middle;
}

.thumb-img {
  width: 22px;
  height: 22px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.thumb-icon {
  line-height: 1;
}
</style>
