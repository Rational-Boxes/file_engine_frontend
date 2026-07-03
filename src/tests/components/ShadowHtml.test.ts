import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShadowHtml from '@/components/ShadowHtml.vue'

describe('ShadowHtml', () => {
  it('renders html into an isolated shadow root, wrapped in the .md answer shell', () => {
    const w = mount(ShadowHtml, { props: { html: '<p>hello</p>' } })
    const root = w.element.shadowRoot
    expect(root).toBeTruthy()
    expect(root!.innerHTML).toContain('<p>hello</p>')
    expect(root!.innerHTML).toContain('class="md"')
    // Isolated: the html lives in the shadow root, not the light DOM.
    expect(w.element.innerHTML).toBe('')
  })

  it('bare mode injects a self-contained document as-is (no .md shell)', () => {
    const w = mount(ShadowHtml, {
      props: { html: '<style>.msg{color:red}</style><h1>Chat provenance log</h1>', bare: true },
    })
    const root = w.element.shadowRoot!
    expect(root.innerHTML).toContain('<h1>Chat provenance log</h1>')
    expect(root.innerHTML).toContain('<style>.msg{color:red}</style>') // its style stays scoped here
    expect(root.innerHTML).not.toContain('class="md"')
    expect(w.element.innerHTML).toBe('') // never leaks into the light DOM
  })

  it('updates the shadow content when html changes', async () => {
    const w = mount(ShadowHtml, { props: { html: '<p>one</p>', bare: true } })
    expect(w.element.shadowRoot!.innerHTML).toContain('one')
    await w.setProps({ html: '<p>two</p>' })
    expect(w.element.shadowRoot!.innerHTML).toContain('two')
    expect(w.element.shadowRoot!.innerHTML).not.toContain('one')
  })
})
