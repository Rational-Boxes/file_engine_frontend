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
      class="cm-root"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div class="cm-backdrop" @click="emit('cancel')"></div>

      <div ref="panelEl" class="cm-panel" @keydown="onKeydown">
        <h2 class="cm-title">{{ title }}</h2>
        <p class="cm-msg">{{ message }}</p>

        <div class="cm-actions">
          <button ref="cancelEl" class="cm-btn" type="button" @click="emit('cancel')">Cancel</button>
          <button
            class="cm-btn"
            :class="{ 'cm-danger': danger }"
            type="button"
            @click="emit('confirm')"
          >
            {{ confirmLabel || 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  message: string
  // Label + styling of the primary button (danger = destructive/red).
  confirmLabel?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const panelEl = ref<HTMLElement | null>(null)
const cancelEl = ref<HTMLButtonElement | null>(null)

// Focus Cancel when the dialog opens — the safe default (especially for a
// destructive action).
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    cancelEl.value?.focus()
  },
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
    return
  }
  // Minimal focus trap so Tab stays within the dialog.
  if (e.key === 'Tab') {
    const focusable = panelEl.value?.querySelectorAll<HTMLElement>(
      'button, input, [href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}
</script>

<style scoped>
.cm-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
.cm-panel {
  position: relative;
  width: min(440px, calc(100vw - 32px));
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  padding: 20px;
}
.cm-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
}
.cm-msg {
  margin: 0 0 4px;
  color: var(--fg);
  line-height: 1.4;
  word-break: break-word;
}
.cm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.cm-btn {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 0.9rem;
}
.cm-btn:hover {
  border-color: var(--primary);
}
.cm-danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.cm-danger:hover {
  filter: brightness(1.08);
  border-color: var(--danger);
}
</style>
