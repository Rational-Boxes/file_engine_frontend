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
  The extraction view's sidebar: the values AI extraction stored for this
  version, beside the marked-up PDF. Each value carries the colour it is
  highlighted in and, where it was located, a link to its page. A document
  extracted by several prompt sets offers each one.
-->
<template>
  <aside class="xs" aria-label="Extracted information">
    <header class="xs-head">
      <h2 class="xs-title">Extracted information</h2>
      <select
        v-if="entries.length > 1"
        class="xs-pick"
        aria-label="Extraction"
        :value="selected"
        @change="emit('select', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="(e, i) in entries" :key="e.entry" :value="i">{{ entryTitle(e) }}</option>
      </select>
      <p v-else-if="entry" class="xs-set">{{ entryTitle(entry) }}</p>
    </header>

    <p v-if="entry && !hasMarkup" class="xs-note" data-test="no-markup">
      No marked-up copy is held for this version, so the document is shown unmarked.
    </p>

    <ul class="xs-rows">
      <li
        v-for="r in rows"
        :key="r.name"
        class="xs-row"
        :class="{ 'xs-missing': !r.found }"
        :data-field="r.name"
      >
        <div class="xs-label">
          <span v-if="r.mark?.colour" class="xs-swatch" :style="{ background: r.mark.colour }" aria-hidden="true"></span>
          <span :title="r.description || undefined">{{ r.label }}</span>
        </div>
        <div v-if="r.found" class="xs-value">{{ r.value }}</div>
        <div v-else class="xs-value xs-none">Not found</div>
        <blockquote v-if="r.found && r.quote" class="xs-quote">“{{ r.quote }}”</blockquote>
        <button
          v-if="r.mark"
          class="link xs-page"
          type="button"
          :title="`Show page ${r.mark.page}`"
          @click="emit('go-to-page', r.mark!.page)"
        >Page {{ r.mark.page }}</button>
        <span v-else-if="r.found && hasMarkup && marksRead" class="xs-muted">
          Not marked in the PDF
        </span>
      </li>
    </ul>

    <footer v-if="entry" class="xs-foot">
      <span v-if="modelLabel">{{ modelLabel }}</span>
      <span v-if="entry.created_at">· {{ formatWhen(entry.created_at) }}</span>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { entryRows, entryTitle, type ExtractionEntry, type FieldMark } from '@/services/extractionService'

const props = defineProps<{
  entries: ExtractionEntry[]
  selected: number
  /** Whether the marked-up PDF is on screen (else the plain document is). */
  hasMarkup: boolean
  /** Where each value is marked, once the PDF's annotations have been read. */
  marks: Record<string, FieldMark>
  marksRead: boolean
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'go-to-page', page: number): void
}>()

const entry = computed<ExtractionEntry | undefined>(() => props.entries[props.selected])
const rows = computed(() => (entry.value ? entryRows(entry.value, props.marks) : []))
const modelLabel = computed(() => {
  const e = entry.value
  if (!e) return ''
  return e.model_choice?.label || e.model_choice?.used || e.model || ''
})

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}
</script>

<style scoped>
.xs {
  flex: 0 0 300px;
  width: 300px;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.xs-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.xs-title {
  font-size: 14px;
  margin: 0;
}
.xs-set,
.xs-note,
.xs-muted,
.xs-foot {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.xs-pick {
  font-size: 13px;
}
.xs-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.xs-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.xs-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.xs-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: 0 0 auto;
}
.xs-value {
  font-size: 14px;
  font-weight: 600;
  word-break: break-word;
}
.xs-none {
  font-weight: 400;
  font-style: italic;
  color: var(--muted);
}
.xs-quote {
  margin: 2px 0 0;
  padding-left: 8px;
  border-left: 2px solid var(--border);
  font-size: 12px;
  color: var(--muted);
  word-break: break-word;
}
.xs-page {
  align-self: flex-start;
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: var(--primary);
  cursor: pointer;
}
.xs-page:hover {
  text-decoration: underline;
}
.xs-foot {
  margin-top: auto;
}
</style>
