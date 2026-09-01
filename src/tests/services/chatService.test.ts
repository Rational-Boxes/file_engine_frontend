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

  it('parses an MCP citation (external tool invocation)', () => {
    expect(
      parseChatEvent({
        type: 'citations',
        citations: [
          { file_uid: 'f1', marker: 1 },
          { kind: 'mcp', integration: 'Hugging Face', tool: 'hf_whoami', marker: 2 },
        ],
      }),
    ).toEqual({
      type: 'citations',
      citations: [
        { kind: 'doc', fileUid: 'f1', marker: 1 },
        { kind: 'mcp', integration: 'Hugging Face', tool: 'hf_whoami', marker: 2 },
      ],
    })
  })

  it('parses the report_saved event', () => {
    expect(parseChatEvent({ type: 'report_saved', uid: 'u1', name: 'r.html', path: '/Reports/r.html' })).toEqual({
      type: 'report_saved',
      uid: 'u1',
      name: 'r.html',
      path: '/Reports/r.html',
    })
  })

  it('parses the conversation id event', () => {
    expect(parseChatEvent({ type: 'conversation', id: 'abc' })).toEqual({
      type: 'conversation',
      id: 'abc',
    })
  })

  it('parses the MCP tool_consent_request event (snake_case → camelCase)', () => {
    expect(
      parseChatEvent({
        type: 'tool_consent_request',
        id: 'c1',
        integration: 'CRM',
        tool: 'create_ticket',
        tool_full: 'mcp__crm__create_ticket',
        args_summary: 'subject=Hi',
      }),
    ).toEqual({
      type: 'tool_consent_request',
      id: 'c1',
      integration: 'CRM',
      tool: 'create_ticket',
      toolFull: 'mcp__crm__create_ticket',
      argsSummary: 'subject=Hi',
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

  it('sends scope_folders (with paths) when a folder scope is provided', () => {
    const { ws, session } = setup()
    ws.open()
    const scope = [
      { uid: 'fa', path: '/A' },
      { uid: 'fb', path: '/B' },
    ]
    session.send('scoped', { scopeFolders: scope })
    expect(JSON.parse(ws.sent[0])).toEqual({ message: 'scoped', scope_folders: scope })
    // An empty scope is still sent (so clearing it persists on the conversation).
    session.send('cleared', { scopeFolders: [] })
    expect(JSON.parse(ws.sent[1])).toEqual({ message: 'cleared', scope_folders: [] })
    // Omitting the option entirely sends no scope field.
    session.send('none')
    expect(JSON.parse(ws.sent[2])).toEqual({ message: 'none' })
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

  it('dispatches report_saved and sends the pinned report target', () => {
    const ws = new FakeWS()
    const onReportSaved = vi.fn()
    const session = new ChatSession({ onReportSaved }, () => ws as unknown as WebSocket)
    ws.open()
    ws.emit({ type: 'report_saved', uid: 'u9', name: 'q3.html', path: '/Reports/q3.html' })
    expect(onReportSaved).toHaveBeenCalledWith({ uid: 'u9', name: 'q3.html', path: '/Reports/q3.html' })

    session.send('Generate a report of our conversation.', {
      reportTarget: { folderUid: 'fold1', folderPath: '/Reports', filename: 'q3' },
    })
    expect(JSON.parse(ws.sent[0])).toEqual({
      message: 'Generate a report of our conversation.',
      report_target_folder_uid: 'fold1',
      report_target_filename: 'q3',
      report_target_path: '/Reports',
      // The app URL travels with a report turn so the saved document's file
      // references are complete deep-links, not relative paths.
      app_url: window.location.origin,
    })
  })

  it('sends no app_url on an ordinary (non-report) turn', () => {
    const ws = new FakeWS()
    const session = new ChatSession({}, () => ws as unknown as WebSocket)
    ws.open()
    session.send('just chatting')
    expect(JSON.parse(ws.sent[0])).toEqual({ message: 'just chatting' })
  })

  it('lets the caller override the app URL sent with a report turn', () => {
    const ws = new FakeWS()
    const session = new ChatSession({}, () => ws as unknown as WebSocket)
    ws.open()
    session.send('report please', {
      reportTarget: { folderUid: 'f1', folderPath: '/R', filename: 'q4' },
      appUrl: 'https://files.example.com/app',
    })
    expect(JSON.parse(ws.sent[0]).app_url).toBe('https://files.example.com/app')
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

  it('dispatches a consent request and sends the tool_consent reply', () => {
    const ws = new FakeWS()
    const onConsentRequest = vi.fn()
    const session = new ChatSession({ onConsentRequest }, () => ws as unknown as WebSocket)
    ws.open()
    ws.emit({
      type: 'tool_consent_request',
      id: 'c1',
      integration: 'CRM',
      tool: 'create_ticket',
      tool_full: 'mcp__crm__create_ticket',
      args_summary: 'subject=Hi',
    })
    expect(onConsentRequest).toHaveBeenCalledWith({
      id: 'c1',
      integration: 'CRM',
      tool: 'create_ticket',
      toolFull: 'mcp__crm__create_ticket',
      argsSummary: 'subject=Hi',
    })
    session.sendConsent('c1', true, true)
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'tool_consent',
      id: 'c1',
      decision: true,
      remember: true,
    })
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
