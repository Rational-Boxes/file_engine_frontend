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
    <div v-if="open" class="rt-root" role="dialog" aria-modal="true" aria-label="Limit search to folders">
      <div class="rt-backdrop" @click="emit('cancel')"></div>

      <div class="rt-panel" @keydown="onKeydown">
        <h2 class="rt-title">Limit search to folders</h2>
        <p class="rt-sub">
          Tick the folders the assistant may search — it uses the selected folders and
          everything inside them. Select nothing to search all your documents.
        </p>

        <NodeBrowser multi-select v-model="chosen" />

        <div v-if="chosen.length" class="fs-selected">
          <p class="rt-hint">{{ chosen.length }} selected:</p>
          <ul class="fs-chips">
            <li v-for="s in sorted" :key="s.uid" class="fs-chip" :title="s.path">
              <span class="fs-chip-txt">{{ s.path }}</span>
              <button class="fs-chip-x" type="button" title="Remove" @click="removeUid(s.uid)">✕</button>
            </li>
          </ul>
        </div>

        <div class="rt-actions">
          <button class="rt-btn" type="button" @click="emit('cancel')">Cancel</button>
          <button class="rt-btn rt-primary" type="button" @click="apply">
            {{ chosen.length ? `Limit to ${chosen.length} folder${chosen.length === 1 ? '' : 's'}` : 'Search all documents' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import NodeBrowser, { type FolderRef } from '@/components/NodeBrowser.vue'

const props = defineProps<{ open: boolean; selected: FolderRef[] }>()
const emit = defineEmits<{
  (e: 'apply', folders: FolderRef[]): void
  (e: 'cancel'): void
}>()

// Working selection, seeded from the active scope each time the dialog opens.
const chosen = ref<FolderRef[]>([])
const sorted = computed(() => [...chosen.value].sort((a, b) => a.path.localeCompare(b.path)))

function removeUid(uid: string) {
  chosen.value = chosen.value.filter((f) => f.uid !== uid)
}
function apply() {
  emit('apply', sorted.value)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) chosen.value = (props.selected || []).map((f) => ({ ...f }))
  },
)
</script>

<style scoped>
.rt-root { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
.rt-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.rt-panel {
  position: relative; width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
  overflow: auto; background: var(--card); color: var(--fg); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); padding: 20px;
}
.rt-title { margin: 0 0 2px; font-size: 1.1rem; }
.rt-sub { margin: 0 0 12px; color: var(--muted); font-size: 0.85rem; }
.rt-hint { margin: 10px 0 4px; color: var(--muted); font-size: 0.8rem; }
.rt-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.rt-btn { padding: 7px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 0.9rem; }
.rt-btn:hover:not(:disabled) { border-color: var(--primary); }
.rt-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.rt-primary:hover:not(:disabled) { filter: brightness(1.08); }
.fs-selected { margin-top: 4px; }
.fs-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow: auto; }
.fs-chip { display: flex; align-items: center; gap: 6px; font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 4px 6px; }
.fs-chip-txt { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.fs-chip-x { flex: 0 0 auto; background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 12px; line-height: 1; padding: 0; }
.fs-chip-x:hover { color: var(--primary); }
</style>
