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
    <textarea
      ref="area"
      class="ce-area"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxChars"
      rows="3"
      @input="onInput"
      @keydown="onKeydown"
    ></textarea>
    <div class="ce-foot">
      <span class="ce-count" :class="{ over: modelValue.length > maxChars }">
        {{ modelValue.length }}/{{ maxChars }}
      </span>
      <button class="ce-submit" type="button" :disabled="!canSubmit" @click="submit">
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
  }>(),
  { placeholder: 'Write a comment…', submitLabel: 'Comment', maxChars: 10000 },
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'submit'): void
}>()

const area = ref<HTMLTextAreaElement | null>(null)

const canSubmit = computed(() => props.modelValue.trim().length > 0 && props.modelValue.length <= props.maxChars)

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
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
  background: #fff;
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
  border: 1px solid var(--border);
  background: var(--primary);
  color: #fff;
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 0.85rem;
  cursor: pointer;
}
.ce-submit:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
