<!--
  Renders already-sanitized HTML inside a Shadow DOM so its styling is fully
  isolated: any <style> the LLM emits is scoped to this shadow root (it styles
  the answer) and cannot leak into the surrounding app, while app styles don't
  bleed in either. The base stylesheet below mirrors the light-DOM `.md` rules so
  answers look the same; CSS custom properties (var(--…)) inherit across the
  shadow boundary, so the app theme still applies. `html` MUST be pre-sanitized
  (see utils/markdown.ts) — scripts never execute via innerHTML regardless.
-->
<template>
  <div ref="host"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

// `bare`: inject `html` as-is (a self-contained document that carries its own
// <style>, e.g. the chat-provenance log) instead of wrapping it in the `.md`
// answer shell. Isolation is identical — only the shell differs.
const props = defineProps<{ html: string; streaming?: boolean; bare?: boolean }>()
const host = ref<HTMLElement | null>(null)
let root: ShadowRoot | null = null

const BASE = `
  :host { display: block; }
  .md { white-space: normal; font: inherit; color: inherit; }
  .md > :last-child { margin-bottom: 0; }
  .md p { margin: 0 0 8px; }
  .md ul, .md ol { margin: 0 0 8px; padding-left: 20px; }
  .md h1, .md h2, .md h3 { font-size: 14px; margin: 8px 0 4px; }
  .md code { background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px; font-family: var(--font-sans); font-size: 12px; }
  .md pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 8px; overflow: auto; margin: 0 0 8px; }
  .md pre code { background: none; padding: 0; color: inherit; }
  .md a { color: var(--primary); }
  .md img { max-width: 100%; }
  .md table { border-collapse: collapse; margin: 0 0 8px; }
  .md th, .md td { border: 1px solid var(--border); padding: 4px 8px; }
  .md .thinking { color: var(--muted); font-style: italic; margin: 0; }
  .md.streaming > :last-child::after {
    content: ''; display: inline-block; width: 0.55em; height: 1.05em;
    margin-left: 2px; vertical-align: text-bottom; background: currentColor;
    border-radius: 1px; animation: caret-blink 1s steps(1, end) infinite;
  }
  @keyframes caret-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
`

function render() {
  const el = host.value
  if (!el) return
  if (!root) root = el.attachShadow({ mode: 'open' })
  // innerHTML never runs <script>; the shadow root scopes any <style> the html
  // carries so it cannot leak into (or be leaked into by) the app.
  if (props.bare) {
    root.innerHTML = props.html || ''
    return
  }
  const cls = props.streaming ? 'md streaming' : 'md'
  root.innerHTML = `<style>${BASE}</style><div class="${cls}">${props.html || ''}</div>`
}

onMounted(render)
watch(() => [props.html, props.streaming], render)
</script>
