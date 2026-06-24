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
          <router-link class="result-link" :to="`/preview/${h.fileUid}`">
            <div class="result-head">
              <span class="result-name">{{ h.name || h.fileUid }}</span>
              <span class="result-score">{{ h.score?.toFixed(2) }}</span>
            </div>
            <p v-if="h.snippet" class="result-snippet">{{ h.snippet }}</p>
            <span class="result-uid mono">{{ h.fileUid }}</span>
          </router-link>
        </li>
      </ul>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import { searchService } from '@/services/searchService'
import { errorMessage } from '@/services/csaiClient'
import type { SearchHit } from '@/types'

const query = ref('')
const hits = ref<SearchHit[]>([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)

async function run() {
  const q = query.value.trim()
  if (!q) return
  loading.value = true
  error.value = ''
  try {
    hits.value = await searchService.search(q, { limit: 50 })
    searched.value = true
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
  padding: 12px 14px;
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

.result-uid {
  font-size: 11px;
  color: var(--muted);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
