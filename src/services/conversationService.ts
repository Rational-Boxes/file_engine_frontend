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
    const { data } = await csaiClient.get<{ id: string; title: string; messages?: RawMessage[] }>(
      `/conversations/${id}`,
    )
    return {
      id: data.id,
      title: data.title || 'New chat',
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
