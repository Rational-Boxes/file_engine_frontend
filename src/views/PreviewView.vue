<template>
  <div class="preview-view">
    <AppNav />
    <main class="content">
      <button class="link back" @click="back">← Back</button>
      <h1 class="title">{{ name || uid }}</h1>
      <p v-if="error" class="err">{{ error }}</p>

      <p v-if="is3d" class="muted">Opening the 3D viewer…</p>
      <div v-else class="pv-stage" :class="`pv-${panelLayout}`">
        <div class="pv-doc"><DocumentPreview :uid="uid" :name="name" full-width /></div>
        <ThreadPanel
          :file-uid="uid"
          :focus-thread="focusThread"
          :focus-comment="focusComment"
          @layout="panelLayout = $event"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import ThreadPanel from '@/components/ThreadPanel.vue'
import { fileService } from '@/services/fileService'
import { useModel3dStore } from '@/stores/model3d'
import { is3DModel } from '@/utils/modelFormat'

const route = useRoute()
const router = useRouter()
const model3d = useModel3dStore()

const uid = computed(() => String(route.params.uid || ''))
const name = ref('')
const error = ref('')
const is3d = computed(() => is3DModel(name.value))

// Layout is owned by ThreadPanel (persisted); we mirror it here to reflow the
// preview around the docked panel (§10b). Deep-link params open the panel to a
// specific thread/comment (§10f).
const panelLayout = ref<'collapsed' | 'right' | 'bottom'>('right')
const focusThread = computed(() => (route.query?.thread as string) || undefined)
const focusComment = computed(() => (route.query?.comment as string) || undefined)

watch(uid, load, { immediate: true })

async function load() {
  name.value = ''
  error.value = ''
  if (!uid.value) return
  // Name (for the title + native-PDF detection); best-effort.
  try {
    name.value = (await fileService.stat(uid.value)).name
  } catch {
    /* name is optional */
  }
  // 3D models open in the dedicated maximal viewer overlay, not DocumentPreview.
  if (is3DModel(name.value)) model3d.open(uid.value, name.value)
}

function back() {
  if (typeof window !== 'undefined' && window.history.length > 1) router.back()
  else router.push('/files')
}
</script>

<style scoped>
.content {
  /* Full-width review so the PDF iframe spans the page. */
  max-width: none;
  margin: 0;
  padding: 12px 18px;
}

.back {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.title {
  font-size: 18px;
  margin: 8px 0 16px;
  word-break: break-all;
}

.err {
  color: var(--danger);
  font-size: 13px;
}

.muted {
  color: var(--muted);
  font-size: 13px;
}

/* Preview + docked ThreadPanel (§10b) — reflow, never overlay. */
.pv-doc {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
}
.pv-right {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.pv-right :deep(.tp) {
  flex: 0 0 360px;
  height: 72vh;
}
.pv-bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pv-bottom :deep(.tp) {
  width: 100%;
}
.pv-collapsed :deep(.tp-toggle) {
  margin-bottom: 10px;
}
@media (max-width: 700px) {
  /* Narrow: right docking degrades to bottom (§10b responsive fallback). */
  .pv-right {
    flex-direction: column;
  }
  .pv-right :deep(.tp) {
    flex: none;
    width: 100%;
    height: auto;
    max-height: 40vh;
  }
}
</style>
