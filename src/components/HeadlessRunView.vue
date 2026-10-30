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

<!-- One headless run, read-only: what the application asked and what came back.
     An extraction shows one row per document with each value, its unit and the
     quote it was taken from; a question or report shows the answer. -->
<template>
  <section class="run">
    <header class="run-head">
      <button type="button" class="back" @click="$emit('close')">← Back to chat</button>
      <h2 class="run-title">{{ run.title }}</h2>
      <p class="run-meta">
        {{ run.clientLabel || 'Unnamed key' }} · {{ when(run.createdAt) }}
        <span class="readonly">read-only</span>
      </p>
    </header>

    <template v-if="isExtract">
      <p v-if="run.summary" class="run-summary">
        {{ run.summary.extracted ?? 0 }} extracted ·
        {{ run.summary.cached ?? 0 }} from cache ·
        {{ run.summary.skipped ?? 0 }} skipped ·
        {{ run.summary.failed ?? 0 }} failed
      </p>
      <div class="table-wrap">
        <table class="results">
          <thead>
            <tr>
              <th>Document</th>
              <th v-for="f in fields" :key="f">{{ f }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in run.results" :key="r.file_uid + r.version">
              <td class="doc">
                <button type="button" class="link" @click="$emit('open-file', r.file_uid, r.name)">
                  {{ r.name || r.file_uid }}
                </button>
                <span class="ver" :title="r.version">{{ formatVersionTimestamp(r.version) }}</span>
              </td>
              <td v-if="r.erased" :colspan="fields.length" class="note">Erased — values removed</td>
              <td v-else-if="r.skipped" :colspan="fields.length" class="note">Skipped: {{ r.skipped }}</td>
              <td v-else-if="r.error" :colspan="fields.length" class="note err">Failed: {{ r.error }}</td>
              <template v-else>
                <td v-for="f in fields" :key="f" :class="{ missing: !r.data?.[f]?.found }">
                  <template v-if="r.data?.[f]?.found">
                    <span class="value">{{ show(r.data[f].value) }}</span>
                    <span v-if="r.data[f].unit" class="unit"> {{ r.data[f].unit }}</span>
                    <q v-if="r.data[f].evidence" class="quote">{{ r.data[f].evidence?.quote }}</q>
                  </template>
                  <span v-else-if="r.data?.[f]?.dropped" class="dropped" title="The model gave a value the document does not support; it was discarded.">no evidence</span>
                  <span v-else class="none">—</span>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <p v-if="run.request.message" class="question">{{ run.request.message }}</p>
      <div class="answer">{{ run.answer || 'No answer was recorded.' }}</div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HeadlessRun } from '@/services/headlessService'
import { formatVersionTimestamp } from '@/utils/format'

const props = defineProps<{ run: HeadlessRun }>()
defineEmits<{ (e: 'close'): void; (e: 'open-file', uid: string, name: string): void }>()

const isExtract = computed(() => props.run.request.kind === 'extract')

// Columns in the order the application asked for them; fall back to whatever
// fields the results carry.
const fields = computed<string[]>(() => {
  const schema = props.run.request.schema as { properties?: Record<string, unknown> } | undefined
  const asked = schema?.properties ? Object.keys(schema.properties) : []
  if (asked.length) return asked
  const seen = new Set<string>()
  for (const r of props.run.results) for (const k of Object.keys(r.data ?? {})) seen.add(k)
  return [...seen]
})

function show(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v)
}

function when(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}
</script>

<style scoped>
.run { padding: 16px 20px; overflow: auto; height: 100%; }
.run-head { margin-bottom: 12px; }
.back {
  margin-bottom: 8px; padding: 6px 12px; border-radius: 10px; cursor: pointer;
  background: transparent; color: var(--fg); border: 1px solid var(--border); font-size: 13px;
}
.back:hover { color: var(--primary); border-color: var(--primary); }
.run-title { margin: 0; font-size: 18px; }
.run-meta { color: var(--muted); font-size: 13px; margin: 4px 0 0; }
.readonly { margin-left: 8px; font-size: 11px; border: 1px solid currentColor; border-radius: 8px; padding: 0 6px; }
.run-summary { font-size: 13px; color: var(--muted); }
.table-wrap { overflow-x: auto; }
.results { border-collapse: collapse; font-size: 13px; min-width: 100%; }
.results th, .results td { border: 1px solid var(--border); padding: 6px 8px; vertical-align: top; text-align: left; }
.results th { background: var(--card); color: var(--fg); font-weight: 600; }
.doc .link { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; text-align: left; font: inherit; }
.ver { display: block; font-size: 11px; color: var(--muted); }
.quote { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
.missing .none { color: var(--muted); }
.dropped { font-size: 11px; color: #b7791f; }
.note { color: var(--muted); font-style: italic; }
.note.err { color: var(--danger, #c53030); }
.question { font-weight: 600; }
.answer { white-space: pre-wrap; line-height: 1.5; }
</style>
