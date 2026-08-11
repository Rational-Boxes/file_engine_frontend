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
  <div class="cset">
    <p class="cset-lede">
      Classifier sets drive the folder sorter: each classification scores a document by
      matching weighted terms, and routes fire when a score clears a threshold.
    </p>

    <p v-if="!isAdmin" class="cset-err">You need administrator access to manage classifier sets.</p>
    <p v-else-if="error" class="cset-err">{{ error }}</p>

    <div v-if="isAdmin" class="cset-layout">
      <!-- ============ LEFT: list of sets ============ -->
      <aside class="cset-list-pane">
        <div class="cset-list-head">
          <h2>Sets</h2>
          <button class="btn" :disabled="busy" @click="createSet">➕ New set</button>
        </div>

        <p v-if="importNotice" class="cset-ok">{{ importNotice }}</p>

        <ul class="cset-list">
          <li
            v-for="s in sets"
            :key="s.id"
            :class="{ active: selectedId === s.id }"
          >
            <button class="cset-name" @click="selectSet(s.id)">
              <span class="cset-name-row">
                {{ s.name || '(unnamed)' }}
                <span v-if="s.managed_by" class="cset-managed" :title="managedTitle(s.managed_by)">managed</span>
              </span>
              <span class="muted">{{ s.updated_at ? fmtTs(s.updated_at) : '' }}</span>
            </button>
            <button class="link" title="Export YAML" @click="exportSet(s.id, s.name)">⬇</button>
            <button class="link danger" title="Delete set" @click="deleteSet(s)">🗑</button>
          </li>
          <li v-if="loaded && !sets.length" class="muted empty">No classifier sets yet.</li>
          <li v-else-if="!loaded" class="muted empty">Loading…</li>
        </ul>

        <!-- Import YAML -->
        <div class="cset-import">
          <h3>⬆ Import YAML</h3>
          <p class="muted">Paste a set definition or choose a <code>.yaml</code> file.</p>
          <textarea
            v-model="importText"
            rows="5"
            placeholder="name: My set&#10;classifiers:&#10;  - name: Invoices&#10;    terms:&#10;      - term: invoice&#10;        distance: 0&#10;        weight: 1.0"
          ></textarea>
          <div class="row">
            <input ref="importFileInput" type="file" accept=".yaml,.yml,text/yaml" @change="onImportFile" />
            <button class="btn" :disabled="busy || !importText.trim()" @click="importYaml">Import</button>
          </div>
        </div>
      </aside>

      <!-- ============ RIGHT: editor + test ============ -->
      <section class="cset-editor-pane">
        <p v-if="!selectedId" class="muted empty">Select a set on the left, or create one, to edit it.</p>

        <template v-else-if="draft">
          <p v-if="draft.managed_by" class="cset-managed-warn">
            ⚠ Externally managed by <strong>{{ draft.managed_by }}</strong> — changes
            here may be overwritten on the next provisioning sync.
          </p>
          <div class="cset-editor-head">
            <label class="grow">Set name<input v-model="draft.name" placeholder="Set name" /></label>
            <button class="btn" :disabled="busy" @click="saveSet">💾 Save</button>
          </div>
          <p v-if="saveNotice" class="cset-ok">{{ saveNotice }}</p>

          <p class="cset-help muted">
            Wildcards in terms: <code>*</code> any run of characters, <code>?</code> a single
            character, <code>#</code> a single digit. <strong>distance</strong> is the allowed edit
            distance (fuzziness); <strong>weight</strong> is how much a match contributes.
            Scores are unbounded weighted sums, so calibrate route thresholds against the real
            numbers the test panel returns below.
          </p>

          <!-- classifications -->
          <div
            v-for="(c, ci) in draft.classifiers"
            :key="ci"
            class="cset-class"
          >
            <div class="cset-class-head">
              <label class="grow">Classification<input v-model="c.name" placeholder="Classification name" /></label>
              <button class="link danger" @click="removeClassifier(ci)">Remove classification</button>
            </div>

            <table class="cset-terms">
              <thead>
                <tr><th>term</th><th>distance</th><th>weight</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="(t, ti) in c.terms" :key="ti">
                  <td><input v-model="t.term" placeholder="term / pattern" /></td>
                  <td><input v-model.number="t.distance" type="number" step="1" min="0" class="num" /></td>
                  <td><input v-model.number="t.weight" type="number" step="0.1" class="num" /></td>
                  <td><button class="link danger" title="Remove term" @click="removeTerm(c, ti)">✕</button></td>
                </tr>
                <tr v-if="!c.terms.length"><td colspan="4" class="muted empty">No terms yet.</td></tr>
              </tbody>
            </table>
            <button class="link" @click="addTerm(c)">➕ Add term</button>
          </div>

          <button class="btn ghost" @click="addClassifier">➕ Add classification</button>

          <!-- ============ TEST PANEL ============ -->
          <div class="cset-test">
            <h2>🧪 Test &amp; calibrate</h2>
            <p class="muted">
              Run sample text (or a chosen file) through the <em>saved</em> set to see the
              real scores each classification produces — that is how you pick route thresholds.
            </p>
            <label>Sample text
              <textarea v-model="testText" rows="6" placeholder="Paste representative document text here…"></textarea>
            </label>
            <div class="cset-testfile">
              <button class="btn ghost" type="button" @click="pickingFile = true">📄 Choose file…</button>
              <template v-if="testFile">
                <span class="cset-testfile-name" :title="testFile.path || testFile.name">{{ testFile.name }}</span>
                <button class="cset-testfile-clear" type="button" title="Clear selected file" @click="testFile = null">✕</button>
              </template>
              <span v-else class="muted">…or pick a stored file (optional)</span>
            </div>
            <div class="row">
              <button class="btn" :disabled="busy || (!testText.trim() && !testFile)" @click="runTest">
                Run test
              </button>
            </div>

            <div v-if="testResult" class="cset-scores">
              <h3>Scores</h3>
              <p v-if="!sortedScores.length" class="muted empty">No classifications scored above zero.</p>
              <div v-for="row in sortedScores" :key="row.name" class="cset-score-row">
                <span class="cset-score-label" :title="row.name">{{ row.name }}</span>
                <span class="cset-score-bar">
                  <span class="cset-score-fill" :style="{ width: barWidth(row.score) }"></span>
                </span>
                <span class="cset-score-val">{{ row.score.toFixed(3) }}</span>
              </div>

              <template v-if="hasMatches">
                <h3>Matches</h3>
                <pre class="cset-matches">{{ prettyMatches }}</pre>
              </template>
            </div>
          </div>
        </template>

        <p v-else class="muted empty">Loading set…</p>
      </section>
    </div>

    <!-- Tester file picker. The chosen file lives in `testFile` (persists across
         runs and set switches), so re-testing the ruleset doesn't require re-picking. -->
    <div v-if="pickingFile" class="cset-modal" role="dialog" aria-modal="true" aria-label="Pick a file to test">
      <div class="cset-modal-backdrop" @click="pickingFile = false"></div>
      <div class="cset-modal-panel">
        <h3 class="cset-modal-title">Pick a file to test</h3>
        <NodeBrowser pick-files :selected-uid="testFile?.uid" @select-file="onPickTestFile" />
        <div class="cset-modal-actions">
          <button class="btn" type="button" @click="pickingFile = false">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import NodeBrowser from '@/components/NodeBrowser.vue'
import { folderActionsService } from '@/services/folderActionsService'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'
import type {
  ClassifierSetSummary, ClassifierSetFull, Classifier, ClassifierTestResult,
} from '@/types/folderActions'

const auth = useAuthStore()
const isAdmin = computed(() => auth.hasAccessLevel('admin'))

const error = ref('')
const busy = ref(false)
const loaded = ref(false)

const sets = ref<ClassifierSetSummary[]>([])
const selectedId = ref<string | null>(null)
// Working copy of the selected set — edits stay local until Save.
const draft = ref<ClassifierSetFull | null>(null)

const importText = ref('')
const importFileInput = ref<HTMLInputElement | null>(null)
const importNotice = ref('')
const saveNotice = ref('')

const testText = ref('')
// The chosen test file. Deliberately NOT reset when switching/saving sets, so the
// same document can be run against different rulesets without re-picking it.
const testFile = ref<{ uid: string; name: string; path: string } | null>(null)
const pickingFile = ref(false)

function onPickTestFile(file: { uid: string; name: string; path: string }) {
  testFile.value = file
  pickingFile.value = false
}
const testResult = ref<ClassifierTestResult | null>(null)

onMounted(() => {
  if (isAdmin.value) loadSets()
})

// Run an async unit of work with shared busy/error handling.
function wrap(fn: () => Promise<void>) {
  return async () => {
    busy.value = true
    error.value = ''
    try {
      await fn()
    } catch (e) {
      error.value = errorMessage(e, 'Request failed')
    } finally {
      busy.value = false
    }
  }
}

function fmtTs(ts: string) {
  const d = new Date(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleDateString()
}
function managedTitle(by: string) {
  return `Externally managed by ${by} — provisioned by an integration; edits may be overwritten on the next sync.`
}

async function loadSets() {
  loaded.value = false
  try {
    sets.value = await folderActionsService.listClassifierSets()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load classifier sets')
  } finally {
    loaded.value = true
  }
}

const selectSet = (id: string) => wrap(async () => {
  selectedId.value = id
  draft.value = null
  saveNotice.value = ''
  testResult.value = null
  const full = await folderActionsService.getClassifierSet(id)
  // Deep clone so edits don't mutate anything shared, and ensure arrays exist.
  draft.value = {
    id: full.id,
    name: full.name,
    classifiers: (full.classifiers || []).map((c) => ({
      id: c.id,
      name: c.name,
      terms: (c.terms || []).map((t) => ({ ...t })),
    })),
  }
})()

const createSet = wrap(async () => {
  const name = window.prompt('Name for the new classifier set:')?.trim()
  if (!name) return
  const { id } = await folderActionsService.createClassifierSet(name)
  await loadSets()
  await selectSet(id)
})

const deleteSet = (s: ClassifierSetSummary) => wrap(async () => {
  if (!window.confirm(`Delete classifier set “${s.name || s.id}”? This cannot be undone.`)) return
  await folderActionsService.deleteClassifierSet(s.id)
  if (selectedId.value === s.id) {
    selectedId.value = null
    draft.value = null
  }
  await loadSets()
})()

const saveSet = wrap(async () => {
  if (!draft.value || !selectedId.value) return
  saveNotice.value = ''
  const prevId = selectedId.value
  const saved = await folderActionsService.updateClassifierSet(prevId, {
    name: draft.value.name,
    classifiers: draft.value.classifiers,
  })
  await loadSets()
  // The backend PUT may mint a NEW set id (immutable-version semantics): reselect
  // whatever id came back and surface it if it changed.
  if (saved.id && saved.id !== prevId) {
    saveNotice.value = `Saved as a new version — set id changed to ${saved.id}.`
  } else {
    saveNotice.value = 'Saved ✓'
  }
  selectedId.value = saved.id || prevId
  draft.value = {
    id: saved.id,
    name: saved.name,
    classifiers: (saved.classifiers || []).map((c) => ({
      id: c.id,
      name: c.name,
      terms: (c.terms || []).map((t) => ({ ...t })),
    })),
  }
  testResult.value = null
})

// --- classification / term editing (local to the draft) ---
function addClassifier() {
  draft.value?.classifiers.push({ name: '', terms: [] })
}
function removeClassifier(index: number) {
  draft.value?.classifiers.splice(index, 1)
}
function addTerm(c: Classifier) {
  c.terms.push({ term: '', distance: 0, weight: 1 })
}
function removeTerm(c: Classifier, index: number) {
  c.terms.splice(index, 1)
}

// --- import / export ---
function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = String(reader.result || '') }
  reader.readAsText(file)
}

const importYaml = wrap(async () => {
  importNotice.value = ''
  const { id } = await folderActionsService.importClassifierYaml(importText.value)
  importText.value = ''
  if (importFileInput.value) importFileInput.value.value = ''
  await loadSets()
  importNotice.value = 'Imported ✓'
  if (id) await selectSet(id)
})

const exportSet = (id: string, name?: string) => wrap(async () => {
  const yaml = await folderActionsService.exportClassifierYaml(id)
  const blob = new Blob([yaml], { type: 'application/x-yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (name || id).replace(/[^a-z0-9._-]+/gi, '_')
  a.download = `${safe}.yaml`
  a.click()
  URL.revokeObjectURL(url)
})()

// --- test panel ---
const runTest = wrap(async () => {
  if (!selectedId.value) return
  testResult.value = null
  const body: { text?: string; file_uid?: string } = {}
  if (testText.value.trim()) body.text = testText.value
  if (testFile.value) body.file_uid = testFile.value.uid
  testResult.value = await folderActionsService.testClassifierSet(selectedId.value, body)
})

const sortedScores = computed(() => {
  const scores = testResult.value?.scores || {}
  return Object.entries(scores)
    .map(([name, score]) => ({ name, score: Number(score) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
})
const maxScore = computed(() => sortedScores.value.reduce((m, r) => Math.max(m, r.score), 0))
function barWidth(score: number) {
  const max = maxScore.value
  return max > 0 ? `${Math.max(2, (score / max) * 100)}%` : '0%'
}

const hasMatches = computed(() => {
  const m = testResult.value?.matches
  if (m == null) return false
  if (Array.isArray(m)) return m.length > 0
  if (typeof m === 'object') return Object.keys(m).length > 0
  return true
})
const prettyMatches = computed(() => {
  try {
    return JSON.stringify(testResult.value?.matches, null, 2)
  } catch {
    return String(testResult.value?.matches ?? '')
  }
})
</script>

<style scoped>
.cset { display: flex; flex-direction: column; }
.cset-lede { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 720px; }
.cset-err { color: var(--danger); font-size: 13px; }
.cset-ok { color: var(--accent); font-size: 13px; margin: 4px 0; }
.cset-name-row { display: flex; align-items: center; gap: 6px; }
.cset-managed { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; padding: 1px 6px; border-radius: 999px; background: var(--warn-bg, #f59e0b22); color: var(--warn, #b45309); border: 1px solid var(--warn, #b4530955); }
.cset-managed-warn { font-size: 12.5px; color: var(--warn, #b45309); background: var(--warn-bg, #f59e0b14); border: 1px solid var(--warn, #b4530944); border-radius: 8px; padding: 8px 10px; margin: 0 0 8px; }

.cset-layout { display: grid; grid-template-columns: 320px 1fr; gap: 18px; align-items: start; }

/* --- list pane --- */
.cset-list-pane { display: flex; flex-direction: column; gap: 10px; }
.cset-list-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cset-list-head h2 { font-size: 15px; margin: 0; }
.cset-list { list-style: none; padding: 0; margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.cset-list li { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-top: 1px solid var(--border); }
.cset-list li:first-child { border-top: none; }
.cset-list li.active { background: var(--hover); }
.cset-name { flex: 1; text-align: left; border: none; background: none; cursor: pointer; font: inherit; color: var(--fg); display: flex; flex-direction: column; gap: 1px; padding: 4px 2px; }
.cset-import { border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.cset-import h3 { font-size: 13px; margin: 0; }

/* --- editor pane --- */
.cset-editor-pane { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.cset-editor-head { display: flex; align-items: flex-end; gap: 10px; }
.cset-help { max-width: 760px; line-height: 1.5; }
.cset-class { border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; background: var(--card); }
.cset-class-head { display: flex; align-items: flex-end; gap: 10px; }
.cset-terms { width: 100%; border-collapse: collapse; font-size: 13px; }
.cset-terms th { text-align: left; padding: 2px 6px; color: var(--muted); font-weight: 600; }
.cset-terms td { padding: 2px 6px; }
.cset-terms input { width: 100%; }
.cset-terms input.num { max-width: 90px; }

/* --- test panel --- */
.cset-test { border: 1px solid var(--primary); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.cset-test h2 { font-size: 15px; margin: 0; }
.cset-scores { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.cset-scores h3 { font-size: 13px; margin: 8px 0 2px; }
.cset-score-row { display: flex; align-items: center; gap: 8px; }
.cset-score-label { flex: 0 0 180px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cset-score-bar { flex: 1; height: 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
.cset-score-fill { display: block; height: 100%; background: var(--primary); }
.cset-score-val { flex: 0 0 70px; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; }
.cset-matches { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-size: 12px; overflow-x: auto; margin: 2px 0; }

/* --- shared bits --- */
h3 { font-size: 14px; margin: 4px 0 2px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.cset-testfile { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
.cset-testfile-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.cset-testfile-clear { border: none; background: transparent; cursor: pointer; color: var(--muted); font-size: 12px; line-height: 1; padding: 0; }
.cset-testfile-clear:hover { color: var(--danger); }

.cset-modal { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; }
.cset-modal-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); }
.cset-modal-panel {
  position: relative; z-index: 1; background: var(--card, var(--bg)); border: 1px solid var(--border);
  border-radius: 10px; padding: 16px; width: min(520px, 92vw); max-height: 86vh; overflow: auto;
  display: flex; flex-direction: column; gap: 10px;
}
.cset-modal-title { margin: 0; font-size: 15px; }
.cset-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.grow { flex: 1; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
input, textarea {
  padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;
  font-family: inherit; background: var(--card); color: var(--fg); box-sizing: border-box;
}
textarea { width: 100%; resize: vertical; font-family: inherit; }
.muted { color: var(--muted); font-size: 12px; }
.empty { padding: 12px; text-align: center; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.btn.ghost { background: var(--card); color: var(--fg); align-self: flex-start; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; padding: 2px 4px; }
.link.danger { color: var(--danger); }
code { background: var(--bg); padding: 0 4px; border-radius: 4px; font-size: 12px; }

@media (max-width: 820px) {
  .cset-layout { grid-template-columns: 1fr; }
}
</style>
