import { describe, it, expect } from 'vitest'
import { renderMarkdown, renderMarkdownInline } from '@/utils/markdown'

describe('renderMarkdown', () => {
  it('renders block Markdown to HTML', () => {
    const html = renderMarkdown('# Title\n\n- a\n- b\n\n`code`')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<li>a</li>')
    expect(html).toContain('<code>code</code>')
  })

  it('sanitizes dangerous HTML (untrusted LLM/excerpt output)', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> text\n\n<script>alert(2)</script>')
    expect(html.toLowerCase()).not.toContain('onerror')
    expect(html.toLowerCase()).not.toContain('<script')
    expect(html).toContain('text')
  })

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })
})

describe('renderMarkdownInline', () => {
  it('renders inline Markdown without a block <p> wrapper', () => {
    const html = renderMarkdownInline('see **north** region and `q3`')
    expect(html).toContain('<strong>north</strong>')
    expect(html).toContain('<code>q3</code>')
    expect(html).not.toContain('<p>')
  })

  it('sanitizes inline HTML too', () => {
    const html = renderMarkdownInline('hi <img src=x onerror="alert(1)">')
    expect(html.toLowerCase()).not.toContain('onerror')
  })
})
