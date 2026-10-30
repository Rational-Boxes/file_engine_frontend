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

// Headless runs: what desktop applications did through convert_search_ai with a
// generated key (convert_search_ai design_documents/HEADLESS_RESEARCH_API.md
// §3.5). Kept apart from the user's research chats — listed per application,
// read-only, never deleted. Same bearer as every csai call; the server returns
// only the caller's own runs.

export type UsageState = 'ok' | 'warning' | 'exceeded'

export interface UsageStatus {
  state: UsageState
  message: string
  limits: {
    tokens: { used: number; limit: number; resets_at: string; state: UsageState }
    requests: { used: number; limit: number; resets_at: string; state: UsageState }
  }
  cache: { hits: number; tokens_saved_estimate: number }
}

export interface RunSummary {
  id: string
  title: string
  updated_at?: string
}

export interface HeadlessApplication {
  clientKeyId: string
  label: string
  runCount: number
  lastRun: string
  runs: RunSummary[]
  usage: UsageStatus | null
}

export interface ExtractedValue {
  found: boolean
  value: unknown
  unit: string | null
  evidence: { quote: string; offset: number } | null
  dropped?: string
}

export interface RunResult {
  file_uid: string
  name: string
  version: string
  erased?: boolean
  skipped?: string
  error?: string
  cached?: boolean
  valid?: boolean
  data?: Record<string, ExtractedValue>
}

export interface HeadlessRun {
  id: string
  title: string
  clientLabel: string
  createdAt: string
  request: Record<string, unknown>
  summary: Record<string, unknown> | null
  answer: string
  results: RunResult[]
}

interface RawApp {
  client_key_id: string
  label: string
  run_count: number
  last_run: string
  runs: RunSummary[]
  usage: UsageStatus | null
}

interface RawRun {
  id: string
  title: string
  client_label: string
  created_at: string
  messages: { role: string; content: string }[]
  results: RunResult[]
}

function parseJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

export const headlessService = {
  // The user's headless runs grouped per application. An older csai has no
  // such route (404): that is "no applications", not an error.
  async listApplications(): Promise<HeadlessApplication[]> {
    try {
      const { data } = await csaiClient.get<{ applications?: RawApp[] }>('/v1/runs')
      return (data?.applications ?? []).map((a) => ({
        clientKeyId: a.client_key_id,
        label: a.label,
        runCount: a.run_count,
        lastRun: a.last_run,
        runs: a.runs ?? [],
        usage: a.usage ?? null,
      }))
    } catch {
      return []
    }
  },

  async getRun(id: string): Promise<HeadlessRun> {
    const { data } = await csaiClient.get<RawRun>(`/v1/runs/${encodeURIComponent(id)}`)
    const msgs = data.messages ?? []
    const first = msgs.find((m) => m.role === 'user')
    const assistant = msgs.filter((m) => m.role === 'assistant')
    const last = assistant[assistant.length - 1]
    const request = (first && parseJson(first.content)) || {}
    // An extraction run ends with its JSON summary; a question or report run
    // ends with the answer text.
    const lastJson = last ? parseJson(last.content) : null
    const isExtract = request.kind === 'extract'
    return {
      id: data.id,
      title: data.title,
      clientLabel: data.client_label,
      createdAt: data.created_at,
      request,
      summary: isExtract ? lastJson : null,
      answer: !isExtract && last ? last.content : '',
      results: data.results ?? [],
    }
  },
}
