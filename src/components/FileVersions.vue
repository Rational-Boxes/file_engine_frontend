<template>
  <div class="versions">
    <p v-if="error" class="v-err">{{ error }}</p>
    <p v-if="loading" class="v-muted">Loading versions…</p>

    <table v-else-if="versions.length" class="v-list">
      <tbody>
        <tr v-for="ts in versions" :key="ts" :class="{ current: ts === current }">
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
import { ref, watch } from 'vue'
import { fileService } from '@/services/fileService'
import { errorMessage } from '@/services/apiClient'
import { formatVersionTimestamp, versionFilename } from '@/utils/format'

const props = defineProps<{ uid: string; name?: string; current?: string; canManage?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const versions = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const busy = ref(false)
const keep = ref(1)

watch(() => props.uid, load, { immediate: true })

async function load() {
  if (!props.uid) return
  loading.value = true
  error.value = ''
  try {
    const list = await fileService.listVersions(props.uid)
    versions.value = [...list].sort().reverse() // timestamp ids → newest first
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load versions')
    versions.value = []
  } finally {
    loading.value = false
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
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
