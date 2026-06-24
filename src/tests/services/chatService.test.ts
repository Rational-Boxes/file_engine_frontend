import { describe, it, expect, vi } from 'vitest'
import { parseChatEvent, ChatSession } from '@/services/chatService'

describe('parseChatEvent', () => {
  it('parses token / citations / done / error', () => {
    expect(parseChatEvent({ type: 'token', text: 'hi' })).toEqual({ type: 'token', text: 'hi' })
    expect(parseChatEvent({ type: 'citations', citations: [{ file_uid: 'f1', marker: 1 }] })).toEqual({
      type: 'citations',
      citations: [{ fileUid: 'f1', marker: 1 }],
    })
    expect(parseChatEvent({ type: 'done' })).toEqual({ type: 'done' })
    expect(parseChatEvent({ type: 'error', error: 'boom' })).toEqual({ type: 'error', error: 'boom' })
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
    expect(cites).toHaveBeenCalledWith([{ fileUid: 'f1', marker: 1 }])
    expect(done).toHaveBeenCalledTimes(1)
    expect(err).not.toHaveBeenCalled()
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
