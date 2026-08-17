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
  Version-comparison overlay. Runs difference_service's §8 request flow and then
  hands off to the right view engine.

  Every one of the service's five statuses gets its own honest presentation,
  because each means something different to the reader:

    ready        render the comparison
    pending      it is computing (tens of seconds is normal) — show progress
    failed       the comparison broke, but the two VERSIONS are fine: offer the
                 side-by-side fallback rather than a dead end
    unsupported  nothing to compute (e.g. an image) — offer a local before/after
                 flip, and do NOT present it as an error
    none         a first version has no predecessor; say so and stop

  3D results are handed to the existing Xeokit viewer unchanged: the service puts
  the model into old / new / difference groups precisely so the stock viewer's
  show/hide/x-ray drives the three views with no new viewer code.
-->

<template>
  <Teleport to="body">
    <div
      v-if="store.isOpen"
      class="df-root"
      role="dialog"
      aria-modal="true"
      :aria-label="`Compare versions of ${store.name || 'file'}`"
      @keydown.esc="close"
    >
      <header class="df-head">
        <h1 class="df-title" :title="store.name">Compare — {{ store.name || 'file' }}</h1>

        <p v-if="pairLabel" class="df-pair">{{ pairLabel }}</p>

        <!-- Change the pair without leaving: the reader is already comparing and
             wanting a different pair is a normal next thought, not a restart. -->
        <VersionPairPicker
          class="df-picker"
          :uid="store.uid"
          :base="result?.baseVersion || store.base"
          :target="result?.targetVersion || store.target"
          :busy="state === 'loading'"
          @compare="recompare"
        />

        <button class="df-close" title="Close (Esc)" aria-label="Close" @click="close">✕</button>
      </header>

      <section class="df-body">
        <!-- computing -->
        <div v-if="state === 'loading'" class="df-state" role="status" aria-live="polite">
          <p class="df-working">
            <span class="df-spinner" aria-hidden="true"></span>
            Comparing versions…
          </p>
          <p class="df-muted">
            This runs on the server. A complex drawing or a large model can take
            a while — the result is stored, so opening it again later is instant.
          </p>
          <!-- Only offered once the wait is clearly not momentary: a "come back
               later" button that appears immediately reads as an apology for
               something that was about to finish. -->
          <button v-if="waited" class="df-btn" @click="close">Close and come back later</button>
        </div>

        <!-- error talking to the service (distinct from a failed comparison) -->
        <div v-else-if="state === 'error'" class="df-state">
          <p class="df-err">{{ error }}</p>
          <button class="df-btn" @click="start">Try again</button>
        </div>

        <!-- ready: 3D -->
        <div v-else-if="result?.status === 'ready' && result.is3d" class="df-state">
          <p>
            The 3D comparison is ready. It opens in the model viewer, where the
            <strong>old</strong>, <strong>new</strong> and <strong>difference</strong>
            groups can be shown, hidden and x-rayed from the objects panel.
          </p>
          <p class="df-muted">
            Elements whose properties changed but whose geometry did not are listed
            in the model tree without being coloured — the model looks unchanged
            because it is.
          </p>
          <button class="df-btn primary" @click="open3d">Open in the 3D viewer</button>
        </div>

        <!-- ready: 2D -->
        <DiffPageViewer v-else-if="result?.status === 'ready'" :pages="pages" class="df-pages" />

        <!-- failed: the diff broke, the versions did not -->
        <div v-else-if="result?.status === 'failed'" class="df-state">
          <p class="df-err">This comparison could not be produced.</p>
          <p v-if="failureText" class="df-muted">{{ failureText }}</p>
          <p>You can still open the two versions and compare them yourself.</p>
          <div class="df-actions">
            <button class="df-btn" @click="downloadSide('base')">Download “before”</button>
            <button class="df-btn" @click="downloadSide('target')">Download “after”</button>
          </div>
        </div>

        <!-- unsupported: not an error -->
        <div v-else-if="result?.status === 'unsupported'" class="df-state">
          <p>Automatic comparison isn’t available for this file type<span v-if="result.mime"> ({{ result.mime }})</span>.</p>
          <p class="df-muted">
            Images and other non-document formats are compared by flipping between
            the two versions.
          </p>
          <div class="df-actions">
            <button class="df-btn" @click="downloadSide('base')">Download “before”</button>
            <button class="df-btn" @click="downloadSide('target')">Download “after”</button>
          </div>
        </div>

        <!-- none: first version -->
        <div v-else-if="result?.status === 'none'" class="df-state">
          <p>This is the file’s first version, so there is nothing to compare it against.</p>
          <button class="df-btn" @click="close">Close</button>
        </div>

        <!-- still pending after the timeout -->
        <div v-else-if="result?.status === 'pending'" class="df-state">
          <p>Still computing.</p>
          <p class="df-muted">
            The comparison is running on the server and will be ready shortly —
            reopening this later will pick up the finished result.
          </p>
          <div class="df-actions">
            <button class="df-btn" @click="start">Keep waiting</button>
            <button class="df-btn" @click="close">Close</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DiffPageViewer from '@/components/DiffPageViewer.vue'
import VersionPairPicker from '@/components/VersionPairPicker.vue'
import { useDifferenceStore } from '@/stores/difference'
import { useModel3dStore } from '@/stores/model3d'
import { differenceService, errorMessage, type DiffResponse } from '@/services/differenceService'
import { fileService } from '@/services/fileService'
import { formatVersionTimestamp, versionFilename } from '@/utils/format'

const store = useDifferenceStore()
const model3d = useModel3dStore()

const result = ref<DiffResponse | null>(null)
const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const error = ref('')
const waited = ref(false)


let controller: AbortController | null = null

const pages = computed(() => (result.value ? differenceService.pageChildren(result.value) : []))

const pairLabel = computed(() => {
  const r = result.value
  if (!r?.baseVersion || !r?.targetVersion) return ''
  return `${formatVersionTimestamp(r.baseVersion)} → ${formatVersionTimestamp(r.targetVersion)}`
})

const failureText = computed(() => {
  const f = result.value?.failure
  if (!f) return ''
  const parts = [f.stage && `stage: ${f.stage}`, f.reason].filter(Boolean)
  return parts.join(' — ')
})

async function start() {
  controller?.abort()
  controller = new AbortController()
  state.value = 'loading'
  error.value = ''
  waited.value = false
  result.value = null

  try {
    const res = await differenceService.getWhenReady(
      store.uid,
      { version: store.target || undefined, base: store.base || undefined },
      {
        signal: controller.signal,
        // Surface the wait honestly once it is clearly not instant, rather than
        // spinning silently and looking hung.
        onProgress: (attempt) => { if (attempt >= 3) waited.value = true },
      },
    )
    result.value = res
    state.value = 'done'
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return
    error.value = errorMessage(e, 'Failed to compare these versions')
    state.value = 'error'
  }
}

function open3d() {
  const model = result.value ? differenceService.modelChild(result.value) : undefined
  if (!model?.uid) return
  // Capture BEFORE closing: `close()` clears the store, so reading store.uid
  // afterwards would hand the viewer an empty uid.
  const sourceUid = store.uid
  const name = `${store.name || 'model'} — comparison`
  const meta = metamodelUid()
  // The 3D viewer normally resolves a file's own model rendition; here it is
  // pointed at the diff children explicitly. Closing this overlay first keeps one
  // dialog open at a time.
  close()
  model3d.open(sourceUid, name, { xktUid: model.uid, metamodelUid: meta })
}

function metamodelUid(): string {
  const meta = result.value ? differenceService.metamodelChild(result.value) : undefined
  return meta?.uid || ''
}

async function downloadSide(side: 'base' | 'target') {
  const r = result.value
  const version = side === 'base' ? r?.baseVersion : r?.targetVersion
  if (!version) return
  try {
    const blob = await fileService.getVersion(store.uid, version)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = versionFilename(store.name || 'file', version)
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to download that version')
  }
}

function close() {
  controller?.abort()
  controller = null
  store.close()
  result.value = null
  state.value = 'idle'
}

// Re-point the store at the chosen pair; the watch below reruns the comparison,
// so there is one path into `start()` rather than two that can drift apart.
function recompare(pair: { base: string; target: string }) {
  store.open(store.uid, store.name, pair.target, pair.base)
}

watch(() => `${store.uid}|${store.target}|${store.base}`, () => {
  if (store.isOpen) start()
}, { immediate: true })

onBeforeUnmount(() => controller?.abort())
</script>

<style scoped>
/* Tokens are the app's own (App.vue): --fg --muted --border --bg --card
   --primary --danger. An earlier version referenced --surface/--ink/--accent,
   which do not exist, so every rule fell through to a hard-coded light value and
   the overlay ignored the theme entirely. */
.df-root {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--fg);
}

.df-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.df-title { font-size: 1rem; margin: 0; font-weight: 600; }
.df-pair { margin: 0; font-size: 0.85rem; color: var(--muted); }

.df-picker { margin-left: 0.75rem; }

.df-close { margin-left: auto; border: 0; background: transparent; color: var(--fg); font-size: 1.1rem; cursor: pointer; }

.df-body { flex: 1; min-height: 0; padding: 1rem; display: flex; flex-direction: column; }
.df-pages { flex: 1; min-height: 0; }

.df-state { max-width: 44rem; display: flex; flex-direction: column; gap: 0.6rem; }
.df-muted { color: var(--muted); margin: 0; }
.df-err { color: var(--danger); margin: 0; }
.df-working { margin: 0; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
.df-spinner {
  width: 1em;
  height: 1em;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: df-spin 0.8s linear infinite;
}
@keyframes df-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .df-spinner { animation-duration: 2.4s; } }

.df-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.df-btn {
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--fg);
  border-radius: 6px;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
  font: inherit;
}
.df-btn:hover { border-color: var(--primary); }
.df-btn.primary { background: var(--primary); color: #fff; border-color: transparent; }
.df-btn.primary:hover { background: var(--primary-hover); }
</style>
