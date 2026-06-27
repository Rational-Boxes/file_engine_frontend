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

import ChatView from '@/views/ChatView.vue'

const mountView = () => mount(ChatView, { global: { stubs: { AppNav: true } } })

describe('ChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
    stat.mockResolvedValue({ name: 'report.md' }) // citation name resolution
  })

  it('sends with history, streams the answer (stripping <think>), and shows citations', async () => {
    const w = mountView()
    await w.find('input').setValue('What were northern revenues?')
    await w.find('form').trigger('submit')
    expect(sendMock).toHaveBeenCalledWith('What were northern revenues?', { history: [] })

    handlers.onToken?.('<think>let me check the table</think>')
    handlers.onToken?.('Northern revenue reached **$175M**.')
    handlers.onCitations?.([{ fileUid: 'report.md', marker: 1 }])
    handlers.onDone?.()
    await flushPromises()

    expect(w.text()).toContain('Northern revenue reached $175M.')
    expect(w.text()).not.toContain('let me check the table') // <think> hidden
    expect(w.find('.md').html()).toContain('<strong>$175M</strong>') // Markdown -> HTML
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
    })
  })

  it('sends the web_search flag when the Web toggle is on', async () => {
    const w = mountView()
    await w.find('.web-toggle input').setValue(true)
    await w.find('input').setValue('latest news?')
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
})
