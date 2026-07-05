<template>
  <div class="search-view">
    <AppNav />
    <main class="content">
      <form class="search-bar" @submit.prevent="run">
        <div class="input-wrap">
          <input
            v-model="query"
            ref="inputEl"
            class="search-input"
            type="text"
            placeholder="Search documents…"
            aria-label="Search query"
            @keydown.enter.prevent="run"
            @keydown.esc="clear"
          />
          <button
            v-if="query || hits.length || searched"
            type="button"
            class="clear-x"
            aria-label="Clear search"
            title="Clear search"
            @click="clear"
          >✕</button>
        </div>
        <button class="btn" :disabled="!query.trim() || loading" type="submit">
          {{ loading ? 'Searching…' : 'Search' }}
        </button>
      </form>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="searched && !hits.length && !loading" class="muted">No results.</p>

      <ul v-if="hits.length" class="results">
        <li v-for="h in hits" :key="h.fileUid" class="result">
          <button type="button" class="result-link" @click="openHit(h)">
            <div class="result-head">
              <span class="result-icon" aria-hidden="true">{{ iconFor(h) }}</span>
              <span class="result-name">{{ displayName(h) }}</span>
              <span class="result-score">{{ h.score?.toFixed(2) }}</span>
            </div>
            <!-- Extracted-text excerpt — the indexed content (Markdown for docs;
                 BIM/model strings for 3D). Full Markdown → sanitized HTML so
                 headings, lists, emphasis, tables etc. render visually, not as raw
                 syntax. (A div, not <p>, so block elements nest validly.) -->
            <div
              v-if="h.snippet"
              class="result-snippet md"
              v-html="renderMarkdown(h.snippet)"
            ></div>
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
import { useModel3dStore } from '@/stores/model3d'
import { useFileNames } from '@/composables/useFileNames'
import { renderMarkdown } from '@/utils/markdown'
import { is3DModel, modelIcon } from '@/utils/modelFormat'
import { errorMessage } from '@/services/csaiClient'
import type { SearchHit } from '@/types'

const preview = usePreviewStore()
const model3d = useModel3dStore()
const { names, resolve: resolveNames } = useFileNames()

// A format icon per result: the 3D glyph for models, else a generic document icon.
const iconFor = (h: SearchHit) => modelIcon(displayName(h)) ?? '📄'

// Open a result: 3D models go to the dedicated viewer (never the document text
// preview); everything else opens the document preview overlay.
function openHit(h: SearchHit) {
  const name = displayName(h)
  if (is3DModel(name)) model3d.open(h.fileUid, name)
  else preview.open(h.fileUid, name)
}

const query = ref('')
const hits = ref<SearchHit[]>([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

// Fully reset the search: clear the query, results, and any error/searched state,
// then refocus the input (also bound to the ✕ button and Esc).
function clear() {
  query.value = ''
  hits.value = []
  error.value = ''
  searched.value = false
  inputEl.value?.focus()
}

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

.input-wrap {
  position: relative;
  flex: 1;
  display: flex;
}

.search-input {
  flex: 1;
  padding: 8px 34px 8px 12px; /* right room for the clear ✕ */
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
}

.clear-x {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 6px;
}
.clear-x:hover {
  color: var(--fg);
  background: var(--bg);
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
  background: var(--card);
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

.result-icon {
  font-size: 15px;
  line-height: 1;
}

.result-name {
  flex: 1;
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

/* Rendered Markdown inside a result snippet — kept compact for the result card. */
.result-snippet :deep(p) {
  margin: 0 0 6px;
}
.result-snippet :deep(> :first-child) {
  margin-top: 0;
}
.result-snippet :deep(> :last-child) {
  margin-bottom: 0;
}
.result-snippet :deep(h1),
.result-snippet :deep(h2),
.result-snippet :deep(h3),
.result-snippet :deep(h4) {
  font-size: 13px;
  font-weight: 600;
  margin: 6px 0 2px;
}
.result-snippet :deep(ul),
.result-snippet :deep(ol) {
  margin: 0 0 6px;
  padding-left: 18px;
}
.result-snippet :deep(li) {
  margin: 1px 0;
}
.result-snippet :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 12px;
}
.result-snippet :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 8px 10px;
  border-radius: 6px;
  overflow: auto;
  font-size: 12px;
}
.result-snippet :deep(pre code) {
  background: none;
  padding: 0;
}
.result-snippet :deep(table) {
  border-collapse: collapse;
  font-size: 12px;
}
.result-snippet :deep(th),
.result-snippet :deep(td) {
  border: 1px solid var(--border);
  padding: 2px 6px;
  text-align: left;
}
.result-snippet :deep(a) {
  color: var(--primary);
}
.result-snippet :deep(img) {
  max-width: 100%;
}

</style>
