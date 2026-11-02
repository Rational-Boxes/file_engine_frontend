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
  The extraction prompt builder (convert_search_ai EXTRACTION_PROMPT_SETS.md §4).
  Laid out like the classifier editor: sets on the left, the editor and a test
  panel on the right. Edits are a draft until published; desktop applications
  and folder automation only ever see published revisions. Tests run the
  current, unsaved edits on pasted text or a stored file and store nothing.
-->
<template>
  <div class="pset">
    <p class="pset-lede">
      A prompt set says what to extract from a kind of document: typed fields, units and
      instructions. Try it on real documents here, then publish it for desktop applications
      and folder automation.
    </p>

    <p v-if="!canEdit" class="pset-err">You need the administrator or extraction editor role to build prompt sets.</p>
    <p v-else-if="error" class="pset-err">{{ error }}</p>

    <div v-if="canEdit" class="pset-layout">
      <!-- ============ LEFT: sets ============ -->
      <aside class="pset-list-pane">
        <div class="pset-list-head">
          <h2>Prompt sets</h2>
          <button class="btn" :disabled="busy" @click="startNew">➕ New set</button>
        </div>

        <p v-if="notice" class="pset-ok">{{ notice }}</p>

        <ul class="pset-list">
          <li v-for="s in sets" :key="s.id" :class="{ active: selectedId === s.id }">
            <button class="pset-name" @click="select(s.id)">
              <span class="pset-name-row">
                {{ s.name || '(unnamed)' }}
                <span v-if="s.status === 'retired'" class="badge muted-badge">retired</span>
                <span v-else-if="s.revision" class="badge">r{{ s.revision }}</span>
                <span v-if="s.draft_revision" class="badge draft">draft</span>
                <span v-if="s.managed === 'application'" class="badge app" :title="appTitle(s)">app</span>
                <span v-if="s.locked" class="badge" title="Locked: applications cannot change it">🔒</span>
              </span>
              <span class="muted">{{ s.slug || '' }}</span>
            </button>
            <button class="link" title="Export YAML" @click="exportSet(s)">⬇</button>
          </li>
          <li v-if="loaded && !sets.length" class="muted empty">No prompt sets yet.</li>
          <li v-else-if="!loaded" class="muted empty">Loading…</li>
        </ul>

        <div class="pset-import">
          <h3>⬆ Import YAML</h3>
          <p class="muted">Paste a shared definition or choose a <code>.yaml</code> file. Imports arrive as drafts.</p>
          <textarea v-model="importText" rows="5" placeholder="format: fileengine.prompt_set.v1&#10;name: Door datasheet&#10;fields:&#10;  - name: fire_rating&#10;    type: string"></textarea>
          <div class="row">
            <input ref="importFile" type="file" accept=".yaml,.yml,.json,text/yaml" @change="onImportFile" />
          </div>
          <div class="row">
            <label class="inline">If a set with that name exists
              <select v-model="onConflict">
                <option value="new">import as a new set</option>
                <option value="revision">make a new draft of it</option>
              </select>
            </label>
            <button class="btn" :disabled="busy || !importText.trim()" @click="importYaml">Import</button>
          </div>
        </div>
      </aside>

      <!-- ============ RIGHT: editor + test ============ -->
      <section class="pset-editor-pane">
        <p v-if="!draft" class="muted empty">Select a set on the left, or create one.</p>

        <template v-else>
          <div v-if="detail?.managed === 'application'" class="pset-app-note">
            Published by the application <strong>{{ detail.managed_by?.label || 'unknown' }}</strong>.
            It may publish a new revision the next time it starts.
            <span class="row">
              <button class="btn ghost" :disabled="busy" @click="control({ take_over: true })">Take over</button>
              <button class="btn ghost" :disabled="busy" @click="control({ locked: !detail.locked })">
                {{ detail.locked ? 'Unlock' : 'Lock' }}
              </button>
            </span>
          </div>
          <div v-else-if="detail?.locked" class="pset-app-note">
            🔒 Locked: applications cannot change this set.
            <button class="btn ghost" :disabled="busy" @click="control({ locked: false })">Unlock</button>
          </div>

          <div class="pset-status">
            <span v-if="detail?.revision">Published: <strong>r{{ detail.revision }}</strong></span>
            <span v-else>Not published yet</span>
            <span v-if="detail?.draft_revision"> · draft r{{ detail.draft_revision }}</span>
            <span v-if="detail?.status === 'retired'"> · <strong>retired</strong></span>
            <span v-if="dirty" class="dirty"> · unsaved changes</span>
          </div>

          <div class="grid2">
            <label>Name<input v-model="draft.name" placeholder="Door datasheet" /></label>
            <label>Slug (optional, how applications address it)
              <input v-model="draft.slug" placeholder="reviera.door-datasheet" />
            </label>
          </div>
          <label>Description<input v-model="draft.description" placeholder="What documents this is for" /></label>
          <div class="grid2">
            <label>Model
              <select v-model="draft.model">
                <option value="">Default ({{ defaultModel?.label || '…' }})</option>
                <option v-for="m in models" :key="m.id" :value="m.id">{{ m.label }}</option>
                <option v-if="modelUnknown" :value="draft.model">{{ draft.model }} (not offered here)</option>
              </select>
            </label>
            <label>Applies to (classifier labels, comma separated)
              <input v-model="labelsText" placeholder="door_datasheet, window_datasheet" />
            </label>
          </div>
          <p v-if="modelUnknown" class="pset-warn">
            “{{ draft.model }}” is not offered here: runs use the default model ({{ defaultModel?.label }}).
          </p>
          <label>Instructions
            <textarea v-model="draft.instructions" rows="3" placeholder="If several products are listed, use the one named in the file name."></textarea>
          </label>

          <h3>Fields</h3>
          <div class="pset-fields">
            <div v-for="(f, i) in draft.fields" :key="i" class="pset-field">
              <div class="pset-field-row">
                <input v-model="f.name" class="fname" placeholder="field_name" aria-label="Field name" />
                <input v-model="f.label" placeholder="Label" aria-label="Label" />
                <select v-model="f.type" aria-label="Type">
                  <option v-for="t in FIELD_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
                <label class="inline small"><input v-model="f.required" type="checkbox" /> required</label>
                <span class="pset-field-tools">
                  <button class="link" :disabled="i === 0" title="Move up" @click="move(i, -1)">↑</button>
                  <button class="link" :disabled="i === draft.fields.length - 1" title="Move down" @click="move(i, 1)">↓</button>
                  <button class="link danger" title="Remove field" @click="draft.fields.splice(i, 1)">✕</button>
                </span>
              </div>
              <div class="pset-field-row">
                <input v-model="f.description" class="grow" placeholder="What the value is, where it usually appears" aria-label="Description" />
                <template v-if="f.type === 'number' || f.type === 'integer'">
                  <input v-model="f.unit" class="num" placeholder="unit" aria-label="Unit" />
                  <input v-model.number="f.minimum" class="num" type="number" placeholder="min" aria-label="Minimum" />
                  <input v-model.number="f.maximum" class="num" type="number" placeholder="max" aria-label="Maximum" />
                </template>
                <input
                  v-if="f.type === 'enum'"
                  :value="(f.enum || []).join(', ')"
                  class="grow"
                  placeholder="EI 30, EI 60, EI 90"
                  aria-label="Allowed values"
                  @change="f.enum = ($event.target as HTMLInputElement).value.split(',')"
                />
              </div>
            </div>
            <button class="btn ghost" @click="draft.fields.push(newField())">➕ Add field</button>
          </div>

          <div class="row actions">
            <button class="btn" :disabled="busy || !draft.name.trim()" @click="save">💾 Save draft</button>
            <button class="btn" :disabled="busy || !detail?.draft_revision || dirty" :title="dirty ? 'Save the draft first' : ''" @click="publish">
              🚀 Publish
            </button>
            <button v-if="selectedId && detail?.status !== 'retired'" class="btn ghost" :disabled="busy" @click="retire">Retire</button>
          </div>
          <p v-for="w in warnings" :key="w.kind + (w.message || '')" class="pset-warn">{{ w.message || w.kind }}</p>

          <details v-if="detail?.schema" class="pset-schema">
            <summary>Schema the model is given (r{{ detail.revision_shown }}, as saved)</summary>
            <pre>{{ JSON.stringify(detail.schema, null, 2) }}</pre>
          </details>

          <!-- ============ TEST ============ -->
          <div class="pset-test">
            <h2>🧪 Try it</h2>
            <p class="muted">
              Runs your current edits, saved or not, on pasted text or a stored document. Nothing is
              stored, and the result shows exactly what an application would receive.
            </p>
            <label>Sample text
              <textarea v-model="testText" rows="6" placeholder="Paste document text here…"></textarea>
            </label>
            <div class="pset-testfile">
              <button class="btn ghost" type="button" @click="pickingFile = true">📄 Choose file…</button>
              <template v-if="testFile">
                <span class="pset-testfile-name" :title="testFile.path || testFile.name">{{ testFile.name }}</span>
                <button class="pset-testfile-clear" type="button" title="Clear selected file" @click="testFile = null">✕</button>
              </template>
              <span v-else class="muted">…or pick a stored file (used instead of the text)</span>
            </div>
            <div class="row">
              <label class="inline">Model for this test
                <select v-model="testModel">
                  <option value="">The set's model</option>
                  <option v-for="m in models" :key="m.id" :value="m.id">{{ m.label }}</option>
                </select>
              </label>
              <button class="btn" :disabled="testing || (!testText.trim() && !testFile) || !draft.fields.length" @click="runTest">
                {{ testing ? 'Running…' : 'Run test' }}
              </button>
            </div>

            <div v-if="testResult" class="pset-results">
              <p class="muted">
                Model: {{ usedModelLabel }}
                <span v-if="testResult.plan?.model?.fallback">
                  (fallback: “{{ testResult.plan.model.requested }}” is not offered here)
                </span>
                · {{ testItem?.tokens ?? 0 }} tokens
              </p>
              <p v-if="testItem?.skipped" class="pset-warn">Skipped: {{ testItem.skipped }}</p>
              <p v-if="testItem?.error" class="pset-err">{{ testItem.error }}</p>
              <table v-if="testItem?.data" class="pset-table">
                <thead><tr><th>Field</th><th>Value</th><th>Evidence</th></tr></thead>
                <tbody>
                  <tr v-for="f in draft.fields" :key="f.name" :class="{ notfound: !testItem.data[f.name]?.found }">
                    <td>{{ f.label || f.name }}<span v-if="f.required" class="req" title="required">*</span></td>
                    <td>
                      <template v-if="testItem.data[f.name]?.found">
                        {{ fmtValue(testItem.data[f.name].value) }}
                        <span v-if="testItem.data[f.name].unit" class="muted">{{ testItem.data[f.name].unit }}</span>
                      </template>
                      <span v-else class="muted">not found</span>
                    </td>
                    <td class="quote">
                      <template v-if="testItem.data[f.name]?.evidence">
                        “{{ testItem.data[f.name].evidence!.quote }}”
                        <span class="muted">@{{ testItem.data[f.name].evidence!.offset }}</span>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="testItem?.counts?.dropped_no_evidence" class="pset-warn">
                {{ testItem.counts.dropped_no_evidence }} value(s) dropped: their quote is not in the document.
              </p>
              <p v-if="testItem?.problems?.length" class="pset-warn">Problems: {{ testItem.problems.join('; ') }}</p>
            </div>
          </div>
        </template>
      </section>
    </div>

    <div v-if="pickingFile" class="pset-modal" role="dialog" aria-modal="true" aria-label="Pick a file to test">
      <div class="pset-modal-backdrop" @click="pickingFile = false"></div>
      <div class="pset-modal-panel">
        <h3>Pick a file to test</h3>
        <NodeBrowser pick-files :selected-uid="testFile?.uid" @select-file="onPickTestFile" />
        <div class="row end"><button class="btn" type="button" @click="pickingFile = false">Close</button></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import NodeBrowser from '@/components/NodeBrowser.vue'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/services/apiClient'
import {
  FIELD_TYPES, cleanDefinition, newField, promptSetService,
  type ExtractModel, type PromptSetDefinition, type PromptSetDetail, type PromptSetSummary,
  type TestResult, type Warning,
} from '@/services/promptSetService'

const auth = useAuthStore()
const canEdit = computed(() => auth.hasAccessLevel('admin') || auth.hasRole('extraction_editors'))

const error = ref('')
const notice = ref('')
const busy = ref(false)
const loaded = ref(false)
const sets = ref<PromptSetSummary[]>([])
const models = ref<ExtractModel[]>([])
const selectedId = ref<string | null>(null)
const detail = ref<PromptSetDetail | null>(null)
const draft = ref<PromptSetDefinition | null>(null)
const savedJson = ref('')
const warnings = ref<Warning[]>([])

const importText = ref('')
const importFile = ref<HTMLInputElement | null>(null)
const onConflict = ref<'new' | 'revision'>('new')

const testText = ref('')
const testFile = ref<{ uid: string; name: string; path: string } | null>(null)
const testModel = ref('')
const testing = ref(false)
const testResult = ref<TestResult | null>(null)
const pickingFile = ref(false)

const defaultModel = computed(() => models.value.find((m) => m.default))
const modelUnknown = computed(() => !!draft.value?.model && !models.value.some((m) => m.id === draft.value!.model))
const dirty = computed(() => !!draft.value && JSON.stringify(cleanDefinition(draft.value)) !== savedJson.value)
const testItem = computed(() => testResult.value?.items?.[0])
const usedModelLabel = computed(() => {
  const used = testResult.value?.plan?.model?.used
  return models.value.find((m) => m.id === used)?.label || used || ''
})
const labelsText = computed({
  get: () => (draft.value?.applies_to?.labels || []).join(', '),
  set: (v: string) => {
    if (!draft.value) return
    draft.value.applies_to = { ...(draft.value.applies_to || {}), labels: v.split(',') }
  },
})

onMounted(async () => {
  if (!canEdit.value) return
  try {
    models.value = await promptSetService.models()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load the extraction models')
  }
  await loadSets()
})

watch(selectedId, () => { testResult.value = null })

function wrap(fn: () => Promise<void>) {
  return async () => {
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      await fn()
    } catch (e) {
      error.value = errorMessage(e, 'Request failed')
    } finally {
      busy.value = false
    }
  }
}

function appTitle(s: PromptSetSummary) {
  return `Published by the application ${s.managed_by?.label || ''}; it may publish new revisions.`
}

async function loadSets() {
  loaded.value = false
  try {
    sets.value = await promptSetService.list()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load prompt sets')
  } finally {
    loaded.value = true
  }
}

function setDraft(def: PromptSetDefinition) {
  draft.value = JSON.parse(JSON.stringify({
    ...def,
    applies_to: def.applies_to || { classifier_set: '', labels: [] },
    markup: def.markup || { colours: {} },
  }))
  savedJson.value = JSON.stringify(cleanDefinition(draft.value!))
}

const select = (id: string) => wrap(async () => {
  if (dirty.value && !window.confirm('Discard unsaved changes?')) return
  selectedId.value = id
  warnings.value = []
  detail.value = await promptSetService.get(id)
  if (detail.value.definition) setDraft(detail.value.definition)
})()

function startNew() {
  if (dirty.value && !window.confirm('Discard unsaved changes?')) return
  selectedId.value = null
  detail.value = null
  warnings.value = []
  setDraft({ name: '', description: '', slug: '', instructions: '', model: '', fields: [newField()] })
  savedJson.value = ''
}

function move(i: number, by: number) {
  const f = draft.value!.fields
  const [x] = f.splice(i, 1)
  f.splice(i + by, 0, x)
}

const save = wrap(async () => {
  const def = cleanDefinition(draft.value!)
  const out = selectedId.value
    ? await promptSetService.saveDraft(selectedId.value, def)
    : await promptSetService.create(def)
  warnings.value = out.warnings || []
  selectedId.value = out.id
  await loadSets()
  detail.value = await promptSetService.get(out.id)
  setDraft(detail.value.definition || def)
  notice.value = `Saved as draft r${out.draft_revision}`
})

const publish = wrap(async () => {
  if (!selectedId.value) return
  const out = await promptSetService.publish(selectedId.value)
  warnings.value = out.warnings || []
  notice.value = `Published r${out.revision}`
  await loadSets()
  detail.value = await promptSetService.get(selectedId.value)
})

const retire = wrap(async () => {
  if (!selectedId.value) return
  const others = sets.value.filter((s) => s.id !== selectedId.value && s.status === 'active')
  const hint = others.length ? `\n\nOptional: the id of the set that replaces it, e.g. ${others[0].id}` : ''
  const answer = window.prompt(`Retire “${draft.value?.name}”? Desktop runs of it will be refused.${hint}`, '')
  if (answer === null) return
  await promptSetService.retire(selectedId.value, answer.trim())
  notice.value = 'Retired'
  await loadSets()
  detail.value = await promptSetService.get(selectedId.value)
})

const control = (body: { take_over?: boolean; locked?: boolean }) => wrap(async () => {
  if (!selectedId.value) return
  detail.value = await promptSetService.control(selectedId.value, body)
  await loadSets()
})()

function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = String(reader.result || '') }
  reader.readAsText(file)
}

const importYaml = wrap(async () => {
  const out = await promptSetService.importYaml(importText.value, onConflict.value)
  importText.value = ''
  if (importFile.value) importFile.value.value = ''
  await loadSets()
  notice.value = `Imported ${out.length} set(s) as drafts`
  const w = out.flatMap((r) => r.warnings || [])
  if (out[0]) await select(out[0].id)
  warnings.value = w
})

const exportSet = (s: PromptSetSummary) => wrap(async () => {
  const yaml = await promptSetService.exportYaml(s.id)
  const blob = new Blob([yaml], { type: 'application/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(s.name || s.id).replace(/[^a-z0-9._ -]+/gi, '_')}.promptset.yaml`
  a.click()
  URL.revokeObjectURL(url)
})()

function onPickTestFile(file: { uid: string; name: string; path: string }) {
  testFile.value = file
  pickingFile.value = false
}

async function runTest() {
  if (!draft.value) return
  testing.value = true
  error.value = ''
  testResult.value = null
  try {
    testResult.value = await promptSetService.test({
      set: cleanDefinition(draft.value),
      ...(testFile.value ? { file_uid: testFile.value.uid } : { text: testText.value }),
      ...(testModel.value ? { model: testModel.value } : {}),
    })
  } catch (e) {
    error.value = errorMessage(e, 'The test failed')
  } finally {
    testing.value = false
  }
}

function fmtValue(v: unknown) {
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return String(v)
}
</script>

<style scoped>
.pset { display: flex; flex-direction: column; }
.pset-lede { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 760px; }
.pset-err { color: var(--danger); font-size: 13px; }
.pset-ok { color: var(--accent); font-size: 13px; margin: 4px 0; }
.pset-warn { font-size: 12.5px; color: var(--warn, #b45309); margin: 2px 0; }
.pset-layout { display: grid; grid-template-columns: 300px 1fr; gap: 18px; align-items: start; }

.pset-list-pane { display: flex; flex-direction: column; gap: 10px; }
.pset-list-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pset-list-head h2 { font-size: 15px; margin: 0; }
.pset-list { list-style: none; padding: 0; margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.pset-list li { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-top: 1px solid var(--border); }
.pset-list li:first-child { border-top: none; }
.pset-list li.active { background: var(--hover); }
.pset-name { flex: 1; text-align: left; border: none; background: none; cursor: pointer; font: inherit; color: var(--fg); display: flex; flex-direction: column; gap: 1px; padding: 4px 2px; }
.pset-name-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
.badge.draft { color: var(--warn, #b45309); border-color: var(--warn, #b4530955); }
.badge.app { color: var(--primary); border-color: var(--primary); }
.muted-badge { opacity: .7; }
.pset-import { border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.pset-import h3 { font-size: 13px; margin: 0; }

.pset-editor-pane { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pset-app-note { font-size: 12.5px; background: var(--hover); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.pset-status { font-size: 13px; color: var(--muted); }
.pset-status .dirty { color: var(--warn, #b45309); }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pset-fields { display: flex; flex-direction: column; gap: 8px; }
.pset-field { border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; background: var(--card); }
.pset-field-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.pset-field-row .fname { font-family: ui-monospace, monospace; max-width: 180px; }
.pset-field-tools { margin-left: auto; display: flex; gap: 2px; }
.num { max-width: 90px; }
.actions { margin-top: 4px; }
.pset-schema pre { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-size: 12px; overflow-x: auto; }

.pset-test { border: 1px solid var(--primary); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.pset-test h2 { font-size: 15px; margin: 0; }
.pset-testfile { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pset-testfile-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.pset-testfile-clear { border: none; background: transparent; cursor: pointer; color: var(--muted); font-size: 12px; padding: 0; }
.pset-results { display: flex; flex-direction: column; gap: 6px; }
.pset-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pset-table th { text-align: left; color: var(--muted); font-weight: 600; padding: 4px 6px; border-bottom: 1px solid var(--border); }
.pset-table td { padding: 4px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.pset-table tr.notfound td { color: var(--muted); }
.pset-table .quote { font-size: 12px; }
.req { color: var(--danger); margin-left: 2px; }

.pset-modal { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; }
.pset-modal-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); }
.pset-modal-panel { position: relative; z-index: 1; background: var(--card, var(--bg)); border: 1px solid var(--border); border-radius: 10px; padding: 16px; width: min(520px, 92vw); max-height: 86vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; }

h3 { font-size: 14px; margin: 6px 0 2px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.row.end { justify-content: flex-end; }
.grow { flex: 1; min-width: 160px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
label.inline { flex-direction: row; align-items: center; gap: 6px; }
label.small { font-size: 12px; }
input, textarea, select {
  padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;
  font-family: inherit; background: var(--card); color: var(--fg); box-sizing: border-box;
}
input[type='checkbox'] { padding: 0; }
textarea { width: 100%; resize: vertical; }
.muted { color: var(--muted); font-size: 12px; }
.empty { padding: 12px; text-align: center; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; }
.btn.ghost { background: var(--card); color: var(--fg); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; padding: 2px 4px; }
.link:disabled { opacity: .35; cursor: default; }
.link.danger { color: var(--danger); }
code { background: var(--bg); padding: 0 4px; border-radius: 4px; font-size: 12px; }

@media (max-width: 860px) {
  .pset-layout, .grid2 { grid-template-columns: 1fr; }
}
</style>
