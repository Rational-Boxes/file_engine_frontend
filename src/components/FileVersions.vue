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
  <div class="versions">
    <p v-if="error" class="v-err">{{ error }}</p>
    <p v-if="loading" class="v-muted">Loading versions…</p>

    <table v-else-if="versions.length" class="v-list">
      <tbody>
        <tr v-for="ts in versions" :key="ts" :class="{ current: ts === current, picked: isPicked(ts) }">
          <td class="v-pick">
            <input
              type="checkbox"
              :checked="isPicked(ts)"
              :disabled="busy || (!isPicked(ts) && selected.length >= 2)"
              :aria-label="`Select version ${formatVersionTimestamp(ts)} for comparison`"
              :title="!isPicked(ts) && selected.length >= 2
                ? 'Two versions are already selected — clear one first'
                : 'Select this version to compare'"
              @change="togglePick(ts)"
            />
          </td>
          <td class="v-ts">
            {{ formatVersionTimestamp(ts) }}<span v-if="ts === current" class="v-cur">current</span>
          </td>
          <td class="v-act">
            <button class="link" :disabled="busy" @click="download(ts)">download</button>
            <button
              v-if="canManage && ts !== current"
              class="link"
              :disabled="busy"
              @click="restore(ts)"
            >
              restore
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="v-muted">No versions.</p>

    <!-- Comparison bar. Exactly two versions must be chosen: a diff is defined
         between a pair, so one selection has nothing to compare against and three
         has no single answer. The checkboxes enforce the ceiling; this states the
         requirement in words rather than leaving a disabled button unexplained. -->
    <div v-if="versions.length > 1" class="v-compare">
      <button
        class="v-btn"
        :disabled="!canCompare || busy"
        :title="canCompare
          ? 'Compare the two selected versions'
          : 'Select two versions to compare'"
        @click="compareSelected"
      >
        <span v-if="comparing" class="v-spin" aria-hidden="true"></span>
        {{ comparing ? 'Opening…' : 'Compare selected' }}
      </button>
      <span class="v-hint">
        <template v-if="canCompare">
          {{ formatVersionTimestamp(olderSelected) }} → {{ formatVersionTimestamp(newerSelected) }}
        </template>
        <template v-else-if="selected.length === 1">Select one more version.</template>
        <template v-else>Select two versions to compare.</template>
      </span>
      <button v-if="selected.length" class="link" :disabled="busy" @click="selected = []">clear</button>
    </div>

    <form v-if="canManage && versions.length > 1" class="v-purge" @submit.prevent="purge">
      <label class="v-keep-label">
        Keep newest
        <input v-model.number="keep" type="number" min="1" class="v-keep" />
      </label>
      <button class="link danger" type="submit" :disabled="busy">Purge older</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fileService } from '@/services/fileService'
import { errorMessage } from '@/services/apiClient'
import { useDifferenceStore } from '@/stores/difference'
import { usePreviewStore } from '@/stores/preview'
import { formatVersionTimestamp, versionFilename } from '@/utils/format'

const props = defineProps<{ uid: string; name?: string; current?: string; canManage?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const difference = useDifferenceStore()
const preview = usePreviewStore()

const versions = ref<string[]>([])
// At most two, in click order. The cap is enforced on the inputs as well, so the
// invalid state is unreachable rather than merely rejected on submit.
const selected = ref<string[]>([])
const comparing = ref(false)
const loading = ref(false)
const error = ref('')
const busy = ref(false)
const keep = ref(1)

watch(() => props.uid, load, { immediate: true })

async function load() {
  if (!props.uid) return
  selected.value = []          // a selection from another file means nothing here
  loading.value = true
  error.value = ''
  try {
    const list = await fileService.listVersions(props.uid)
    versions.value = [...list].sort().reverse() // timestamp ids → newest first
    // With exactly two versions there is only ONE possible pair, so asking the
    // reviewer to tick both is busywork — preselect it and leave Compare ready.
    // With three or more the choice is real and must stay explicit.
    if (versions.value.length === 2) selected.value = [...versions.value]
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load versions')
    versions.value = []
  } finally {
    loading.value = false
  }
}

function isPicked(ts: string): boolean {
  return selected.value.includes(ts)
}

function togglePick(ts: string) {
  if (isPicked(ts)) {
    selected.value = selected.value.filter((v) => v !== ts)
  } else if (selected.value.length < 2) {
    selected.value = [...selected.value, ts]
  }
}

const canCompare = computed(() => selected.value.length === 2)

// `versions` is newest-first, so the SMALLER index is the newer version. Deriving
// old/new from list position rather than click order means the pair is always the
// right way round however the reviewer ticked the boxes — picking them bottom-up
// must not invert the comparison.
const newerSelected = computed(() => {
  if (!canCompare.value) return ''
  return [...selected.value].sort(
    (a, b) => versions.value.indexOf(a) - versions.value.indexOf(b))[0]
})
const olderSelected = computed(() => {
  if (!canCompare.value) return ''
  return [...selected.value].sort(
    (a, b) => versions.value.indexOf(a) - versions.value.indexOf(b))[1]
})

async function compareSelected() {
  if (!canCompare.value) return
  comparing.value = true
  try {
    // Two calls, one window: the request says WHICH comparison, the preview
    // store opens the surface that shows it — the same surface that holds the
    // document, its markup and its discussion.
    difference.open(props.uid, props.name || '', newerSelected.value, olderSelected.value)
    preview.open(props.uid, props.name || '')
  } finally {
    // The preview surface owns the long-running work and shows its own progress;
    // this spinner only covers the hand-off so the button cannot be double-clicked.
    setTimeout(() => { comparing.value = false }, 400)
  }
}

async function download(ts: string) {
  busy.value = true
  error.value = ''
  try {
    const blob = await fileService.getVersion(props.uid, ts)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = versionFilename(props.name ?? '', ts)
    // Must be in the DOM for the `download` filename to be honored (otherwise the
    // browser falls back to the blob-URL's UUID).
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = errorMessage(e, 'Download failed')
  } finally {
    busy.value = false
  }
}

async function restore(ts: string) {
  busy.value = true
  error.value = ''
  try {
    await fileService.restoreVersion(props.uid, ts)
    await load()
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e, 'Restore failed')
  } finally {
    busy.value = false
  }
}

async function purge() {
  busy.value = true
  error.value = ''
  try {
    await fileService.purgeVersions(props.uid, keep.value || 1)
    await load()
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e, 'Purge failed')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
/*
 * The compare button is styled HERE. It previously carried `class="btn"`, which
 * this component does not define and cannot inherit — sibling styles are scoped —
 * so it rendered unstyled and picked up whatever colours were around it, which in
 * dark mode meant a light label on a light background.
 */
.v-btn {
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--primary);
  color: #fff;                 /* on --primary, which is blue in both themes */
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.v-btn:hover:not(:disabled) { background: var(--primary-hover); }
.v-btn:disabled {
  background: var(--card);
  color: var(--muted);
  border-color: var(--border);
  cursor: default;
}

.v-pick { width: 1.6rem; padding-right: 0.25rem; }
.v-list tr.picked { background: color-mix(in srgb, var(--primary) 10%, transparent); }

.v-compare {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
}
.v-hint { font-size: 0.85rem; color: var(--muted); }

/* The comparison runs server-side and can take a while on a complex document, so
   the button says so rather than looking inert while nothing appears to happen. */
.v-spin {
  display: inline-block;
  width: 0.75em;
  height: 0.75em;
  margin-right: 0.35em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: v-spin 0.7s linear infinite;
  vertical-align: -0.1em;
}
@keyframes v-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .v-spin { animation-duration: 2s; } }

.versions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.v-err {
  color: var(--danger);
  font-size: 12px;
}

.v-muted {
  color: var(--muted);
  font-size: 12px;
}

.v-list {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.v-list td {
  padding: 6px 6px;
  border-top: 1px solid var(--border);
  vertical-align: middle;
}

.v-list tr.current .v-ts {
  font-weight: 600;
}

.v-cur {
  margin-left: 6px;
  font-size: 10px;
  text-transform: uppercase;
  color: #15803d;
}

.v-act {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.mono {
  font-family: var(--font-sans);
}

.link {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.link.danger {
  color: var(--danger);
}

.link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.v-purge {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.v-keep-label {
  font-size: 12px;
  color: var(--muted);
}

.v-keep {
  width: 56px;
  margin-left: 6px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
