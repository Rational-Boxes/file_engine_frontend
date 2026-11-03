// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import csaiClient from '@/services/csaiClient'
import type { FieldValue, ModelChoice, PromptField } from '@/services/promptSetService'

// The values AI extraction has stored for a document version (convert_search_ai
// EVENT_CONTRACT.md §3.2, the `fileengine.extract_cache.v1` sidecar), as the
// preview's extraction view shows them. Read as the signed-in user: csai
// READ-checks the document.

export interface FieldLocation {
  located: boolean
  page?: number
  method?: string
  reason?: string
}

export interface ExtractionMarkup {
  uid: string
  name: string
  /** Where each value was found; {} for an entry written before this was kept. */
  fields: Record<string, FieldLocation>
  colours: Record<string, string>
}

export interface ExtractionEntry {
  entry: string
  prompt_set: { id: string; revision: number | null; name?: string } | null
  model?: string
  model_choice?: ModelChoice | null
  source?: string
  created_at?: string
  data: Record<string, FieldValue>
  /** Prompt-set entries: what each value means. */
  fields?: PromptField[]
  /** Raw-schema entries: the JSON Schema the values answer. */
  schema?: { properties?: Record<string, { description?: string; title?: string }> } | null
  /** The marked-up PDF, when one is still held for this version. */
  markup?: ExtractionMarkup | null
}

export interface DocumentExtractions {
  file_uid: string
  version: string
  entries: ExtractionEntry[]
}

/** One row of the sidebar: a field's label, value and where it was found. */
export interface ExtractedRow {
  name: string
  label: string
  description: string
  found: boolean
  value: string
  quote: string
  colour: string
  location: FieldLocation | null
}

export const extractionService = {
  /** The current version's extractions (or the given version's). */
  async forDocument(uid: string, version = ''): Promise<DocumentExtractions> {
    const { data } = await csaiClient.get(`/v1/documents/${encodeURIComponent(uid)}/extractions`,
      { params: version ? { version } : {} })
    return { file_uid: data.file_uid, version: data.version, entries: data.entries || [] }
  },
}

/** A short title for an entry: its prompt set, or "Extracted values". */
export function entryTitle(e: ExtractionEntry): string {
  if (e.prompt_set) {
    const r = e.prompt_set.revision ? ` r${e.prompt_set.revision}` : ''
    return `${e.prompt_set.name || 'Prompt set'}${r}`
  }
  return 'Extracted values'
}

export function formatValue(v: FieldValue | undefined): string {
  if (!v || !v.found || v.value === null || v.value === undefined) return ''
  const raw = v.value
  let text: string
  if (typeof raw === 'boolean') text = raw ? 'Yes' : 'No'
  else if (Array.isArray(raw)) text = raw.map((x) => String(x)).join(', ')
  else if (typeof raw === 'object') text = JSON.stringify(raw)
  else text = String(raw)
  return v.unit ? `${text} ${v.unit}` : text
}

/** The rows in field order: the prompt set's, the raw schema's, else the data's. */
export function entryRows(e: ExtractionEntry): ExtractedRow[] {
  const props = e.schema?.properties || {}
  const defs: { name: string; label: string; description: string }[] = e.fields?.length
    ? e.fields.map((f) => ({ name: f.name, label: f.label || f.name, description: f.description || '' }))
    : (Object.keys(props).length ? Object.keys(props) : Object.keys(e.data || {})).map((n) => ({
        name: n,
        label: props[n]?.title || n,
        description: props[n]?.description || '',
      }))
  return defs.map((d) => {
    const v = e.data?.[d.name]
    return {
      ...d,
      found: !!v?.found,
      value: formatValue(v),
      quote: v?.evidence?.quote || '',
      colour: e.markup?.colours?.[d.name] || '',
      location: e.markup?.fields?.[d.name] || null,
    }
  })
}
