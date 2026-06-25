<template>
  <div class="preview-view">
    <AppNav />
    <main class="content">
      <button class="link back" @click="back">← Back</button>
      <h1 class="title">{{ name || uid }}</h1>
      <p v-if="error" class="err">{{ error }}</p>

      <DocumentPreview :uid="uid" :name="name" full-width />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import { fileService } from '@/services/fileService'

const route = useRoute()
const router = useRouter()

const uid = computed(() => String(route.params.uid || ''))
const name = ref('')
const error = ref('')

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
</style>
