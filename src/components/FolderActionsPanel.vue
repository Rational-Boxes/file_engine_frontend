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
  <div class="fap">
    <p class="fap-intro muted">
      Make this folder do something when files arrive in it.
      <HelpIcon topic="folder-actions" label="Automating a folder with actions" />
    </p>
    <p v-if="error" class="fap-err">{{ error }}</p>

    <!-- Sub-view switch: Bindings (default) vs Run log -->
    <div class="fap-seg" role="tablist" aria-label="Folder actions view">
      <button
        class="fap-seg-btn"
        :class="{ active: view === 'bindings' }"
        role="tab"
        :aria-selected="view === 'bindings'"
        @click="view = 'bindings'"
      >
        Bindings
      </button>
      <button
        class="fap-seg-btn"
        :class="{ active: view === 'runs' }"
        role="tab"
        :aria-selected="view === 'runs'"
        @click="showRuns"
      >
        Run log
      </button>
    </div>

    <!-- Bindings -->
    <div v-if="view === 'bindings'" class="fap-bindings">
      <p v-if="loading" class="fap-muted">Loading actions…</p>
      <template v-else>
        <ul v-if="bindings.length" class="fap-list">
          <li v-for="b in bindings" :key="b.id" class="fap-row" :class="{ off: !b.enabled }">
            <div class="fap-row-main">
              <span class="fap-label">{{ actionLabel(b.action_type) }}</span>
              <span v-if="b.on_events.length" class="fap-events">{{ b.on_events.join(' · ') }}</span>
              <span v-if="configHint(b)" class="fap-hint" :title="configHint(b)">{{ configHint(b) }}</span>
            </div>
            <div class="fap-row-act">
              <label class="fap-toggle" :title="b.enabled ? 'Enabled' : 'Disabled'">
                <input
                  type="checkbox"
                  :checked="b.enabled"
                  :disabled="!canWrite || busyId === b.id"
                  @change="toggleEnabled(b, ($event.target as HTMLInputElement).checked)"
                />
                <span class="fap-toggle-txt">{{ b.enabled ? 'On' : 'Off' }}</span>
              </label>
              <template v-if="canWrite">
                <button class="fap-icon" title="Edit action" @click="openEdit(b)">✎</button>
                <button class="fap-icon danger" title="Delete action" @click="askDelete(b)">🗑</button>
              </template>
            </div>
          </li>
        </ul>
        <p v-else class="fap-muted">No actions configured for this folder.</p>

        <button v-if="canWrite" class="btn fap-add" @click="openCreate">➕ Add action</button>
      </template>
    </div>

    <!-- Run log -->
    <div v-else class="fap-runs">
      <div class="fap-runs-head">
        <span class="fap-muted">Recent runs</span>
        <div class="fap-runs-actions">
          <!-- Replay lives HERE, in the runs view, because this is where someone
               realises the actions did not fire: they came to look at the log and
               found nothing. Write-gated — it moves files and sends notifications. -->
          <button
            v-if="canWrite"
            class="btn fap-replay"
            :disabled="replaying || runsLoading"
            :title="'Re-run this folder\'s actions over the last 24 hours. Safe to ' +
                    'repeat: files already handled at their current version are skipped.'"
            @click="replay"
          >
            {{ replaying ? 'Replaying…' : '▶ Replay actions' }}
          </button>
          <button class="btn fap-refresh" :disabled="runsLoading" @click="loadRuns">
            {{ runsLoading ? 'Refreshing…' : '↻ Refresh' }}
          </button>
        </div>
      </div>
      <p v-if="replayResult" class="fap-replay-result">{{ replayResult }}</p>
      <p v-if="replayError" class="fap-replay-error">{{ replayError }}</p>
      <table v-if="runs.length" class="fap-runtable">
        <thead>
          <tr>
            <th>Status</th>
            <th>Action</th>
            <th>File</th>
            <th>When</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in runs" :key="r.event_id || i">
            <td><span class="fap-chip" :class="chipClass(r.status)">{{ r.status }}</span></td>
            <td>{{ actionLabel(r.action_type) }}</td>
            <td class="mono" :title="r.file_uid">{{ truncate(r.file_uid) }}</td>
            <td class="fap-ts">{{ r.ts || '—' }}</td>
            <td class="fap-detail">{{ runReason(r) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!runsLoading" class="fap-muted">No runs recorded.</p>
      <p v-else class="fap-muted">Loading runs…</p>
    </div>

    <!-- Create / edit binding -->
    <BindingEditor
      :open="editorOpen"
      :folder-uid="uid"
      :binding="editing"
      :action-types="actionTypes"
      @saved="onSaved"
      @cancel="editing = null; editorOpen = false"
    />

    <!-- Delete confirmation -->
    <ConfirmModal
      :open="deleteTarget !== null"
      title="Delete action"
      :message="deleteTarget ? `Delete the “${actionLabel(deleteTarget.action_type)}” action? This cannot be undone.` : ''"
      confirm-label="Delete"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
import HelpIcon from '@/components/HelpIcon.vue'
import { ref, watch } from 'vue'
import BindingEditor from '@/components/BindingEditor.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { folderActionsService } from '@/services/folderActionsService'
import { errorMessage } from '@/services/apiClient'
import type { ActionBinding, ActionType, ActionRun } from '@/types/folderActions'
import { cachedFolderPath, looksLikeUid, resolveFolderPath } from '@/utils/folderPath'

const props = defineProps<{ uid: string; canWrite: boolean; canManage: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const view = ref<'bindings' | 'runs'>('bindings')

const bindings = ref<ActionBinding[]>([])
const actionTypes = ref<ActionType[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const busyId = ref<string | null>(null)

const runs = ref<ActionRun[]>([])
const runsLoading = ref(false)
const runsLoaded = ref(false)

const editorOpen = ref(false)
const editing = ref<ActionBinding | null>(null)
const deleteTarget = ref<ActionBinding | null>(null)

// Look up the human label for an action type, falling back to the raw type name.
function actionLabel(typeName: string): string {
  return actionTypes.value.find((t) => t.type_name === typeName)?.label ?? typeName
}

// One-line hint pulled from the binding config — a destination or URL if present.
//
// Folder destinations are stored as uids, so show the path once it has been
// resolved. Until then the uid stands in rather than the row going blank: a
// missing hint reads as "no destination configured", which is worse than an
// unreadable one. The resolver caches, so this settles on first render.
function configHint(b: ActionBinding): string {
  void hintTick.value   // dependency: the path cache is a plain Map, not reactive
  const c = b.config || {}
  const dest = c['destination'] ?? c['destination_folder'] ?? c['folder']
    ?? c['on_approved'] ?? c['on_rejected']
  if (typeof dest === 'string' && dest) {
    return `→ ${looksLikeUid(dest) ? (cachedFolderPath(dest) || dest) : dest}`
  }
  const url = c['url'] ?? c['endpoint'] ?? c['webhook_url']
  if (typeof url === 'string' && url) return url
  return ''
}

// Bumped when a path lands, so the hints re-render — the cache itself is a
// plain Map and not reactive. Declared before the watch below, which runs
// immediately and would otherwise touch it in its temporal dead zone.
const hintTick = ref(0)

// Kick off resolution for every folder uid the visible bindings point at, so
// configHint has paths to read on the next tick.
watch(
  () => bindings.value.map((b) => JSON.stringify(b.config || {})).join('|'),
  () => {
    for (const b of bindings.value) {
      for (const v of Object.values(b.config || {})) {
        if (looksLikeUid(v)) void resolveFolderPath(String(v)).then(() => { hintTick.value++ })
      }
    }
  },
  { immediate: true },
)

function chipClass(status: string): string {
  if (status === 'done') return 'done'
  if (status === 'failed') return 'failed'
  return 'skipped'
}

function runReason(r: ActionRun): string {
  const reason = r.detail?.['reason']
  return typeof reason === 'string' ? reason : ''
}

function truncate(s: string, n = 12): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

async function loadBindings() {
  if (!props.uid) return
  loading.value = true
  error.value = null
  try {
    const [bs, ts] = await Promise.all([
      folderActionsService.listBindings(props.uid),
      folderActionsService.listActionTypes(),
    ])
    bindings.value = bs
    actionTypes.value = ts
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load folder actions')
  } finally {
    loading.value = false
  }
}

const replaying = ref(false)
const replayResult = ref<string | null>(null)
const replayError = ref<string | null>(null)

async function replay() {
  if (!props.uid || replaying.value) return
  replaying.value = true
  replayResult.value = null
  replayError.value = null
  try {
    const { counts } = await folderActionsService.replayFolder(props.uid)
    const dispatched = counts.dispatched ?? 0
    const candidates = counts.candidates ?? 0
    // Report what it DID, not just that it ran. "Replayed" with no numbers reads
    // as success even when the window held nothing, which is the same ambiguity
    // that made the missed events hard to notice in the first place.
    replayResult.value = candidates === 0
      ? 'No files changed in the last 24 hours — nothing to replay.'
      : `Replayed ${candidates} file${candidates === 1 ? '' : 's'}; ` +
        `${dispatched} action${dispatched === 1 ? '' : 's'} dispatched.` +
        (counts.errors ? ` ${counts.errors} failed.` : '') +
        (counts.truncated ? ' Hit the file limit — run again to continue.' : '')
    await loadRuns()
  } catch (e) {
    replayError.value = errorMessage(e, 'Replay failed')
  } finally {
    replaying.value = false
  }
}

async function loadRuns() {
  if (!props.uid) return
  runsLoading.value = true
  error.value = null
  try {
    runs.value = await folderActionsService.folderRuns(props.uid)
    runsLoaded.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load run log')
  } finally {
    runsLoading.value = false
  }
}

function showRuns() {
  view.value = 'runs'
  if (!runsLoaded.value) loadRuns()
}

async function toggleEnabled(b: ActionBinding, enabled: boolean) {
  busyId.value = b.id
  error.value = null
  try {
    await folderActionsService.updateBinding(b.id, { enabled })
    b.enabled = enabled
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e, 'Failed to update action')
  } finally {
    busyId.value = null
  }
}

function openCreate() {
  editing.value = null
  editorOpen.value = true
}

function openEdit(b: ActionBinding) {
  editing.value = b
  editorOpen.value = true
}

async function onSaved() {
  editorOpen.value = false
  editing.value = null
  await loadBindings()
  runsLoaded.value = false // bindings changed; let the run log refetch on next view
  emit('changed')
}

function askDelete(b: ActionBinding) {
  deleteTarget.value = b
}

async function confirmDelete() {
  const b = deleteTarget.value
  deleteTarget.value = null
  if (!b) return
  error.value = null
  try {
    await folderActionsService.deleteBinding(b.id)
    await loadBindings()
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e, 'Failed to delete action')
  }
}

// Reload whenever the folder changes (and on mount via immediate).
watch(
  () => props.uid,
  () => {
    view.value = 'bindings'
    runs.value = []
    runsLoaded.value = false
    loadBindings()
  },
  { immediate: true },
)
</script>

<style scoped>
.fap-intro { font-size: .85rem; margin: 0 0 .5rem; }
.fap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fap-err {
  color: var(--danger);
  font-size: 13px;
  margin: 0;
}

.fap-muted {
  color: var(--muted);
  font-size: 13px;
  margin: 8px 0;
}

/* Segmented control */
.fap-seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  align-self: flex-start;
}

.fap-seg-btn {
  border: none;
  background: var(--card);
  color: var(--muted);
  font-size: 12px;
  padding: 6px 14px;
  cursor: pointer;
}

.fap-seg-btn + .fap-seg-btn {
  border-left: 1px solid var(--border);
}

.fap-seg-btn.active {
  background: var(--primary);
  color: #fff;
}

/* Bindings list */
.fap-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fap-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
}

.fap-row.off {
  opacity: 0.6;
}

.fap-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.fap-label {
  font-weight: 600;
  font-size: 13px;
}

.fap-events {
  font-size: 11px;
  color: var(--muted);
}

.fap-hint {
  font-size: 11px;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.fap-row-act {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.fap-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
}

.fap-icon {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  line-height: 1;
}

.fap-icon:hover {
  background: var(--hover);
  border-radius: 4px;
}

.fap-icon.danger:hover {
  color: var(--danger);
}

.fap-add {
  align-self: flex-start;
}

/* Run log */
.fap-runs-actions { display: flex; gap: 8px; align-items: center; }
.fap-replay-result { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
.fap-replay-error { font-size: 13px; color: #b00020; margin: 6px 0 0; }
.fap-runs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.fap-refresh {
  font-size: 12px;
  padding: 4px 10px;
}

.fap-runtable {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.fap-runtable th {
  text-align: left;
  color: var(--muted);
  font-weight: 600;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
}

.fap-runtable td {
  padding: 5px 6px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.fap-ts {
  color: var(--muted);
  white-space: nowrap;
}

.fap-detail {
  color: var(--muted);
  word-break: break-word;
}

.mono {
  font-family: var(--font-sans);
  font-size: 11px;
}

.fap-chip {
  display: inline-block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 999px;
  color: #fff;
}

.fap-chip.done {
  background: #15803d;
}

.fap-chip.failed {
  background: var(--danger);
}

.fap-chip.skipped {
  background: var(--muted);
}

.btn {
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: var(--bg);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
