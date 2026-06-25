<template>
  <div class="search-view">
    <AppNav />
    <main class="content">
      <form class="search-bar" @submit.prevent="run">
        <input
          v-model="query"
          class="search-input"
          type="search"
          placeholder="Search documents…"
          aria-label="Search query"
        />
        <button class="btn" :disabled="!query.trim() || loading" type="submit">
          {{ loading ? 'Searching…' : 'Search' }}
        </button>
      </form>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="searched && !hits.length && !loading" class="muted">No results.</p>

      <ul v-if="hits.length" class="results">
        <li v-for="h in hits" :key="h.fileUid" class="result">
          <button type="button" class="result-link" @click="preview.open(h.fileUid, displayName(h))">
            <div class="result-head">
              <span class="result-name">{{ displayName(h) }}</span>
              <span class="result-score">{{ h.score?.toFixed(2) }}</span>
            </div>
            <!-- Excerpts may contain Markdown — render inline to sanitized HTML. -->
            <p v-if="h.snippet" class="result-snippet" v-html="renderMarkdownInline(h.snippet)"></p>
          </button>
        </li>
      </ul>
    </main>
  </div>
</template>

<script lang="ts">
// Named so <KeepAlive include> can cache it (state persists across tab switches).
export default { name: 'SearchView' }
</script>

<script setup lang="ts">
import { ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import { searchService } from '@/services/searchService'
import { usePreviewStore } from '@/stores/preview'
import { useFileNames } from '@/composables/useFileNames'
import { renderMarkdownInline } from '@/utils/markdown'
import { errorMessage } from '@/services/csaiClient'
import type { SearchHit } from '@/types'

const preview = usePreviewStore()
const { names, resolve: resolveNames } = useFileNames()

const query = ref('')
const hits = ref<SearchHit[]>([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)

// Prefer the hit's own name, then a resolved name, then the UID (the UID is
// always shown separately beneath the result).
const displayName = (h: SearchHit) => h.name || names.value[h.fileUid] || h.fileUid

async function run() {
  const q = query.value.trim()
  if (!q) return
  loading.value = true
  error.value = ''
  try {
    hits.value = await searchService.search(q, { limit: 50 })
    searched.value = true
    // Fill in file names for any hit the search didn't already name.
    resolveNames(hits.value.filter((h) => !h.name).map((h) => h.fileUid))
  } catch (e) {
    error.value = errorMessage(e, 'Search failed')
    hits.value = []
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.content {
  max-width: 820px;
  margin: 0 auto;
  padding: 20px 18px;
}

.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
}

.btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 14px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.err {
  color: var(--danger);
  font-size: 13px;
}

.muted {
  color: var(--muted);
  font-size: 13px;
}

.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.result-link {
  display: block;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}

.result-link:hover {
  background: var(--bg);
  border-radius: 10px;
}

.result-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.result-name {
  font-weight: 600;
  color: var(--fg);
}

.result-score {
  font-size: 12px;
  color: var(--muted);
}

.result-snippet {
  margin: 6px 0 4px;
  font-size: 13px;
  color: var(--fg);
}

</style>
