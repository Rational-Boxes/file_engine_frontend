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
import { modelIcon } from '@/utils/modelFormat'

// A file tile's leading glyph: a lazily-loaded icon-sized `thumbnail` rendition
// when the file has one, else the plain type icon. Fetching is deferred until
// the row scrolls into view (IntersectionObserver) so a long listing doesn't
// trigger N rendition requests up front.
const props = defineProps<{ item: FileItem }>()

const root = ref<HTMLElement | null>(null)
const url = ref('')
let observer: IntersectionObserver | null = null
let started = false

const icon = computed(() => {
  if (props.item.isDirectory) return '📁'
  return modelIcon(props.item.name) ?? '📄'
})
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
