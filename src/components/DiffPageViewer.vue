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

<!--
  The 2D diff view engine — consumes difference_service's §7.2 SVG contract.

  Each page is an SVG carrying three layer groups with stable ids (#diff-old,
  #diff-new, #diff-changes) and a `data-diff-state` on every element. Switching
  between before / after / difference is therefore just showing and hiding those
  groups: NO re-fetch, which is the whole point of the contract and what makes
  flipping views instant.

  Colours live here, not in the SVG. The service ships semantic state only, so the
  palette below is the single place red/green/orange is decided and a theme can
  restyle a stored diff without regenerating anything.

  One engine drives BOTH modes: a raster page embeds bitmaps inside the identical
  layer structure, so nothing here needs to know whether a page was vectorised —
  it reads the per-page mode only to label the page for the user.
-->

<template>
  <div class="dv-root">
    <div class="dv-bar">
      <div class="dv-views" role="group" aria-label="Comparison view">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          class="dv-view"
          :class="{ active: view === v.id }"
          :aria-pressed="view === v.id"
          :title="v.help"
          @click="view = v.id"
        >
          {{ v.label }}
        </button>
      </div>

      <nav v-if="pages.length > 1" class="dv-pages" aria-label="Pages">
        <button class="dv-nav" :disabled="pageIndex === 0" title="Previous page" @click="step(-1)">‹</button>
        <span class="dv-page-lbl">Page {{ pageIndex + 1 }} / {{ pages.length }}</span>
        <button
          class="dv-nav"
          :disabled="pageIndex >= pages.length - 1"
          title="Next page"
          @click="step(1)"
        >›</button>
      </nav>

      <span v-if="currentMode" class="dv-mode" :class="`mode-${currentMode}`" :title="modeHelp">
        {{ modeLabel }}
      </span>

      <span class="dv-legend" aria-hidden="true">
        <span class="dv-key added">added</span>
        <span class="dv-key deleted">deleted</span>
        <span class="dv-key modified">modified</span>
      </span>
    </div>

    <p v-if="error" class="dv-err">{{ error }}</p>
    <p v-else-if="loading" class="dv-muted">Loading page…</p>

    <!-- A page no tier could render still occupies its slot, so the document's
         page numbering stays truthful; saying so plainly beats an empty page that
         reads as "nothing changed here". -->
    <p v-else-if="currentMode === 'unavailable'" class="dv-muted dv-unavailable">
      No comparison could be produced for this page. Use <em>Before</em> / <em>After</em>
      on the original file to inspect it.
    </p>

    <div
      v-else
      ref="stageEl"
      class="dv-stage"
      :class="[`view-${view}`, `mode-${currentMode}`]"
      v-html="svg"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { renditionText } from '@/services/renditions'
import { errorMessage } from '@/services/apiClient'
import type { DiffChildRef, DiffMode } from '@/services/differenceService'

const props = defineProps<{ pages: DiffChildRef[] }>()

type ViewId = 'before' | 'after' | 'difference'

const VIEWS: Array<{ id: ViewId; label: string; help: string }> = [
  { id: 'before', label: 'Before', help: 'The base version on its own' },
  { id: 'after', label: 'After', help: 'The target version on its own' },
  { id: 'difference', label: 'Difference', help: 'Only what changed, over the page' },
]

const view = ref<ViewId>('difference')
const pageIndex = ref(0)
const svg = ref('')
const loading = ref(false)
const error = ref('')

// Fetched SVGs are cached per rendition uid: flipping back to a page the reader
// has already seen must not re-download it.
const cache = new Map<string, string>()

const current = computed<DiffChildRef | undefined>(() => props.pages[pageIndex.value])
const currentMode = computed<DiffMode | ''>(() => current.value?.mode ?? '')

const modeLabel = computed(() => {
  switch (currentMode.value) {
    case 'vector': return 'vector'
    case 'raster': return 'scanned'
    case 'hybrid': return 'hybrid'
    case 'unavailable': return 'unavailable'
    default: return String(currentMode.value || '')
  }
})

const modeHelp = computed(() => {
  switch (currentMode.value) {
    case 'vector':
      return 'Compared object by object — text and shapes are matched individually.'
    case 'raster':
      return 'This page is scanned or image-only, so it was compared as an image: '
        + 'changed regions are highlighted rather than individual objects.'
    case 'hybrid':
      return 'Text was compared semantically; the graphics layer as an image.'
    case 'unavailable':
      return 'No comparison could be produced for this page.'
    default:
      return ''
  }
})

function step(delta: number) {
  const next = pageIndex.value + delta
  if (next >= 0 && next < props.pages.length) pageIndex.value = next
}

async function loadPage() {
  const child = current.value
  svg.value = ''
  error.value = ''
  if (!child || !child.uid || child.mode === 'unavailable') return

  const cached = cache.get(child.uid)
  if (cached) {
    svg.value = cached
    return
  }

  loading.value = true
  try {
    const text = await renditionText(child.uid)
    cache.set(child.uid, text)
    svg.value = text
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load this page of the comparison')
  } finally {
    loading.value = false
  }
}

// Reset to the first page when a different comparison is shown, so a reader is
// never left on page 9 of a two-page result.
watch(() => props.pages, () => {
  pageIndex.value = 0
  loadPage()
}, { immediate: true, deep: false })

watch(pageIndex, loadPage)
</script>

<style scoped>
/*
 * Theme tokens are the app's own (App.vue :root / [data-theme='dark']):
 * --fg --muted --border --bg --card --primary --danger --success.
 * An earlier version invented --surface/--ink/--accent with hard-coded
 * fallbacks, which is why this panel never followed the theme: the variables
 * did not exist, so every rule silently used its fallback.
 *
 * The diff palette is declared per theme rather than fixed, because the light
 * red/green/orange that reads well on white paper is muddy on a dark surface.
 */
.dv-root {
  --diff-added: #16a34a;
  --diff-deleted: #dc2626;
  --diff-modified: #ea580c;
  /* The page itself is paper. It stays light in both themes — inverting a
     drawing would misrepresent the document, and every PDF viewer in the stack
     keeps the page white while the chrome follows the theme. */
  --diff-paper: #ffffff;
  --diff-unchanged: #111827;
}

:root[data-theme='dark'] .dv-root,
.theme-dark .dv-root {
  /* Lifted for contrast against the darker chrome; the paper stays paper. */
  --diff-added: #4ade80;
  --diff-deleted: #f87171;
  --diff-modified: #fb923c;
}

.dv-root {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  height: 100%;
}

.dv-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dv-views {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.dv-view {
  border: 0;
  background: transparent;
  color: var(--fg);
  padding: 0.3rem 0.7rem;
  cursor: pointer;
  font: inherit;
}

.dv-view.active {
  background: var(--primary);
  color: #fff;
}

.dv-pages { display: inline-flex; align-items: center; gap: 0.4rem; }
.dv-nav { border: 1px solid var(--border); background: transparent; color: var(--fg); border-radius: 4px; cursor: pointer; padding: 0.15rem 0.5rem; }
.dv-nav:disabled { opacity: 0.4; cursor: default; }
.dv-page-lbl { font-size: 0.85rem; color: var(--muted); }

.dv-mode {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
  opacity: 0.8;
}
.dv-mode { color: var(--muted); }
.dv-mode.mode-raster { border-color: var(--diff-modified); color: var(--diff-modified); }
.dv-mode.mode-unavailable { border-color: var(--muted); color: var(--muted); }

.dv-legend { margin-left: auto; display: inline-flex; gap: 0.6rem; font-size: 0.75rem; }
.dv-key::before {
  content: '';
  display: inline-block;
  width: 0.7em; height: 0.7em;
  margin-right: 0.25em;
  border-radius: 2px;
  vertical-align: baseline;
}
.dv-key.added::before { background: var(--diff-added); }
.dv-key.deleted::before { background: var(--diff-deleted); }
.dv-key.modified::before { background: var(--diff-modified); }

.dv-err { color: var(--danger); }
.dv-muted { color: var(--muted); }
.dv-unavailable { padding: 1rem; border: 1px dashed var(--border); border-radius: 6px; color: var(--muted); }

.dv-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--diff-paper);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.dv-stage :deep(svg) { display: block; width: 100%; height: auto; }

/*
 * View switching = showing/hiding the three layer groups (§7.2). No re-fetch, and
 * no dependence on anything inside the page beyond the stable layer ids.
 */
.dv-stage :deep(#diff-old),
.dv-stage :deep(#diff-new),
.dv-stage :deep(#diff-changes) { display: none; }

.dv-stage.view-before :deep(#diff-old) { display: block; }
.dv-stage.view-after :deep(#diff-new) { display: block; }

/* The difference view paints the changes OVER the after-state, so a reader sees
   what changed in context rather than floating in empty space. */
.dv-stage.view-difference :deep(#diff-new) { display: block; opacity: 0.25; }
.dv-stage.view-difference :deep(#diff-changes) { display: block; }

/*
 * State -> colour, applied HERE rather than in the stored SVG. The service ships
 * semantic state only, so a theme change restyles existing diffs with no
 * regeneration. Vector elements are painted; raster pages carry <image> layers
 * that are tinted instead, since a bitmap has no fill to set.
 */
.dv-stage :deep([data-diff-state='added']) { fill: var(--diff-added); stroke: var(--diff-added); }
.dv-stage :deep([data-diff-state='deleted']) { fill: var(--diff-deleted); stroke: var(--diff-deleted); }
.dv-stage :deep([data-diff-state='modified']) { fill: var(--diff-modified); stroke: var(--diff-modified); }
.dv-stage :deep([data-diff-state='unchanged']) { fill: var(--diff-unchanged); stroke: var(--diff-unchanged); }

/* A path drawn with fill="none" (an unfilled stroke) must keep its stroke-only
   rendering — forcing a fill would turn every outlined rectangle into a slab. */
.dv-stage :deep(path[fill='none']) { fill: none !important; }

/* Raster layers: tint the overlay rather than recolouring pixels. */
.dv-stage :deep(image[data-diff-state='modified']) { filter: sepia(1) saturate(4) hue-rotate(-25deg); }
</style>
