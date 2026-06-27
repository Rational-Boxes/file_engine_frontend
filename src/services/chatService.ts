import { chatSocketUrl } from '@/services/csaiClient'
import type { ChatEvent, Citation } from '@/types'

// Streaming RAG chat client for convert_search_ai's `/chat` WebSocket.
//
// Wire protocol (server → client), one JSON object per message:
//   {"type":"token","text":"..."}                                    answer deltas
//   {"type":"tool_call","name":"web_search","args":{...}}            model called a tool
//   {"type":"tool_result","name":"web_search"}                       tool returned
//   {"type":"citations","citations":[{marker,kind,file_uid|url,...}]} doc + web sources
//   {"type":"done"}                                                  turn complete
//   {"type":"error","error":"..."}                                   failure
// Client → server: {"message", "system_prompt"?, "history"?, "k"?, "web_search"?}.

export interface ChatHandlers {
  onToken?: (text: string) => void
  onCitations?: (citations: Citation[]) => void
  onToolCall?: (name: string, args?: Record<string, unknown>) => void
  onToolResult?: (name: string) => void
  onDone?: () => void
  onError?: (error: string) => void
  onOpen?: () => void
  onClose?: () => void
}

export interface ChatSendOptions {
  systemPrompt?: string
  history?: Array<{ role: string; content: string }>
  k?: number
  webSearch?: boolean
}

function parseCitation(c: unknown): Citation {
  const o = (c ?? {}) as Record<string, unknown>
  const marker = typeof o.marker === 'number' ? o.marker : undefined
  // Web citations carry a url (and the server tags kind:"web"); everything else
  // is a document citation keyed by file_uid.
  if (o.kind === 'web' || o.url) {
    return { kind: 'web', marker, url: String(o.url ?? ''), title: String(o.title ?? '') }
  }
  return { kind: 'doc', marker, fileUid: String(o.file_uid ?? '') }
}

// Normalize a raw server message into a typed ChatEvent (or null if unknown).
export function parseChatEvent(raw: unknown): ChatEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  switch (e.type) {
    case 'token':
      return { type: 'token', text: String(e.text ?? '') }
    case 'citations': {
      const list = Array.isArray(e.citations) ? e.citations : []
      return { type: 'citations', citations: list.map(parseCitation) }
    }
    case 'tool_call':
      return {
        type: 'tool_call',
        name: String(e.name ?? ''),
        args: e.args && typeof e.args === 'object' ? (e.args as Record<string, unknown>) : undefined,
      }
    case 'tool_result':
      return { type: 'tool_result', name: String(e.name ?? '') }
    case 'done':
      return { type: 'done' }
    case 'error':
      return { type: 'error', error: String(e.error ?? 'error') }
    default:
      return null
  }
}

// A single chat WebSocket session. Messages sent before the socket opens are
// buffered and flushed on open. `socketFactory` is injectable for testing.
export class ChatSession {
  private ws: WebSocket
  private queue: string[] = []

  constructor(
    private handlers: ChatHandlers = {},
    socketFactory: () => WebSocket = () => new WebSocket(chatSocketUrl()),
  ) {
    this.ws = socketFactory()
    this.ws.onopen = () => {
      for (const m of this.queue.splice(0)) this.ws.send(m)
      this.handlers.onOpen?.()
    }
    this.ws.onclose = () => this.handlers.onClose?.()
    this.ws.onerror = () => this.handlers.onError?.('connection error')
    this.ws.onmessage = (ev: MessageEvent) => this.dispatch(ev.data)
  }

  private dispatch(data: unknown): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(data))
    } catch {
      return
    }
    const e = parseChatEvent(parsed)
    if (!e) return
    if (e.type === 'token') this.handlers.onToken?.(e.text)
    else if (e.type === 'citations') this.handlers.onCitations?.(e.citations)
    else if (e.type === 'tool_call') this.handlers.onToolCall?.(e.name, e.args)
    else if (e.type === 'tool_result') this.handlers.onToolResult?.(e.name)
    else if (e.type === 'done') this.handlers.onDone?.()
    else if (e.type === 'error') this.handlers.onError?.(e.error)
  }

  send(message: string, opts: ChatSendOptions = {}): void {
    const payload: Record<string, unknown> = { message }
    if (opts.systemPrompt) payload.system_prompt = opts.systemPrompt
    if (opts.history) payload.history = opts.history
    if (opts.k != null) payload.k = opts.k
    if (opts.webSearch != null) payload.web_search = opts.webSearch
    const json = JSON.stringify(payload)
    // OPEN === 1 (avoid referencing the WebSocket global, absent in jsdom).
    if (this.ws.readyState === 1) this.ws.send(json)
    else this.queue.push(json)
  }

  close(): void {
    this.ws.close()
  }
}
