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
import type { SearchHit } from '@/types'

// Search + document-text client for convert_search_ai. Permission-gated
// server-side (results are only what the user may read); we send the same
// bearer token via csaiClient.

interface RawHit {
  file_uid: string
  name: string
  snippet: string
  score: number
}

export const searchService = {
  // Permission-gated full-text + fuzzy (and vector-backed) search.
  async search(
    query: string,
    opts: { limit?: number; fuzzy?: boolean } = {},
  ): Promise<SearchHit[]> {
    const body: Record<string, unknown> = { query }
    if (opts.limit != null) body.limit = opts.limit
    if (opts.fuzzy != null) body.fuzzy = opts.fuzzy
    const { data } = await csaiClient.post<{ hits?: RawHit[] }>('/search', body)
    return (data?.hits ?? []).map((h) => ({
      fileUid: h.file_uid,
      name: h.name,
      snippet: h.snippet,
      score: h.score,
    }))
  },

  // Extracted Markdown for a document (READ-gated).
  async getText(fileUid: string): Promise<{ text: string; truncated: boolean }> {
    const { data } = await csaiClient.get<{ text: string; truncated: boolean }>(
      `/documents/${fileUid}/text`,
    )
    return { text: data?.text ?? '', truncated: !!data?.truncated }
  },

  // Ask CSAI to (re)generate a document's renditions (preview/thumbnail/inline
  // PDF) + index on demand — used when a file has no preview yet. READ-gated.
  async generatePreview(
    fileUid: string,
  ): Promise<{ status: string; renditions: string[]; hasMarkdown: boolean }> {
    const { data } = await csaiClient.post<{
      status: string
      renditions: string[]
      has_markdown: boolean
    }>(`/documents/${fileUid}/convert`, {})
    return {
      status: data?.status ?? '',
      renditions: data?.renditions ?? [],
      hasMarkdown: !!data?.has_markdown,
    }
  },
}
