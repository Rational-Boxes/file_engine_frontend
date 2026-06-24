<template>
  <div class="preview-view">
    <AppNav />
    <main class="content">
      <button class="link back" @click="back">← Back</button>
      <h1 class="title">{{ name || uid }}</h1>
      <p v-if="error" class="err">{{ error }}</p>

      <DocumentPreview :uid="uid" :name="name" full-width />

      <section v-if="text" class="text-pane">
        <h2 class="th">Extracted text</h2>
        <pre class="md">{{ text }}</pre>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import { fileService } from '@/services/fileService'
import { searchService } from '@/services/searchService'

const route = useRoute()
const router = useRouter()

const uid = computed(() => String(route.params.uid || ''))
const name = ref('')
const text = ref('')
const error = ref('')

watch(uid, load, { immediate: true })

async function load() {
  name.value = ''
  text.value = ''
  error.value = ''
  if (!uid.value) return
  // Name (for the title + native-PDF detection); best-effort.
  try {
    name.value = (await fileService.stat(uid.value)).name
  } catch {
    /* name is optional */
  }
  // Extracted Markdown from convert_search_ai (404 when none — not an error).
  try {
    text.value = (await searchService.getText(uid.value)).text
  } catch {
    /* no extracted text is fine */
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

.text-pane {
  margin-top: 18px;
  max-width: 900px;
}

.th {
  font-size: 14px;
  margin: 0 0 8px;
}

.md {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  margin: 0;
  max-height: 60vh;
  overflow: auto;
}
</style>
