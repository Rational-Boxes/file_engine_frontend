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

// Extraction prompt sets (convert_search_ai design_documents/
// EXTRACTION_PROMPT_SETS.md §4): what to extract from a kind of document, built
// and tried here, published for desktop applications and folder automation.
// A set has numbered revisions; a revision is a draft until published.

export type FieldType = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'enum' | 'list'

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'string', label: 'Text (short)' },
  { value: 'text', label: 'Text (long)' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Whole number' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'date', label: 'Date' },
  { value: 'enum', label: 'One of a list' },
  { value: 'list', label: 'List of text' },
]

export interface PromptField {
  name: string
  type: FieldType
  label?: string
  description?: string
  unit?: string
  enum?: string[]
  required?: boolean
  minimum?: number | null
  maximum?: number | null
}

export interface PromptSetDefinition {
  name: string
  description?: string
  slug?: string
  instructions?: string
  model?: string
  applies_to?: { classifier_set?: string; labels?: string[] }
  markup?: { colours?: Record<string, string> }
  fields: PromptField[]
}

export interface ModelChoice {
  requested: string | null
  used: string
  fallback: boolean
  label?: string
}

export interface PromptSetSummary {
  id: string
  slug: string | null
  name: string
  description: string
  status: 'active' | 'retired'
  managed: 'builder' | 'application'
  revision: number | null
  published_at?: string
  managed_by?: { label: string; client_key_id: string }
  model?: ModelChoice
  applies_to?: string[]
  fields?: PromptField[]
  locked?: boolean
  replaced_by?: string
  draft_revision?: number | null
}

export interface PromptSetDetail extends PromptSetSummary {
  revision_shown: number
  state: 'draft' | 'published'
  instructions?: string
  schema?: Record<string, unknown>
  definition?: PromptSetDefinition
}

export interface Warning {
  kind: string
  message?: string
  requested?: string
  used?: string
}

export interface ExtractModel {
  id: string
  label: string
  default: boolean
}

export interface Evidence {
  quote: string
  offset: number
}

export interface FieldValue {
  found: boolean
  value: unknown
  unit: string | null
  evidence: Evidence | null
}

export interface TestItem {
  file_uid: string
  name: string
  version: string
  data?: Record<string, FieldValue>
  counts?: Record<string, number>
  valid?: boolean
  problems?: string[]
  tokens?: number
  model?: string
  skipped?: string
  error?: string
  /** The marked-up PDF: "ready" (a test's, to view) or why there is none. */
  markup?: {
    status: 'ready' | 'written' | 'no_pdf' | 'too_large' | 'error'
    download?: string
    fields?: Record<string, { located: boolean; page?: number; method?: string; reason?: string }>
  }
}

export interface TestResult {
  plan: { model?: ModelChoice; prompt_set?: { id: string | null; name: string; revision: number | null } } | null
  items: TestItem[]
  summary: Record<string, unknown> | null
}

export interface TestRequest {
  set?: PromptSetDefinition
  prompt_set?: string
  revision?: number
  text?: string
  file_uid?: string
  name?: string
  model?: string
}

export const promptSetService = {
  async models(): Promise<ExtractModel[]> {
    const { data } = await csaiClient.get('/v1/extract/models')
    return data.models || []
  },

  async list(): Promise<PromptSetSummary[]> {
    const { data } = await csaiClient.get('/v1/prompt-sets', { params: { limit: 500 } })
    return data.prompt_sets || []
  },

  async get(id: string, revision?: number): Promise<PromptSetDetail> {
    const { data } = await csaiClient.get(`/v1/prompt-sets/${encodeURIComponent(id)}`,
      { params: revision ? { revision } : {} })
    return data
  },

  async revisions(id: string) {
    const { data } = await csaiClient.get(`/v1/prompt-sets/${encodeURIComponent(id)}/revisions`)
    return data.revisions as {
      revision: number; state: string; created_by: string; created_at: string; published_at: string
    }[]
  },

  async create(def: PromptSetDefinition): Promise<{ id: string; draft_revision: number; warnings: Warning[] }> {
    const { data } = await csaiClient.post('/v1/prompt-sets', def)
    return data
  },

  async saveDraft(id: string, def: PromptSetDefinition): Promise<{ id: string; draft_revision: number; warnings: Warning[] }> {
    const { data } = await csaiClient.put(`/v1/prompt-sets/${encodeURIComponent(id)}`, def)
    return data
  },

  async publish(id: string): Promise<{ id: string; revision: number; warnings: Warning[] }> {
    const { data } = await csaiClient.post(`/v1/prompt-sets/${encodeURIComponent(id)}/publish`)
    return data
  },

  async retire(id: string, replacedBy = ''): Promise<void> {
    await csaiClient.post(`/v1/prompt-sets/${encodeURIComponent(id)}/retire`, { replaced_by: replacedBy })
  },

  async control(id: string, body: { take_over?: boolean; locked?: boolean }): Promise<PromptSetDetail> {
    const { data } = await csaiClient.post(`/v1/prompt-sets/${encodeURIComponent(id)}/control`, body)
    return data
  },

  async exportYaml(id: string): Promise<string> {
    const { data } = await csaiClient.get(`/v1/prompt-sets/${encodeURIComponent(id)}/export`,
      { responseType: 'text', transformResponse: (d) => d })
    return data
  },

  async importYaml(text: string, onConflict: 'new' | 'revision' = 'new') {
    const { data } = await csaiClient.post('/v1/prompt-sets/import', text, {
      params: { on_conflict: onConflict },
      headers: { 'Content-Type': 'application/yaml' },
    })
    return data.imported as { id: string; name: string; draft_revision: number; created: boolean; warnings: Warning[] }[]
  },

  /** A test's marked-up PDF (held briefly by the server for this user). */
  async testMarkup(download: string): Promise<Blob> {
    const path = download.replace(/^\/+/, '/')
    const { data } = await csaiClient.get(path, { responseType: 'blob' })
    return data
  },

  /** Try a definition (saved or not) on pasted text or a stored file. Stores nothing. */
  async test(body: TestRequest): Promise<TestResult> {
    const { data } = await csaiClient.post('/v1/prompt-sets/test', body, {
      headers: { Accept: 'application/json' },
    })
    return data
  },
}

/** A blank field, typed as text. */
export function newField(): PromptField {
  return { name: '', type: 'string', label: '', description: '', required: false }
}

/** What is sent: empty optional parts dropped, enum values and units only where they apply. */
export function cleanDefinition(def: PromptSetDefinition): PromptSetDefinition {
  const numeric = (t: FieldType) => t === 'number' || t === 'integer'
  return {
    name: def.name.trim(),
    description: (def.description || '').trim(),
    slug: (def.slug || '').trim(),
    instructions: (def.instructions || '').trim(),
    model: def.model || '',
    applies_to: {
      classifier_set: (def.applies_to?.classifier_set || '').trim(),
      labels: (def.applies_to?.labels || []).map((l) => l.trim()).filter(Boolean),
    },
    markup: { colours: def.markup?.colours || {} },
    fields: def.fields.map((f) => {
      const out: PromptField = {
        name: f.name.trim(), type: f.type, label: (f.label || '').trim(),
        description: (f.description || '').trim(), required: !!f.required,
      }
      if (f.type === 'enum') out.enum = (f.enum || []).map((v) => v.trim()).filter(Boolean)
      if (numeric(f.type)) {
        if ((f.unit || '').trim()) out.unit = (f.unit || '').trim()
        if (f.minimum !== null && f.minimum !== undefined && `${f.minimum}` !== '') out.minimum = Number(f.minimum)
        if (f.maximum !== null && f.maximum !== undefined && `${f.maximum}` !== '') out.maximum = Number(f.maximum)
      }
      return out
    }),
  }
}
