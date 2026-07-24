<!--
  Copyright (C) 2026 James Hickman

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

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
// Fired when a rewritten file reference (an `<a data-file-uid>` produced by
// utils/fileRefs) is clicked inside the shadow root — the host turns it into an
// in-app file open. Harmless for HTML that carries no such anchors.
const emit = defineEmits<{ (e: 'fileRef', uid: string): void }>()
const host = ref<HTMLElement | null>(null)
let root: ShadowRoot | null = null

// Delegated click handler on the shadow root: intercept clicks on file-reference
// links (which would otherwise navigate to the placeholder `#` href) and surface
// the UID to the parent. A listener on the shadow root sees the real target (no
// retargeting), so `closest` finds the anchor directly.
function onShadowClick(e: Event) {
  const a = (e.target as HTMLElement | null)?.closest?.('a[data-file-uid]') as HTMLElement | null
  if (!a) return
  e.preventDefault()
  const uid = a.dataset.fileUid
  if (uid) emit('fileRef', uid)
}

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
  .md a.file-ref { cursor: pointer; text-decoration: none; border-bottom: 1px dotted currentColor; white-space: nowrap; }
  .md a.file-ref:hover { text-decoration: none; border-bottom-style: solid; }
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
  if (!root) {
    root = el.attachShadow({ mode: 'open' })
    // Attached once; event delegation means it survives every innerHTML re-render.
    root.addEventListener('click', onShadowClick)
  }
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
