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
  <Teleport to="body">
    <div v-if="preview.isOpen" class="ov-backdrop" :class="{ 'ov-max': maximized }" @click.self="requestClose">
      <div class="ov-panel" :class="{ 'ov-panel-max': maximized }" role="dialog" aria-modal="true" aria-label="Document preview">
        <header class="ov-head">
          <h1 class="ov-title" :title="title">{{ title }}</h1>
          <div id="ov-titlebar" class="ov-slot"></div>
          <button
            class="ov-btn"
            :aria-label="maximized ? 'Restore preview' : 'Maximize preview'"
            :title="maximized ? 'Restore' : 'Maximize'"
            @click="maximized = !maximized"
          >{{ maximized ? '🗗' : '⛶' }}</button>
          <button class="ov-btn" aria-label="Close preview" @click="requestClose">✕</button>
        </header>

        <div class="ov-body">
          <p v-if="error" class="ov-err">{{ error }}</p>
          <DocumentPreview ref="docRef" :uid="preview.uid" :name="name" full-width titlebar="#ov-titlebar" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import { usePreviewStore } from '@/stores/preview'
import { fileService } from '@/services/fileService'

const preview = usePreviewStore()

const name = ref('')
const error = ref('')
const maximized = ref(false) // Maximize/Restore: fill the viewport vs. the windowed modal
// The embedded DocumentPreview vetoes close when there's unsaved PDF markup (Phase 7.1).
const docRef = ref<{ confirmDiscard: () => boolean } | null>(null)

const title = computed(() => name.value || preview.name || preview.uid)

// Close the overlay, but first let the preview confirm discarding unsaved markup.
function requestClose() {
  if (docRef.value?.confirmDiscard?.() ?? true) preview.close()
}

// Resolve the title whenever the previewed file changes.
watch(
  () => preview.uid,
  async (uid) => {
    name.value = preview.name
    error.value = ''
    if (!uid) return
    // Name (for the title + native-PDF detection); best-effort.
    if (!name.value) {
      try {
        name.value = (await fileService.stat(uid)).name
      } catch {
        /* name is optional */
      }
    }
  },
  { immediate: true },
)

// Capture phase (Esc can still be swallowed by focused content); preventDefault
// marks it handled so the drawer beneath doesn't also close on the same press.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || !preview.isOpen) return
  e.preventDefault()
  requestClose()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<style scoped>
.ov-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 24px;
}

.ov-panel {
  background: var(--bg);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  width: 94vw;
  max-width: 1600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Maximized: fill the whole viewport (no margin, radius, or width cap). The panel
   already stretches to the backdrop height, so dropping the padding fills it. */
.ov-backdrop.ov-max {
  padding: 0;
}
.ov-panel.ov-panel-max {
  width: 100vw;
  max-width: none;
  border-radius: 0;
}

.ov-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}

.ov-title {
  font-size: 16px;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
}
/* Slot for the discussion's minimized chip (teleported in when minimized). */
.ov-slot {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.ov-btn {
  border: none;
  background: none;
  font-size: 18px;
  color: var(--muted);
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.ov-btn:hover {
  color: var(--fg);
  background: var(--bg);
}

.ov-body {
  padding: 16px 18px;
  overflow: auto;
}

.ov-err {
  color: var(--danger);
  font-size: 13px;
}
</style>
