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
  Choose which two versions to compare.

  The version list gave us a way to *start* a comparison (tick two, press
  Compare). This is the way to *change* one without going back — the reader is
  already looking at a comparison and wants a different pair, which is a normal
  thing to want and previously meant closing the window.

  One component, two homes: the comparison overlay's header and the preview
  drawer's action bar. Same control, same wording, so the gesture learned in one
  place works in the other.
-->

<template>
  <div class="vp-root">
    <label class="vp-field">
      <span class="vp-lbl">Before</span>
      <!-- title on both the select and its options: the control is capped at
           13rem, so a timestamp with a long uploader beside it is clipped both in
           the closed control and in the open list. The tooltip is the only way to
           read the whole thing without widening the layout. -->
      <select
        v-model="pickBase"
        class="vp-sel"
        :title="label(pickBase)"
        :disabled="busy || loading"
        @change="onPick"
      >
        <option v-for="v in baseOptions" :key="v" :value="v" :title="label(v)">{{ label(v) }}</option>
      </select>
    </label>

    <span class="vp-arrow" aria-hidden="true">→</span>

    <label class="vp-field">
      <span class="vp-lbl">After</span>
      <select
        v-model="pickTarget"
        class="vp-sel"
        :title="label(pickTarget)"
        :disabled="busy || loading"
        @change="onPick"
      >
        <option v-for="v in targetOptions" :key="v" :value="v" :title="label(v)">{{ label(v) }}</option>
      </select>
    </label>

    <button
      class="vp-go"
      :disabled="!canCompare || busy || loading"
      :title="canCompare ? 'Compare these two versions' : 'Pick two different versions'"
      @click="emitPair"
    >
      <span v-if="busy" class="vp-spin" aria-hidden="true"></span>
      {{ busy ? 'Comparing…' : 'Compare' }}
    </button>
    <HelpIcon topic="comparing" label="Comparing two versions of a file" />

    <span v-if="error" class="vp-err">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import HelpIcon from '@/components/HelpIcon.vue'
import { computed, ref, watch } from 'vue'
import { fileService } from '@/services/fileService'
import { errorMessage } from '@/services/apiClient'
import { formatVersionMinute } from '@/utils/format'

const props = defineProps<{
  uid: string
  /** Current pair, so the control opens showing what is actually on screen. */
  base?: string
  target?: string
  /** The caller is running a comparison — disables the control and shows a spinner. */
  busy?: boolean
}>()

const emit = defineEmits<{ (e: 'compare', pair: { base: string; target: string }): void }>()

const versions = ref<string[]>([])
// version -> uploader, so the menus can say WHO as well as when. Empty for
// versions the core has no record for.
const uploaders = ref<Record<string, string>>({})
const loading = ref(false)
const error = ref('')
const pickBase = ref('')
const pickTarget = ref('')

// listVersions returns newest-first (the core's own ordering, which the version
// list and the service's `back=N` indexing both rely on). Keeping that order here
// means the newest sits at the top of both menus, where a reader looks first.
const targetOptions = computed(() => versions.value)

// "Before" must be older than "after". Constraining the menu is friendlier than
// accepting the pair and reporting an error afterwards — and comparing forwards
// is the only direction the service defines.
const baseOptions = computed(() => {
  const i = versions.value.indexOf(pickTarget.value)
  return i < 0 ? versions.value : versions.value.slice(i + 1)
})

const canCompare = computed(() =>
  !!pickBase.value && !!pickTarget.value && pickBase.value !== pickTarget.value)

function label(v: string) {
  // Versions ARE timestamps in this system; showing them as such beats inventing
  // revision numbers the rest of the stack does not have. The uploader is
  // appended when the core recorded one — on a shared document "which version"
  // is usually really a question about who changed it.
  const when = formatVersionMinute(v)
  const who = uploaders.value[v]
  return who ? `${when} — ${who}` : when
}

// Keep the pair coherent when the reader changes "after" to something older than
// the current "before" — silently comparing backwards would be worse than moving
// the other end down with it.
function onPick() {
  if (pickBase.value && pickTarget.value && !baseOptions.value.includes(pickBase.value)) {
    pickBase.value = baseOptions.value[0] ?? ''
  }
}

function emitPair() {
  if (!canCompare.value) return
  emit('compare', { base: pickBase.value, target: pickTarget.value })
}

async function load() {
  if (!props.uid) return
  loading.value = true
  error.value = ''
  try {
    const entries = await fileService.listVersionDetails(props.uid)
    versions.value = entries.map((e) => e.version)
    uploaders.value = Object.fromEntries(entries.map((e) => [e.version, e.revised_by]))
    // Default to what the caller is showing; fall back to the newest pair, which
    // is the same default the service itself applies.
    pickTarget.value = props.target || versions.value[0] || ''
    pickBase.value = props.base || versions.value[1] || ''
    onPick()
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load the version list')
  } finally {
    loading.value = false
  }
}

watch(() => props.uid, load, { immediate: true })

// Follow the caller when it moves to a different pair (e.g. restoring a comment's
// comparison), so the control never disagrees with what is on screen.
watch(() => [props.base, props.target], ([b, t]) => {
  if (t) pickTarget.value = t
  if (b) pickBase.value = b
})
</script>

<style scoped>
.vp-root {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.vp-field { display: inline-flex; align-items: center; gap: 0.3rem; }
.vp-lbl { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }

.vp-sel {
  font: inherit;
  font-size: 0.85rem;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  max-width: 13rem;
}
.vp-sel:disabled { opacity: 0.6; }

.vp-arrow { color: var(--muted); }

.vp-go {
  font: inherit;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--primary);
  color: #fff;
  border: 1px solid var(--primary);
  border-radius: 4px;
  padding: 0.25rem 0.7rem;
  cursor: pointer;
}
.vp-go:hover:not(:disabled) { background: var(--primary-hover); }
.vp-go:disabled { opacity: 0.5; cursor: default; }

/* A comparison can take tens of seconds (the service returns 202 and is polled),
   so the control has to show it is working rather than looking unresponsive. */
.vp-spin {
  width: 0.75em;
  height: 0.75em;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: vp-spin 0.7s linear infinite;
}
@keyframes vp-spin { to { transform: rotate(360deg); } }

.vp-err { color: var(--danger); font-size: 0.8rem; }
</style>
