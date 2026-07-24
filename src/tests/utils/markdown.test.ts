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

  it('strips <style> by default so it cannot leak into the page', () => {
    const html = renderMarkdown('text\n\n<style>.x{color:red}</style>')
    expect(html.toLowerCase()).not.toContain('<style')
    expect(html).toContain('text')
  })

  it('still strips scripts when allowStyle is set', () => {
    // allowStyle keeps <style> so the LLM can style its own answer (which is
    // rendered inside an isolated shadow root — see ShadowHtml). Whether the
    // <style> element survives is a browser CSSOM behavior the test DOM can't
    // represent, but the safety invariant must always hold: no scripts.
    const safe = renderMarkdown('<style>.x{}</style><script>alert(1)</script>text', { allowStyle: true })
    expect(safe.toLowerCase()).not.toContain('<script')
    expect(safe).toContain('text')
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
