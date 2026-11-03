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

/** Where a value is marked in the marked-up PDF (read from its annotations). */
export interface FieldMark {
  page: number
  colour: string
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
  /** Where it is highlighted; null when the PDF marks it nowhere (or is not read yet). */
  mark: FieldMark | null
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
export function entryRows(e: ExtractionEntry, marks: Record<string, FieldMark> = {}): ExtractedRow[] {
  return entryDefs(e).map((d) => {
    const v = e.data?.[d.name]
    return {
      ...d,
      found: !!v?.found,
      value: formatValue(v),
      quote: v?.evidence?.quote || '',
      mark: marks[d.name] || null,
    }
  })
}

function entryDefs(e: ExtractionEntry): { name: string; label: string; description: string }[] {
  const props = e.schema?.properties || {}
  if (e.fields?.length) {
    return e.fields.map((f) => ({ name: f.name, label: f.label || f.name, description: f.description || '' }))
  }
  return (Object.keys(props).length ? Object.keys(props) : Object.keys(e.data || {})).map((n) => ({
    name: n,
    label: props[n]?.title || n,
    description: props[n]?.description || '',
  }))
}

// --- The marked-up PDF, found and read without asking csai for more than the values ---
// csai writes it beside the source as `<version>-extractpdf_<set>.pdf` (its
// renditions.extract_pdf_fmt + headless/extract.py _mark_up): <set> is the
// prompt set id without `ps_`, or `s` + the first 12 characters of the entry
// key for a raw schema, lower-cased, alphanumerics only, at most 32. The
// version is sanitised as every rendition's is (renditions._safe_version).

const sanitise = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) || 'x'
const safeVersion = (v: string) => (v || '0').trim().replace(/[^A-Za-z0-9._-]/g, '_') || '0'

/** The filename of an entry's marked-up PDF for a version. */
export function markupPdfName(e: ExtractionEntry, version: string): string {
  const id = e.prompt_set?.id || ''
  const key = id ? (id.startsWith('ps_') ? id.slice(3) : id) : `s${e.entry.slice(0, 12)}`
  return `${safeVersion(version)}-extractpdf_${sanitise(key)}.pdf`
}

/** An entry's marked-up PDF among the source's rendition children, or undefined. */
export function findMarkupPdf<T extends { uid: string; name: string }>(
  e: ExtractionEntry, version: string, children: T[],
): T | undefined {
  const want = markupPdfName(e, version)
  return children.find((c) => c.name === want)
}

/**
 * Where each value is marked, from the PDF's annotations. csai notes every
 * highlight and underline as `<label>: <value>[ unit]` (headless/markup.py
 * mark_up); the first (lowest-page) note per label wins. Longest labels are
 * tried first so "Width max" never matches a note meant for "Width".
 */
export function marksFromNotes(
  e: ExtractionEntry, notes: { page: number; text: string; colour: string }[],
): Record<string, FieldMark> {
  const defs = [...entryDefs(e)].sort((a, b) => b.label.length - a.label.length)
  const out: Record<string, FieldMark> = {}
  for (const n of [...notes].sort((a, b) => a.page - b.page)) {
    const d = defs.find((x) => n.text.startsWith(`${x.label}: `))
    if (d && !out[d.name]) out[d.name] = { page: n.page, colour: n.colour }
  }
  return out
}
