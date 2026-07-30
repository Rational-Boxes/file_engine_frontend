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
import type { Citation, ConversationDetail, ConversationSummary } from '@/types'

// Persisted chat history client for convert_search_ai. The server scopes every
// conversation to the authenticated user within their tenant (same bearer token
// via csaiClient), so these only ever return the caller's own chats. New chats
// are created implicitly by the /chat WebSocket; this client lists, resumes, and
// deletes them.

interface RawSummary {
  id: string
  title: string
  updated_at: string
}

interface RawMessage {
  role: string
  content: string
  citations?: unknown[]
}

// Mirror chatService.parseCitation's wire→typed mapping for persisted citations.
function mapCitation(c: unknown): Citation {
  const o = (c ?? {}) as Record<string, unknown>
  const marker = typeof o.marker === 'number' ? o.marker : undefined
  if (o.kind === 'mcp') {
    return {
      kind: 'mcp',
      marker,
      integration: String(o.integration ?? ''),
      tool: String(o.tool ?? ''),
    }
  }
  if (o.kind === 'web' || o.url) {
    return { kind: 'web', marker, url: String(o.url ?? ''), title: String(o.title ?? '') }
  }
  return { kind: 'doc', marker, fileUid: String(o.file_uid ?? '') }
}

export const conversationService = {
  // The user's chats, most-recently-updated first (server-ordered).
  async list(): Promise<ConversationSummary[]> {
    const { data } = await csaiClient.get<{ conversations?: RawSummary[] }>('/conversations')
    return (data?.conversations ?? []).map((c) => ({
      id: c.id,
      title: c.title || 'New chat',
      updatedAt: c.updated_at,
    }))
  },

  // A single chat plus its messages (for resume). Throws on 404 (not the user's).
  async get(id: string): Promise<ConversationDetail> {
    const { data } = await csaiClient.get<{
      id: string
      title: string
      scope?: Array<{ uid: string; path: string }>
      messages?: RawMessage[]
    }>(`/conversations/${id}`)
    return {
      id: data.id,
      title: data.title || 'New chat',
      scope: (data.scope ?? [])
        .filter((s) => s && s.uid)
        .map((s) => ({ uid: String(s.uid), path: String(s.path ?? '') })),
      messages: (data.messages ?? []).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content ?? '',
        citations: (m.citations ?? []).map(mapCitation),
      })),
    }
  },

  // Delete a chat (and its messages). Returns false if it wasn't the user's.
  async remove(id: string): Promise<boolean> {
    try {
      await csaiClient.delete(`/conversations/${id}`)
      return true
    } catch {
      return false
    }
  },
}
