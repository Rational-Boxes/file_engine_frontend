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

// Types mirroring the folder_actions API (SPECIFICATIONS.md §6.1/§10).

// The standard field-type catalog the generic form renderer understands.
export type FieldType =
  | 'string' | 'text' | 'integer' | 'number' | 'boolean' | 'select'
  | 'multiselect' | 'secret' | 'folder' | 'file' | 'principal' | 'ref' | 'group'

export interface FieldOption {
  value: string
  label: string
}

export interface FieldDescriptor {
  key: string
  label: string
  type: FieldType
  required?: boolean
  default?: unknown
  help?: string | null
  min?: number | null
  max?: number | null
  step?: number | null
  max_length?: number | null
  pattern?: string | null
  options?: FieldOption[] | null
  options_source?: string | null // event_catalog | classifier_sets | mime_catalog
  item_fields?: FieldDescriptor[] | null
  secret?: boolean
  visible_when?: { key: string; equals: unknown } | null
}

export interface ActionType {
  type_name: string
  label: string
  description: string
  supported_events: string[]
  auto_moves?: boolean // manifest: moves files unattended (loop-guarded, §3.3)
  fields: FieldDescriptor[]
}

export interface ActionBinding {
  id: string
  folder_uid: string
  recursive: boolean
  action_type: string
  on_events: string[]
  mime_types: string[]
  config: Record<string, unknown>
  enabled: boolean
  created_by: string
  created_at?: string
  updated_at?: string
}

export interface BindingCreate {
  action_type: string
  on_events: string[]
  mime_types?: string[]
  config: Record<string, unknown>
  recursive?: boolean
}

export interface BindingUpdate {
  action_type?: string
  on_events?: string[]
  mime_types?: string[]
  config?: Record<string, unknown>
  recursive?: boolean
  enabled?: boolean
}

export interface SorterRoute {
  classifier_set_id?: string | null
  classification_name: string
  threshold: number
  destination_folder: string
  priority: number
}

export interface ActionRun {
  event_id: string
  binding_id: string
  action_type: string
  file_uid: string
  version: string
  status: 'done' | 'failed' | 'skipped' | string
  detail: Record<string, unknown>
  ts?: string
}

// --- classifier editor (§7.3.1) ---
export interface ClassifierTerm {
  term: string
  distance: number
  weight: number
}

export interface Classifier {
  id?: string
  name: string
  terms: ClassifierTerm[]
}

export interface ClassifierSetSummary {
  id: string
  name: string
  created_by?: string
  // Set by the provisioning service (§14a) when an integration owns this config;
  // the editor warns that manual edits may be overwritten on the next sync.
  managed_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface ClassifierSetFull {
  id: string
  name: string
  managed_by?: string | null
  classifiers: Classifier[]
}

export interface ClassifierTestResult {
  scores: Record<string, number>
  matches?: unknown
}

// --- event-notification email templates (§7.2) ---
export interface NotifyTemplateSummary {
  id: string
  name: string
  subject?: string
  created_by?: string
  managed_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface NotifyTemplate {
  id: string
  name: string
  subject: string
  body_text: string
  body_html: string
  created_by?: string
  managed_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface NotifyTemplateInput {
  name: string
  subject?: string
  body_text?: string
  body_html?: string
}
