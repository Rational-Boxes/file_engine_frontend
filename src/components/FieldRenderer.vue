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
  Generic descriptor-driven form renderer. Given a list of FieldDescriptors and a
  config object (`modelValue`), it renders one control per field and emits a
  shallow-cloned object whenever a value changes (it never mutates the prop).
  Recurses into itself for `group` fields (repeatable rows of nested descriptors).
-->
<template>
  <div class="fr">
    <div v-for="f in visibleFields" :key="f.key" class="fr-field">
      <label class="fr-label">
        {{ f.label }}
        <span v-if="f.required" class="fr-req" title="Required">*</span>
      </label>

      <!-- string -->
      <input
        v-if="f.type === 'string'"
        class="fr-input"
        type="text"
        :value="asString(f.key)"
        :maxlength="f.max_length ?? undefined"
        :placeholder="f.pattern ? `pattern: ${f.pattern}` : ''"
        @input="setKey(f.key, ($event.target as HTMLInputElement).value)"
      />

      <!-- text -->
      <textarea
        v-else-if="f.type === 'text'"
        class="fr-input fr-textarea"
        rows="3"
        :value="asString(f.key)"
        :maxlength="f.max_length ?? undefined"
        @input="setKey(f.key, ($event.target as HTMLTextAreaElement).value)"
      ></textarea>

      <!-- integer / number -->
      <input
        v-else-if="f.type === 'integer' || f.type === 'number'"
        class="fr-input"
        type="number"
        :value="modelValue[f.key] as number | undefined"
        :min="f.min ?? undefined"
        :max="f.max ?? undefined"
        :step="f.step ?? (f.type === 'integer' ? 1 : undefined)"
        @input="onNumber(f, ($event.target as HTMLInputElement).value)"
      />

      <!-- boolean -->
      <label v-else-if="f.type === 'boolean'" class="fr-check">
        <input
          type="checkbox"
          :checked="!!modelValue[f.key]"
          @change="setKey(f.key, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ f.help || 'Enabled' }}</span>
      </label>

      <!-- secret (write-only) -->
      <input
        v-else-if="f.type === 'secret'"
        class="fr-input"
        type="password"
        autocomplete="new-password"
        :value="secretDrafts[f.key] ?? ''"
        :placeholder="'•••••• (unchanged — leave blank to keep)'"
        @input="onSecret(f, ($event.target as HTMLInputElement).value)"
      />

      <!-- select / ref -->
      <select
        v-else-if="f.type === 'select' || f.type === 'ref'"
        class="fr-input"
        :value="asString(f.key)"
        @change="setKey(f.key, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">— choose —</option>
        <option v-for="o in optionsFor(f)" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <!-- multiselect (checkbox list) OR mime_catalog / free-tag input -->
      <template v-else-if="f.type === 'multiselect'">
        <!-- mime_catalog: free-entry tag input -->
        <div v-if="f.options_source === 'mime_catalog'" class="fr-tags">
          <ul v-if="asArray(f.key).length" class="fr-chips">
            <li v-for="(t, i) in asArray(f.key)" :key="t + i" class="fr-chip">
              <span class="fr-chip-txt">{{ t }}</span>
              <button class="fr-chip-x" type="button" title="Remove" @click="removeAt(f.key, i)">✕</button>
            </li>
          </ul>
          <input
            class="fr-input"
            type="text"
            :value="tagDrafts[f.key] ?? ''"
            placeholder="e.g. image/* — press Enter to add"
            @input="tagDrafts[f.key] = ($event.target as HTMLInputElement).value"
            @keydown.enter.prevent="addTag(f)"
          />
        </div>
        <!-- static / resolved options -->
        <div v-else class="fr-multi">
          <label v-for="o in optionsFor(f)" :key="o.value" class="fr-check">
            <input
              type="checkbox"
              :checked="asArray(f.key).includes(o.value)"
              @change="toggleMulti(f.key, o.value)"
            />
            <span>{{ o.label }}</span>
          </label>
          <p v-if="!optionsFor(f).length" class="fr-muted">No options available.</p>
        </div>
      </template>

      <!-- principal -->
      <div v-else-if="f.type === 'principal'" class="fr-principal">
        <ul v-if="asArray(f.key).length" class="fr-chips">
          <li v-for="(p, i) in asArray(f.key)" :key="p + i" class="fr-chip">
            <span class="fr-chip-txt">{{ p }}</span>
            <button class="fr-chip-x" type="button" title="Remove" @click="removeAt(f.key, i)">✕</button>
          </li>
        </ul>
        <PrincipalPicker :types="['user', 'role']" @select="onPrincipal(f.key, $event)" />
      </div>

      <!-- folder -->
      <div v-else-if="f.type === 'folder'" class="fr-folder">
        <input class="fr-input fr-folder-txt" type="text" readonly :value="folderDisplay(f.key)" />
        <button class="btn" type="button" @click="openFolderPick(f.key)">📁 Pick…</button>
      </div>

      <!-- group (repeatable rows of nested fields) -->
      <div v-else-if="f.type === 'group'" class="fr-group">
        <div v-for="(row, i) in asRows(f.key)" :key="i" class="fr-row">
          <div class="fr-row-head">
            <span class="fr-muted">#{{ i + 1 }}</span>
            <button class="btn fr-row-x" type="button" title="Remove row" @click="removeRow(f.key, i)">🗑</button>
          </div>
          <FieldRenderer
            :fields="f.item_fields || []"
            :model-value="row"
            :event-catalog="eventCatalog"
            :folder-uid="folderUid"
            @update:modelValue="updateRow(f.key, i, $event)"
          />
        </div>
        <button class="btn" type="button" @click="addRow(f.key)">➕ Add {{ f.label.toLowerCase() }}</button>
      </div>

      <!-- fallback: unknown type -->
      <p v-else class="fr-muted">Unsupported field type: {{ f.type }}</p>

      <p v-if="f.help && f.type !== 'boolean'" class="fr-help">{{ f.help }}</p>
    </div>

    <!-- Folder picker modal (shared by all folder fields in this renderer) -->
    <Teleport to="body">
      <div v-if="folderPickKey" class="fr-modal" role="dialog" aria-modal="true" aria-label="Pick a folder">
        <div class="fr-modal-backdrop" @click="closeFolderPick"></div>
        <div class="fr-modal-panel">
          <h3 class="fr-modal-title">Pick a destination folder</h3>
          <FolderBrowser @navigate="folderNav = $event" />
          <p class="fr-hint">
            Selected: <strong>{{ folderNav?.path || '/' }}</strong>
          </p>
          <div class="fr-modal-actions">
            <button class="btn" type="button" @click="closeFolderPick">Cancel</button>
            <button class="btn btn-primary" type="button" :disabled="!folderNav" @click="confirmFolderPick">
              Use this folder
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import PrincipalPicker from '@/components/PrincipalPicker.vue'
import FolderBrowser from '@/components/FolderBrowser.vue'
import { folderActionsService } from '@/services/folderActionsService'
import { encodePrincipal } from '@/types'
import type { Principal } from '@/types'
import type { FieldDescriptor, FieldOption } from '@/types/folderActions'

// Enables recursive self-reference (`<FieldRenderer>`) for `group` fields.
defineOptions({ name: 'FieldRenderer' })

const props = withDefaults(
  defineProps<{
    fields: FieldDescriptor[]
    modelValue: Record<string, unknown>
    eventCatalog?: string[]
    folderUid?: string
  }>(),
  { eventCatalog: () => [], folderUid: '' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, unknown>): void
}>()

// --- visibility gating (visible_when) ---
const visibleFields = computed(() =>
  props.fields.filter((f) => {
    if (!f.visible_when) return true
    return props.modelValue[f.visible_when.key] === f.visible_when.equals
  }),
)

// --- shallow-clone emit helpers (never mutate the prop) ---
function setKey(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function deleteKey(key: string) {
  const next = { ...props.modelValue }
  delete next[key]
  emit('update:modelValue', next)
}

function asString(key: string): string {
  const v = props.modelValue[key]
  return v == null ? '' : String(v)
}
function asArray(key: string): string[] {
  const v = props.modelValue[key]
  return Array.isArray(v) ? (v as string[]) : []
}
function asRows(key: string): Record<string, unknown>[] {
  const v = props.modelValue[key]
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : []
}

function onNumber(f: FieldDescriptor, raw: string) {
  if (raw === '') {
    deleteKey(f.key)
    return
  }
  setKey(f.key, Number(raw))
}

// --- secrets (write-only): drafts held locally, only emitted when non-empty ---
const secretDrafts = reactive<Record<string, string>>({})
function onSecret(f: FieldDescriptor, value: string) {
  secretDrafts[f.key] = value
  if (value === '') deleteKey(f.key)
  else setKey(f.key, value)
}

// --- multiselect / tag arrays ---
function toggleMulti(key: string, optVal: string) {
  const cur = asArray(key)
  const next = cur.includes(optVal) ? cur.filter((x) => x !== optVal) : [...cur, optVal]
  setKey(key, next)
}
function removeAt(key: string, i: number) {
  const cur = [...asArray(key)]
  cur.splice(i, 1)
  setKey(key, cur)
}

const tagDrafts = reactive<Record<string, string>>({})
function addTag(f: FieldDescriptor) {
  const raw = (tagDrafts[f.key] ?? '').trim()
  if (!raw) return
  const cur = asArray(f.key)
  if (!cur.includes(raw)) setKey(f.key, [...cur, raw])
  tagDrafts[f.key] = ''
}

// --- principals ---
function onPrincipal(key: string, p: Principal) {
  const encoded = encodePrincipal(p)
  const cur = asArray(key)
  if (!cur.includes(encoded)) setKey(key, [...cur, encoded])
}

// --- options_source resolution ---
// classifier_sets are fetched once and cached; event_catalog uses the prop.
const classifierOptions = ref<FieldOption[]>([])
function optionsFor(f: FieldDescriptor): FieldOption[] {
  switch (f.options_source) {
    case 'classifier_sets':
      return classifierOptions.value
    case 'event_catalog':
      return (props.eventCatalog.length
        ? props.eventCatalog.map((e) => ({ value: e, label: e }))
        : f.options) || []
    default:
      return f.options || []
  }
}

function anyFieldNeeds(fields: FieldDescriptor[], source: string): boolean {
  return fields.some(
    (f) => f.options_source === source || (f.item_fields ? anyFieldNeeds(f.item_fields, source) : false),
  )
}

onMounted(async () => {
  if (anyFieldNeeds(props.fields, 'classifier_sets')) {
    try {
      const sets = await folderActionsService.listClassifierSets()
      classifierOptions.value = sets.map((s) => ({ value: s.id, label: s.name }))
    } catch {
      // Non-fatal: leave the select empty rather than blocking the form.
      classifierOptions.value = []
    }
  }
})

// --- group rows ---
function updateRow(key: string, i: number, row: Record<string, unknown>) {
  const rows = asRows(key).map((r, idx) => (idx === i ? row : r))
  setKey(key, rows)
}
function addRow(key: string) {
  setKey(key, [...asRows(key), {}])
}
function removeRow(key: string, i: number) {
  const rows = [...asRows(key)]
  rows.splice(i, 1)
  setKey(key, rows)
}

// --- folder picker modal ---
const folderPickKey = ref<string | null>(null)
const folderNav = ref<{ uid: string; name: string; path: string } | null>(null)
// Remembers picked folder labels so the readonly field shows a name, not a bare uid.
const folderLabels = reactive<Record<string, string>>({})

function folderDisplay(key: string): string {
  const uid = props.modelValue[key]
  if (!uid) return ''
  return folderLabels[key] || String(uid)
}
function openFolderPick(key: string) {
  folderPickKey.value = key
  folderNav.value = null
}
function closeFolderPick() {
  folderPickKey.value = null
  folderNav.value = null
}
function confirmFolderPick() {
  if (!folderPickKey.value || !folderNav.value) return
  const key = folderPickKey.value
  setKey(key, folderNav.value.uid)
  folderLabels[key] = folderNav.value.path || folderNav.value.name
  closeFolderPick()
}
</script>

<style scoped>
.fr {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.fr-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fr-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--fg);
}
.fr-req {
  color: var(--danger);
  margin-left: 2px;
}
.fr-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--fg);
  font-size: 13px;
  box-sizing: border-box;
}
.fr-textarea {
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
}
.fr-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--fg);
  cursor: pointer;
}
.fr-multi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--card);
}
.fr-chips {
  list-style: none;
  margin: 0 0 6px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fr-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 8px;
}
.fr-chip-txt {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
  white-space: nowrap;
}
.fr-chip-x {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
}
.fr-chip-x:hover {
  color: var(--danger);
}
.fr-folder {
  display: flex;
  gap: 8px;
  align-items: center;
}
.fr-folder-txt {
  flex: 1 1 auto;
}
.fr-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 2px solid var(--border);
  padding-left: 12px;
}
.fr-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  background: var(--bg);
}
.fr-row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.fr-row-x {
  padding: 2px 8px;
}
.fr-help {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.fr-muted {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.fr-hint {
  font-size: 0.82rem;
  color: var(--muted);
  margin: 8px 0 0;
}

/* buttons */
.btn {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 0.85rem;
}
.btn:hover:not(:disabled) {
  border-color: var(--primary);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

/* folder picker modal */
.fr-modal {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fr-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
.fr-modal-panel {
  position: relative;
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  padding: 20px;
}
.fr-modal-title {
  margin: 0 0 12px;
  font-size: 1rem;
}
.fr-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
