import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Markdown rendering for UNTRUSTED content (LLM chat answers, indexed document
// excerpts). Always sanitize the generated HTML before it reaches v-html.
marked.use({ gfm: true, breaks: true })

// Block-level render (paragraphs, lists, code blocks, …) — for chat answers.
export function renderMarkdown(src: string): string {
  if (!src) return ''
  const html = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(html)
}

// Inline-only render (bold/italic/code/links, no block <p> wrapper) — for short
// one-line excerpts shown inside other elements, e.g. search snippets.
export function renderMarkdownInline(src: string): string {
  if (!src) return ''
  const html = marked.parseInline(src, { async: false }) as string
  return DOMPurify.sanitize(html)
}
