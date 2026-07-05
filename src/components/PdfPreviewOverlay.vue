<template>
  <Teleport to="body">
    <div v-if="preview.isOpen" class="ov-backdrop" @click.self="preview.close()">
      <div class="ov-panel" role="dialog" aria-modal="true" aria-label="Document preview">
        <header class="ov-head">
          <h1 class="ov-title" :title="title">{{ title }}</h1>
          <div id="ov-titlebar" class="ov-slot"></div>
          <button class="ov-x" aria-label="Close preview" @click="preview.close()">✕</button>
        </header>

        <div class="ov-body">
          <p v-if="error" class="ov-err">{{ error }}</p>
          <DocumentPreview :uid="preview.uid" :name="name" full-width titlebar="#ov-titlebar" />
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

const title = computed(() => name.value || preview.name || preview.uid)

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
  preview.close()
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

.ov-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  background: #fff;
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

.ov-x {
  border: none;
  background: none;
  font-size: 18px;
  color: var(--muted);
  line-height: 1;
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
