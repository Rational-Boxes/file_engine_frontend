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
  Create / edit an action binding on a folder. Wraps the generic FieldRenderer
  over the selected action type's `fields`, plus event/recursive controls and —
  for the `sorter` action — a classification routing table.
-->
<template>
  <Teleport to="body">
    <div v-if="open" class="be-root" role="dialog" aria-modal="true" aria-label="Edit folder action">
      <div class="be-backdrop" @click="emit('cancel')"></div>

      <div class="be-panel" @keydown="onKeydown">
        <h2 class="be-title">{{ binding ? 'Edit action' : 'Add action' }}</h2>

        <!-- Action type (locked when editing) -->
        <div class="be-field">
          <label class="be-label">Action type</label>
          <select v-model="actionType" class="be-input" :disabled="!!binding">
            <option v-for="t in actionTypes" :key="t.type_name" :value="t.type_name">{{ t.label }}</option>
          </select>
          <p v-if="selectedType?.description" class="be-help">{{ selectedType.description }}</p>
        </div>

        <!-- Trigger events -->
        <div class="be-field">
          <label class="be-label">Trigger on events</label>
          <div class="be-multi">
            <label v-for="ev in selectedType?.supported_events || []" :key="ev" class="be-check">
              <input type="checkbox" :checked="onEvents.includes(ev)" @change="toggleEvent(ev)" />
              <span>{{ ev }}</span>
            </label>
            <p v-if="!(selectedType?.supported_events || []).length" class="be-muted">
              This action exposes no events.
            </p>
          </div>
        </div>

        <!-- Recursive -->
        <div class="be-field">
          <label class="be-check">
            <input type="checkbox" v-model="recursive" />
            <span>Apply to sub-folders (recursive)</span>
          </label>
        </div>

        <!-- MIME-type filter (binding-level; applies to any action) -->
        <div class="be-field">
          <label class="be-label">MIME types <span class="be-muted">(optional filter)</span></label>
          <p class="be-help">
            Only apply this action to files whose content-sniffed MIME type matches.
            Exact types (application/pdf) or trailing wildcards (image/*). Empty = all types.
          </p>
          <div v-if="mimeTypes.length" class="be-tags">
            <span v-for="(m, i) in mimeTypes" :key="m + ':' + i" class="be-tag">
              {{ m }}
              <button type="button" class="be-tag-x" @click="removeMime(i)" aria-label="Remove">×</button>
            </span>
          </div>
          <div class="be-tag-add">
            <input
              class="be-input"
              v-model="mimeDraft"
              placeholder="e.g. application/pdf or image/*"
              @keydown.enter.prevent="addMime"
            />
            <button type="button" class="btn" :disabled="!mimeDraft.trim()" @click="addMime">Add</button>
          </div>
        </div>

        <!-- Config (generic form) -->
        <div v-if="selectedType && selectedType.fields.length" class="be-field">
          <label class="be-label">Configuration</label>
          <FieldRenderer
            :fields="selectedType.fields"
            v-model="config"
            :event-catalog="selectedType.supported_events"
            :folder-uid="folderUid"
          />
        </div>

        <!-- Sorter routing table -->
        <div v-if="actionType === 'sorter'" class="be-field">
          <label class="be-label">Routing rules</label>
          <p class="be-help">Files matching a classification above its threshold are moved to the destination folder (highest priority first).</p>
          <table class="be-routes">
            <thead>
              <tr>
                <th>Classification</th>
                <th>Threshold</th>
                <th>Destination</th>
                <th>Priority</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in routes" :key="i">
                <td>
                  <input class="be-input be-cell" type="text" v-model="r.classification_name" placeholder="name" />
                </td>
                <td>
                  <input class="be-input be-cell be-num" type="number" step="0.01" min="0" max="1" v-model.number="r.threshold" />
                </td>
                <td class="be-dest">
                  <span class="be-dest-txt" :title="r.destination_folder">{{ routeDestLabel(i) }}</span>
                  <button class="btn be-mini" type="button" @click="openRoutePick(i)">📁</button>
                </td>
                <td>
                  <input class="be-input be-cell be-num" type="number" step="1" v-model.number="r.priority" />
                </td>
                <td>
                  <button class="btn be-mini" type="button" title="Remove rule" @click="removeRoute(i)">🗑</button>
                </td>
              </tr>
              <tr v-if="!routes.length">
                <td colspan="5" class="be-muted">No routing rules yet.</td>
              </tr>
            </tbody>
          </table>
          <button class="btn" type="button" @click="addRoute">➕ Add rule</button>
        </div>

        <p v-if="error" class="err">{{ error }}</p>

        <div class="be-actions">
          <button class="btn" type="button" @click="emit('cancel')">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save action' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Route destination folder picker -->
    <div v-if="routePickIndex !== null" class="be-modal" role="dialog" aria-modal="true" aria-label="Pick destination">
      <div class="be-modal-backdrop" @click="closeRoutePick"></div>
      <div class="be-modal-panel">
        <h3 class="be-modal-title">Pick a destination folder</h3>
        <FolderBrowser @navigate="routeNav = $event" />
        <p class="be-hint">Selected: <strong>{{ routeNav?.path || '/' }}</strong></p>
        <div class="be-modal-actions">
          <button class="btn" type="button" @click="closeRoutePick">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="!routeNav" @click="confirmRoutePick">
            Use this folder
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import FieldRenderer from '@/components/FieldRenderer.vue'
import FolderBrowser from '@/components/FolderBrowser.vue'
import { folderActionsService } from '@/services/folderActionsService'
import { errorMessage } from '@/services/apiClient'
import type { ActionType, ActionBinding, SorterRoute } from '@/types/folderActions'

const props = defineProps<{
  open: boolean
  folderUid: string
  binding: ActionBinding | null
  actionTypes: ActionType[]
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'cancel'): void
}>()

// --- working copy (seeded on open) ---
const actionType = ref('')
const onEvents = ref<string[]>([])
const recursive = ref(false)
const mimeTypes = ref<string[]>([])
const mimeDraft = ref('')
const config = ref<Record<string, unknown>>({})
const routes = ref<SorterRoute[]>([])
const error = ref('')
const saving = ref(false)
// Labels for route destinations picked this session (path shown instead of uid).
const routeLabels = reactive<Record<number, string>>({})

const selectedType = computed<ActionType | undefined>(() =>
  props.actionTypes.find((t) => t.type_name === actionType.value),
)

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    error.value = ''
    saving.value = false
    routes.value = []
    for (const k of Object.keys(routeLabels)) delete routeLabels[Number(k)]

    mimeDraft.value = ''
    if (props.binding) {
      actionType.value = props.binding.action_type
      onEvents.value = clone(props.binding.on_events || [])
      mimeTypes.value = clone(props.binding.mime_types || [])
      config.value = clone(props.binding.config || {})
      recursive.value = !!props.binding.recursive
    } else {
      actionType.value = props.actionTypes[0]?.type_name || ''
      onEvents.value = []
      mimeTypes.value = []
      config.value = {}
      recursive.value = false
    }

    // Load existing routes for a sorter binding being edited.
    if (props.binding && props.binding.action_type === 'sorter') {
      try {
        routes.value = await folderActionsService.getRoutes(props.binding.id)
      } catch (e) {
        error.value = errorMessage(e, 'Could not load routing rules')
      }
    }
  },
  { immediate: true },
)

function addMime() {
  const v = mimeDraft.value.trim().toLowerCase()
  if (v && !mimeTypes.value.includes(v)) mimeTypes.value = [...mimeTypes.value, v]
  mimeDraft.value = ''
}
function removeMime(i: number) {
  mimeTypes.value = mimeTypes.value.filter((_, idx) => idx !== i)
}

function toggleEvent(ev: string) {
  onEvents.value = onEvents.value.includes(ev)
    ? onEvents.value.filter((x) => x !== ev)
    : [...onEvents.value, ev]
}

// --- routes ---
function addRoute() {
  routes.value = [
    ...routes.value,
    { classification_name: '', threshold: 0.5, destination_folder: '', priority: routes.value.length },
  ]
}
function removeRoute(i: number) {
  routes.value = routes.value.filter((_, idx) => idx !== i)
  delete routeLabels[i]
}
function routeDestLabel(i: number): string {
  return routeLabels[i] || routes.value[i]?.destination_folder || '(none)'
}

const routePickIndex = ref<number | null>(null)
const routeNav = ref<{ uid: string; name: string; path: string } | null>(null)
function openRoutePick(i: number) {
  routePickIndex.value = i
  routeNav.value = null
}
function closeRoutePick() {
  routePickIndex.value = null
  routeNav.value = null
}
function confirmRoutePick() {
  if (routePickIndex.value === null || !routeNav.value) return
  const i = routePickIndex.value
  routes.value[i].destination_folder = routeNav.value.uid
  routeLabels[i] = routeNav.value.path || routeNav.value.name
  closeRoutePick()
}

// --- save ---
async function save() {
  error.value = ''
  if (!actionType.value) {
    error.value = 'Choose an action type.'
    return
  }
  saving.value = true
  try {
    let bindingId = props.binding?.id
    if (props.binding) {
      await folderActionsService.updateBinding(props.binding.id, {
        on_events: onEvents.value,
        mime_types: mimeTypes.value,
        config: config.value,
        recursive: recursive.value,
      })
    } else {
      const created = await folderActionsService.createBinding(props.folderUid, {
        action_type: actionType.value,
        on_events: onEvents.value,
        mime_types: mimeTypes.value,
        config: config.value,
        recursive: recursive.value,
      })
      bindingId = created.id
    }
    if (actionType.value === 'sorter' && bindingId) {
      await folderActionsService.setRoutes(bindingId, routes.value)
    }
    emit('saved')
  } catch (e) {
    error.value = errorMessage(e, 'Could not save the action')
  } finally {
    saving.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}
</script>

<style scoped>
.be-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.be-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
.be-panel {
  position: relative;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.be-title {
  margin: 0;
  font-size: 1.15rem;
}
.be-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.be-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--fg);
}
.be-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--fg);
  font-size: 13px;
  box-sizing: border-box;
}
.be-input:disabled {
  opacity: 0.6;
}
.be-multi {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg);
}
.be-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.be-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  font-size: 0.85em;
}
.be-tag-x {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 1.1em;
  line-height: 1;
  padding: 0 2px;
}
.be-tag-x:hover {
  color: var(--danger);
}
.be-tag-add {
  display: flex;
  gap: 8px;
}
.be-tag-add .be-input {
  flex: 1;
}
.be-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--fg);
  cursor: pointer;
}
.be-help {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.be-muted {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.be-hint {
  font-size: 0.82rem;
  color: var(--muted);
  margin: 8px 0 0;
}
.be-routes {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.be-routes th {
  text-align: left;
  color: var(--muted);
  font-weight: 600;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
}
.be-routes td {
  padding: 4px 6px;
  vertical-align: middle;
}
.be-cell {
  padding: 5px 7px;
  font-size: 12px;
}
.be-num {
  width: 72px;
}
.be-dest {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
}
.be-dest-txt {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
  color: var(--fg);
}
.be-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.err {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 0;
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
.be-mini {
  padding: 4px 8px;
}

/* route destination picker modal */
.be-modal {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.be-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
.be-modal-panel {
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
.be-modal-title {
  margin: 0 0 12px;
  font-size: 1rem;
}
.be-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
