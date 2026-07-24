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
    <div
      v-if="open"
      class="tov-root"
      role="dialog"
      aria-modal="true"
      aria-label="Discussion"
      @keydown.esc="emit('close')"
    >
      <div class="tov-backdrop" @click="emit('close')"></div>
      <div class="tov-panel">
        <header class="tov-head">
          <span class="tov-title">💬 Discussion · {{ name || fileUid }}</span>
          <button class="tov-x" aria-label="Close" @click="emit('close')">✕</button>
        </header>
        <div class="tov-body">
          <!-- Standalone window: no dock/minimize (the window has its own close),
               but keep the ⚑ Review request + reviewer actions. -->
          <ThreadPanel
            v-if="open"
            :file-uid="fileUid"
            :focus-thread="focusThread"
            :focus-comment="focusComment"
            embedded
            hide-dock
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import ThreadPanel from '@/components/ThreadPanel.vue'

defineProps<{
  open: boolean
  fileUid: string
  name?: string
  focusThread?: string
  focusComment?: string
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

// Close on Escape even when focus isn't inside the dialog.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.tov-root {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tov-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}
.tov-panel {
  position: relative;
  width: min(720px, 92vw);
  height: min(80vh, 900px);
  display: flex;
  flex-direction: column;
  background: var(--card);
  /* Teleported to <body> (outside #app), so set the theme ink explicitly —
     otherwise the title falls back to the UA default black (unreadable in dark). */
  color: var(--fg);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.tov-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.tov-title {
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tov-x {
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
}
.tov-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
