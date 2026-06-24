import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import type { ChatHandlers } from '@/services/chatService'

const { sendMock, closeMock } = vi.hoisted(() => ({ sendMock: vi.fn(), closeMock: vi.fn() }))
let handlers: ChatHandlers = {}

vi.mock('@/services/chatService', () => ({
  ChatSession: vi.fn().mockImplementation((h: ChatHandlers) => {
    handlers = h
    return { send: sendMock, close: closeMock }
  }),
}))

import ChatView from '@/views/ChatView.vue'

const mountView = () =>
  mount(ChatView, { global: { stubs: { AppNav: true, RouterLink: RouterLinkStub } } })

describe('ChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
  })

  it('sends with history, streams the answer (stripping <think>), and shows citations', async () => {
    const w = mountView()
    await w.find('input').setValue('What were northern revenues?')
    await w.find('form').trigger('submit')
    expect(sendMock).toHaveBeenCalledWith('What were northern revenues?', { history: [] })

    handlers.onToken?.('<think>let me check the table</think>')
    handlers.onToken?.('Northern revenue reached $175M.')
    handlers.onCitations?.([{ fileUid: 'report.md', marker: 1 }])
    handlers.onDone?.()
    await flushPromises()

    expect(w.text()).toContain('Northern revenue reached $175M.')
    expect(w.text()).not.toContain('let me check the table') // <think> hidden
    expect(w.text()).toContain('[1] report.md')
    // citation chip deep-links to the cited file's preview
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/preview/report.md')
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
