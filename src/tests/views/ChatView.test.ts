import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { ChatHandlers } from '@/services/chatService'

const { sendMock, closeMock } = vi.hoisted(() => ({ sendMock: vi.fn(), closeMock: vi.fn() }))
let handlers: ChatHandlers = {}

vi.mock('@/services/chatService', () => ({
  ChatSession: vi.fn().mockImplementation((h: ChatHandlers) => {
    handlers = h
    return { send: sendMock, close: closeMock }
  }),
}))
const { open } = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@/stores/preview', () => ({ usePreviewStore: () => ({ open }) }))
const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))
vi.mock('@/services/fileService', () => ({ fileService: { stat } }))
const { listConvs, getConv, removeConv } = vi.hoisted(() => ({
  listConvs: vi.fn(),
  getConv: vi.fn(),
  removeConv: vi.fn(),
}))
vi.mock('@/services/conversationService', () => ({
  conversationService: { list: listConvs, get: getConv, remove: removeConv },
}))

import ChatView from '@/views/ChatView.vue'
import ShadowHtml from '@/components/ShadowHtml.vue'

const mountView = () => mount(ChatView, { global: { stubs: { AppNav: true, HelpIcon: true } } })

// Assistant answers render inside ShadowHtml's shadow root (style isolation), so
// they're not visible to w.text()/w.find() — reach into the shadow root instead.
type W = ReturnType<typeof mountView>
const shadowRoots = (w: W) =>
  w.findAllComponents(ShadowHtml).map((c) => (c.element as HTMLElement).shadowRoot).filter(Boolean) as ShadowRoot[]
const shadowText = (w: W) => shadowRoots(w).map((r) => r.textContent || '').join(' ')
const shadowHtml = (w: W) => shadowRoots(w).map((r) => r.innerHTML || '').join(' ')
const shadowHas = (w: W, sel: string) => shadowRoots(w).some((r) => !!r.querySelector(sel))

describe('ChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
    stat.mockResolvedValue({ name: 'report.md' }) // citation name resolution
    listConvs.mockResolvedValue([])
    getConv.mockResolvedValue({ id: 'c1', title: 'old', messages: [] })
    removeConv.mockResolvedValue(true)
  })

  it('sends with history, streams the answer (stripping <think>), and shows citations', async () => {
    const w = mountView()
    await w.find('input').setValue('What were northern revenues?')
    await w.find('form').trigger('submit')
    expect(sendMock).toHaveBeenCalledWith('What were northern revenues?', { history: [], webSearch: false })

    handlers.onToken?.('<think>let me check the table</think>')
    handlers.onToken?.('Northern revenue reached **$175M**.')
    handlers.onCitations?.([{ fileUid: 'report.md', marker: 1 }])
    handlers.onDone?.()
    await flushPromises()

    expect(shadowText(w)).toContain('Northern revenue reached $175M.')
    expect(shadowText(w)).not.toContain('let me check the table') // <think> hidden
    expect(shadowHtml(w)).toContain('<strong>$175M</strong>') // Markdown -> HTML
    // citation chip shows the resolved file name (not the UUID)
    expect(w.find('.cite').text()).toContain('[1] report.md')
    // citation chip raises the preview overlay (no navigation, chat is preserved)
    await w.find('.cite').trigger('click')
    expect(open).toHaveBeenCalledWith('report.md')
    // input re-enabled after done
    expect((w.find('input').element as HTMLInputElement).disabled).toBe(false)
  })

  it('sends prior turns as history on a follow-up', async () => {
    const w = mountView()
    await w.find('input').setValue('first')
    await w.find('form').trigger('submit')
    handlers.onToken?.('answer one')
    handlers.onDone?.()
    await flushPromises()

    await w.find('input').setValue('second')
    await w.find('form').trigger('submit')
    expect(sendMock).toHaveBeenLastCalledWith('second', {
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer one' },
      ],
      webSearch: false,
    })
  })

  it('sends the web_search flag when the Web toggle is on', async () => {
    const w = mountView()
    await w.find('.tb-toggle input').setValue(true)
    await w.find('.composer-input').setValue('latest news?')
    await w.find('form').trigger('submit')
    expect(sendMock).toHaveBeenCalledWith('latest news?', { history: [], webSearch: true })
  })

  it('shows a searching indicator and renders web citations as external links', async () => {
    const w = mountView()
    await w.find('input').setValue('q')
    await w.find('form').trigger('submit')

    handlers.onToolCall?.('web_search', { query: 'q' })
    await flushPromises()
    expect(w.find('.searching').exists()).toBe(true)

    handlers.onToolResult?.('web_search')
    handlers.onToken?.('Per the web…')
    handlers.onCitations?.([
      { kind: 'doc', fileUid: 'report.md', marker: 1 },
      { kind: 'web', url: 'https://example.com/x', title: 'Example', marker: 2 },
    ])
    handlers.onDone?.()
    await flushPromises()

    expect(w.find('.searching').exists()).toBe(false)
    const link = w.find('a.cite-web')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://example.com/x')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.text()).toContain('[2] example.com')
    // the document citation still renders as a preview button
    expect(w.find('button.cite').text()).toContain('[1] report.md')
  })

  it('shows an error and re-enables input on stream error', async () => {
    const w = mountView()
    await w.find('input').setValue('q')
    await w.find('form').trigger('submit')
    handlers.onError?.('model unavailable')
    await flushPromises()
    expect(w.text()).toContain('model unavailable')
    expect((w.find('input').element as HTMLInputElement).disabled).toBe(false)
  })

  it('shows a working caret while the answer streams, then removes it on done', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('input').setValue('q')
    await w.find('form').trigger('submit')
    // before the first token: a standalone blinking caret + streaming bubble
    expect(w.find('.caret').exists()).toBe(true)
    expect(shadowHas(w, '.md.streaming')).toBe(true)

    handlers.onToken?.('partial')
    await flushPromises()
    // text is visible now → standalone caret gone, trailing caret via class
    expect(w.find('.caret').exists()).toBe(false)
    expect(shadowHas(w, '.md.streaming')).toBe(true)

    handlers.onDone?.()
    await flushPromises()
    expect(shadowHas(w, '.md.streaming')).toBe(false)
    expect(w.find('.caret').exists()).toBe(false)
  })

  it('clears the working caret on a stream error', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('input').setValue('q')
    await w.find('form').trigger('submit')
    expect(w.find('.caret').exists()).toBe(true)
    handlers.onError?.('boom')
    await flushPromises()
    expect(w.find('.caret').exists()).toBe(false)
    expect(w.find('.md.streaming').exists()).toBe(false)
  })

  // Give the messages container measurable scroll geometry (jsdom reports 0s).
  function sizeMessages(w: ReturnType<typeof mountView>, scrollHeight = 500, clientHeight = 200) {
    const el = w.find('.messages').element as HTMLElement
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
    return el
  }

  it('auto-scrolls to the bottom as the answer streams in', async () => {
    const w = mountView()
    await flushPromises()
    const el = sizeMessages(w)
    el.scrollTop = 0
    await w.find('input').setValue('q')
    await w.find('form').trigger('submit') // sending re-pins to the bottom
    await flushPromises()
    expect(el.scrollTop).toBe(500)

    el.scrollTop = 0 // pretend layout shifted; streaming should re-pin
    handlers.onToken?.('streaming answer text')
    await flushPromises()
    expect(el.scrollTop).toBe(500)
  })

  it('does not yank the view down while the user has scrolled up to read history', async () => {
    const w = mountView()
    await flushPromises()
    const el = sizeMessages(w)
    await w.find('input').setValue('q')
    await w.find('form').trigger('submit')
    await flushPromises()

    // user scrolls up to read earlier messages (far from the bottom)
    el.scrollTop = 10
    await el.dispatchEvent(new Event('scroll'))
    handlers.onToken?.('a long streamed answer that would otherwise scroll')
    await flushPromises()
    expect(el.scrollTop).toBe(10) // stayed where the user left it
  })

  it('lists saved conversations and resumes one on click', async () => {
    listConvs.mockResolvedValue([{ id: 'c1', title: 'Northern revenues', updatedAt: 't' }])
    getConv.mockResolvedValue({
      id: 'c1',
      title: 'Northern revenues',
      messages: [
        { role: 'user', content: 'hi there', citations: [] },
        { role: 'assistant', content: 'hello back', citations: [{ fileUid: 'report.md', marker: 1 }] },
      ],
    })
    const w = mountView()
    await flushPromises()
    expect(w.find('.conv-open').text()).toContain('Northern revenues')

    await w.find('.conv-open').trigger('click')
    await flushPromises()
    expect(getConv).toHaveBeenCalledWith('c1')
    expect(w.text()).toContain('hi there') // user message (light DOM)
    expect(shadowText(w)).toContain('hello back') // assistant answer (shadow root)
    // resumed assistant citation renders
    expect(w.find('.cite').text()).toContain('[1] report.md')
  })

  it('rebuilds the "Open report" preview link when resuming a chat with a saved report', async () => {
    listConvs.mockResolvedValue([{ id: 'c2', title: 'Report chat', updatedAt: 't' }])
    getConv.mockResolvedValue({
      id: 'c2',
      title: 'Report chat',
      messages: [
        { role: 'user', content: 'make a report', citations: [] },
        {
          role: 'assistant',
          content:
            'Done.\n\n✅ Saved the report to /Reports/q3.html (file abc-123). A PDF preview is being generated.\n',
          citations: [],
        },
      ],
    })
    const w = mountView()
    await flushPromises()
    await w.find('.conv-open').trigger('click')
    await flushPromises()
    const btn = w.find('.open-report')
    expect(btn.exists()).toBe(true) // link rebuilt from the persisted confirmation
    await btn.trigger('click')
    expect(open).toHaveBeenCalledWith('abc-123', 'q3.html') // opens the preview
  })

  it('sends the adopted conversation_id on a follow-up after the server assigns it', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('input').setValue('first')
    await w.find('form').trigger('submit')
    handlers.onConversation?.('srv-123') // server persists + assigns id
    handlers.onToken?.('answer')
    handlers.onDone?.()
    await flushPromises()

    await w.find('input').setValue('second')
    await w.find('form').trigger('submit')
    expect(sendMock).toHaveBeenLastCalledWith('second', {
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer' },
      ],
      webSearch: false,
      conversationId: 'srv-123',
    })
  })

  it('deletes a conversation and clears the transcript when it was active', async () => {
    listConvs.mockResolvedValue([{ id: 'c1', title: 'Chat', updatedAt: 't' }])
    getConv.mockResolvedValue({
      id: 'c1',
      title: 'Chat',
      messages: [{ role: 'user', content: 'loaded message', citations: [] }],
    })
    const w = mountView()
    await flushPromises()
    await w.find('.conv-open').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('loaded message')

    listConvs.mockResolvedValue([]) // gone after delete
    await w.find('.conv-del').trigger('click')
    await flushPromises()
    expect(removeConv).toHaveBeenCalledWith('c1')
    expect(w.text()).not.toContain('loaded message')
  })

  it('"New chat" clears the transcript and drops the conversation id', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('input').setValue('hello')
    await w.find('form').trigger('submit')
    handlers.onConversation?.('srv-9')
    handlers.onToken?.('hi')
    handlers.onDone?.()
    await flushPromises()
    expect(w.text()).toContain('hello')

    await w.find('.new-chat').trigger('click')
    await flushPromises()
    expect(w.text()).not.toContain('hello')

    // next send carries no conversation_id (fresh chat)
    await w.find('input').setValue('brand new')
    await w.find('form').trigger('submit')
    expect(sendMock).toHaveBeenLastCalledWith('brand new', { history: [], webSearch: false })
  })
})
