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

<template>
  <div class="ce">
    <div class="ce-toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" title="Bold (Ctrl+B)" @click="wrap('**', '**')"><b>B</b></button>
      <button type="button" title="Italic (Ctrl+I)" @click="wrap('*', '*')"><i>I</i></button>
      <button type="button" title="Inline code" @click="wrap('`', '`')">&lt;/&gt;</button>
      <button type="button" title="Code block" @click="wrap('\n```\n', '\n```\n')">{ }</button>
      <button type="button" title="Bulleted list" @click="linePrefix('- ')">• List</button>
      <button type="button" title="Numbered list" @click="linePrefix('1. ')">1. List</button>
      <button type="button" title="Quote" @click="linePrefix('> ')">❝</button>
      <button type="button" title="Link" @click="insertLink()">🔗</button>
    </div>
    <div class="ce-area-wrap">
      <!-- Stop key/clipboard events from bubbling to document/window. PDF.js's
           annotation-editor UIManager installs GLOBAL keydown + copy/cut/paste
           listeners whose Backspace/Delete/Cut handler only exempts
           <input type=text|number> — NOT a <textarea> — so without this, editing a
           comment while a PDF markup is selected deletes the markup and eats the
           keystroke (the editor is always-on for writers). Native editing is the
           default action, unaffected by stopPropagation. -->
      <textarea
        ref="area"
        class="ce-area"
        :value="modelValue"
        :placeholder="placeholder"
        :maxlength="maxChars"
        rows="3"
        @input="onInput"
        @keydown.stop="onKeydown"
        @keyup.stop
        @copy.stop
        @cut.stop
        @paste.stop
        @blur="hideMentions"
      ></textarea>
      <ul v-if="mentions.length" class="ce-mentions">
        <li v-for="u in mentions" :key="u.user" @mousedown.prevent="pickMention(u)">
          <strong>{{ u.user }}</strong><span v-if="u.email && u.email !== u.user">· {{ u.email }}</span>
        </li>
      </ul>
    </div>
    <div class="ce-foot">
      <span class="ce-count" :class="{ over: modelValue.length > maxChars }">
        {{ modelValue.length }}/{{ maxChars }}
      </span>
      <button v-if="!hideSubmit" class="ce-submit" type="button" :disabled="!canSubmit" @click="submit">
        {{ submitLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// Lightweight Markdown editor (§10c decision): a textarea + toolbar that inserts
// Markdown syntax and serializes to Markdown — no heavyweight WYSIWYG. Rendering
// (read view / preview) uses the SPA's shared marked + dompurify pipeline.
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    submitLabel?: string
    maxChars?: number
    hideSubmit?: boolean
    // @mention autocomplete: q → users who can access the file (§5.1). Optional.
    mentionSource?: (q: string) => Promise<{ user: string; email: string }[]>
  }>(),
  { placeholder: 'Write a comment…', submitLabel: 'Comment', maxChars: 10000 },
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'submit'): void
}>()

const area = ref<HTMLTextAreaElement | null>(null)

const canSubmit = computed(() => props.modelValue.trim().length > 0 && props.modelValue.length <= props.maxChars)

// --- @mention autocomplete ---
const mentions = ref<{ user: string; email: string }[]>([])
const mentionStart = ref(0)

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  detectMention()
}

function hideMentions() {
  mentions.value = []
}

function detectMention() {
  const el = area.value
  if (!el || !props.mentionSource) return hideMentions()
  const pos = el.selectionStart ?? 0
  const before = props.modelValue.slice(0, pos)
  const m = before.match(/@([\w.@-]*)$/) // an @token ending at the cursor
  if (!m) return hideMentions()
  mentionStart.value = pos - m[0].length
  const q = m[1]
  if (q.length < 1) return hideMentions()
  props.mentionSource(q)
    .then((list) => {
      mentions.value = list.slice(0, 8)
    })
    .catch(() => hideMentions())
}

function pickMention(u: { user: string; email: string }) {
  const el = area.value
  const pos = el?.selectionStart ?? props.modelValue.length
  const handle = u.email || u.user
  const next =
    props.modelValue.slice(0, mentionStart.value) + '@' + handle + ' ' + props.modelValue.slice(pos)
  const cursor = mentionStart.value + handle.length + 2
  emit('update:modelValue', next)
  hideMentions()
  requestAnimationFrame(() => {
    el?.focus()
    el?.setSelectionRange(cursor, cursor)
  })
}

function set(value: string, cursor: number) {
  emit('update:modelValue', value)
  requestAnimationFrame(() => {
    const el = area.value
    if (el) {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    }
  })
}

function selection(): { start: number; end: number } {
  const el = area.value
  if (!el) return { start: props.modelValue.length, end: props.modelValue.length }
  return { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
}

// Wrap the current selection with before/after markers (or insert an empty pair).
function wrap(before: string, after: string) {
  const v = props.modelValue
  const { start, end } = selection()
  const mid = v.slice(start, end)
  const next = v.slice(0, start) + before + mid + after + v.slice(end)
  set(next, start + before.length + mid.length)
}

// Prefix each selected line (or the current line) with a marker.
function linePrefix(prefix: string) {
  const v = props.modelValue
  const { start, end } = selection()
  const lineStart = v.lastIndexOf('\n', start - 1) + 1
  const segment = v.slice(lineStart, end)
  const prefixed = segment
    .split('\n')
    .map((l) => prefix + l)
    .join('\n')
  const next = v.slice(0, lineStart) + prefixed + v.slice(end)
  set(next, lineStart + prefixed.length)
}

function insertLink() {
  const v = props.modelValue
  const { start, end } = selection()
  const text = v.slice(start, end) || 'text'
  const snippet = `[${text}](https://)`
  const next = v.slice(0, start) + snippet + v.slice(end)
  // place cursor inside the url parens
  set(next, start + snippet.length - 1)
}

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase()
    if (k === 'b') {
      e.preventDefault()
      wrap('**', '**')
    } else if (k === 'i') {
      e.preventDefault()
      wrap('*', '*')
    } else if (k === 'enter' && canSubmit.value) {
      e.preventDefault()
      submit()
    }
  }
}

function submit() {
  if (canSubmit.value) emit('submit')
}
</script>

<style scoped>
.ce {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
}
.ce-toolbar {
  display: flex;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.ce-toolbar button {
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 2px 7px;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--fg);
}
.ce-toolbar button:hover {
  background: var(--bg);
}
.ce-area-wrap {
  position: relative;
}
.ce-area {
  width: 100%;
  border: none;
  outline: none;
  resize: vertical;
  padding: 8px;
  font: inherit;
  background: transparent;
  color: var(--fg);
}
.ce-mentions {
  position: absolute;
  left: 8px;
  bottom: 4px;
  z-index: 30;
  list-style: none;
  margin: 0;
  padding: 4px;
  min-width: 200px;
  max-height: 180px;
  overflow: auto;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}
.ce-mentions li {
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.85rem;
  display: flex;
  gap: 6px;
}
.ce-mentions li:hover {
  background: var(--bg);
}
.ce-mentions span {
  color: var(--muted);
}
.ce-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
}
.ce-count {
  font-size: 0.72rem;
  color: var(--muted);
}
.ce-count.over {
  color: var(--danger);
}
.ce-submit {
  border: 1px solid var(--primary);
  background: var(--primary);
  color: #fff;
  border-radius: 8px;
  padding: 5px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
/* Stay visibly a button when empty (outlined), rather than fading away. */
.ce-submit:disabled {
  background: transparent;
  color: var(--primary);
  cursor: default;
}
</style>
