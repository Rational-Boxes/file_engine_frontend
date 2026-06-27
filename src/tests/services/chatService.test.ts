import { describe, it, expect, vi } from 'vitest'
import { parseChatEvent, ChatSession } from '@/services/chatService'

describe('parseChatEvent', () => {
  it('parses token / citations / done / error', () => {
    expect(parseChatEvent({ type: 'token', text: 'hi' })).toEqual({ type: 'token', text: 'hi' })
    expect(parseChatEvent({ type: 'citations', citations: [{ file_uid: 'f1', marker: 1 }] })).toEqual({
      type: 'citations',
      citations: [{ kind: 'doc', fileUid: 'f1', marker: 1 }],
    })
    expect(parseChatEvent({ type: 'done' })).toEqual({ type: 'done' })
    expect(parseChatEvent({ type: 'error', error: 'boom' })).toEqual({ type: 'error', error: 'boom' })
  })

  it('parses web citations and tool events', () => {
    expect(
      parseChatEvent({
        type: 'citations',
        citations: [
          { file_uid: 'f1', marker: 1 },
          { kind: 'web', url: 'https://example.com/a', title: 'A', marker: 2 },
        ],
      }),
    ).toEqual({
      type: 'citations',
      citations: [
        { kind: 'doc', fileUid: 'f1', marker: 1 },
        { kind: 'web', url: 'https://example.com/a', title: 'A', marker: 2 },
      ],
    })
    expect(parseChatEvent({ type: 'tool_call', name: 'web_search', args: { query: 'x' } })).toEqual({
      type: 'tool_call',
      name: 'web_search',
      args: { query: 'x' },
    })
    expect(parseChatEvent({ type: 'tool_result', name: 'web_search' })).toEqual({
      type: 'tool_result',
      name: 'web_search',
    })
  })

  it('parses the conversation id event', () => {
    expect(parseChatEvent({ type: 'conversation', id: 'abc' })).toEqual({
      type: 'conversation',
      id: 'abc',
    })
  })

  it('ignores unknown / malformed messages', () => {
    expect(parseChatEvent({ type: 'nope' })).toBeNull()
    expect(parseChatEvent(null)).toBeNull()
    expect(parseChatEvent('x')).toBeNull()
  })
})

// Minimal fake WebSocket for the session tests (jsdom has no WebSocket).
class FakeWS {
  static OPEN = 1
  readyState = 0 // CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.onclose?.()
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  emit(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
}

describe('ChatSession', () => {
  function setup() {
    const ws = new FakeWS()
    const tok = vi.fn()
    const cites = vi.fn()
    const done = vi.fn()
    const err = vi.fn()
    const session = new ChatSession(
      { onToken: tok, onCitations: cites, onDone: done, onError: err },
      () => ws as unknown as WebSocket,
    )
    return { ws, tok, cites, done, err, session }
  }

  it('buffers a send until open, then flushes; sends after open go straight out', () => {
    const { ws, session } = setup()
    session.send('first', { systemPrompt: 'be concise', k: 4 })
    expect(ws.sent).toEqual([]) // buffered (socket not open yet)
    ws.open()
    expect(JSON.parse(ws.sent[0])).toEqual({ message: 'first', system_prompt: 'be concise', k: 4 })

    session.send('second')
    expect(JSON.parse(ws.sent[1])).toEqual({ message: 'second' })
  })

  it('dispatches incoming events to the handlers', () => {
    const { ws, tok, cites, done, err, session } = setup()
    void session
    ws.open()
    ws.emit({ type: 'token', text: 'Hello ' })
    ws.emit({ type: 'token', text: 'world' })
    ws.emit({ type: 'citations', citations: [{ file_uid: 'f1', marker: 1 }] })
    ws.emit({ type: 'done' })
    expect(tok.mock.calls.map((c) => c[0])).toEqual(['Hello ', 'world'])
    expect(cites).toHaveBeenCalledWith([{ kind: 'doc', fileUid: 'f1', marker: 1 }])
    expect(done).toHaveBeenCalledTimes(1)
    expect(err).not.toHaveBeenCalled()
  })

  it('dispatches tool_call / tool_result and sends the web_search flag', () => {
    const ws = new FakeWS()
    const onToolCall = vi.fn()
    const onToolResult = vi.fn()
    const session = new ChatSession({ onToolCall, onToolResult }, () => ws as unknown as WebSocket)
    ws.open()
    ws.emit({ type: 'tool_call', name: 'web_search', args: { query: 'mars' } })
    ws.emit({ type: 'tool_result', name: 'web_search' })
    expect(onToolCall).toHaveBeenCalledWith('web_search', { query: 'mars' })
    expect(onToolResult).toHaveBeenCalledWith('web_search')

    session.send('hi', { webSearch: true })
    expect(JSON.parse(ws.sent[0])).toEqual({ message: 'hi', web_search: true })
  })

  it('dispatches the conversation event and sends conversation_id', () => {
    const ws = new FakeWS()
    const onConversation = vi.fn()
    const session = new ChatSession({ onConversation }, () => ws as unknown as WebSocket)
    ws.open()
    ws.emit({ type: 'conversation', id: 'conv-7' })
    expect(onConversation).toHaveBeenCalledWith('conv-7')

    session.send('resume me', { conversationId: 'conv-7' })
    expect(JSON.parse(ws.sent[0])).toEqual({ message: 'resume me', conversation_id: 'conv-7' })
  })

  it('reports errors and ignores unparseable frames', () => {
    const { ws, err, tok } = setup()
    ws.open()
    ws.onmessage?.({ data: 'not json' })
    ws.emit({ type: 'error', error: 'nope' })
    expect(tok).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalledWith('nope')
  })
})
