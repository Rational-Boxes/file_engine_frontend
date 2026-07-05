import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Markdown rendering for UNTRUSTED content (LLM chat answers, indexed document
// excerpts). Always sanitize the generated HTML before it reaches v-html.
marked.use({ gfm: true, breaks: true })

// A <style> block injected into the light DOM via v-html applies to the WHOLE
// page, so untrusted content must not carry one there. Forbid document-level
// styling tags by default. Callers that render inside an isolated Shadow DOM
// (see ShadowHtml.vue) may pass { allowStyle: true } to let the LLM style its
// own output — the <style> stays scoped to the shadow root and cannot leak out.
const FORBID_STYLE = { FORBID_TAGS: ['style', 'link'] }

// Block-level render (paragraphs, lists, code blocks, …) — for chat answers.
//
// `breaks` defaults to true so a single newline becomes a <br> — right for chat,
// where users type soft line breaks. Callers rendering hard-wrapped prose (e.g.
// in-repo help articles wrapped at ~80 cols) should pass { breaks: false }, so a
// wrapped paragraph isn't peppered with spurious <br> at every wrap point.
export function renderMarkdown(src: string, opts?: { allowStyle?: boolean; breaks?: boolean }): string {
  if (!src) return ''
  const html = marked.parse(src, { async: false, breaks: opts?.breaks ?? true }) as string
  // ADD_TAGS keeps <style> explicitly (DOMPurify's default handling of it varies
  // by environment); scripts/handlers are still stripped. It's safe because the
  // caller renders this inside an isolated shadow root.
  return DOMPurify.sanitize(html, opts?.allowStyle ? { ADD_TAGS: ['style'] } : FORBID_STYLE)
}

// Inline-only render (bold/italic/code/links, no block <p> wrapper) — for short
// one-line excerpts shown inside other elements, e.g. search snippets.
export function renderMarkdownInline(src: string): string {
  if (!src) return ''
  const html = marked.parseInline(src, { async: false }) as string
  return DOMPurify.sanitize(html, FORBID_STYLE)
}
