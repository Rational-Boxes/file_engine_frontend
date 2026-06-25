<template>
  <div class="chat-view">
    <AppNav />
    <main class="content">
      <div class="messages">
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="bubble">
            <!-- Assistant answers may contain Markdown — render to sanitized HTML.
                 User messages stay plain text (escaped by interpolation). -->
            <div v-if="m.role === 'assistant'" class="text md" v-html="assistantHtml(m)"></div>
            <p v-else class="text">{{ m.content }}</p>
            <div v-if="m.citations && m.citations.length" class="cites">
              <button
                v-for="c in m.citations"
                :key="c.fileUid"
                type="button"
                class="cite"
                :title="names[c.fileUid] || ''"
                @click="preview.open(c.fileUid)"
              >
                {{ citeLabel(c) }}
              </button>
            </div>
          </div>
        </div>
        <p v-if="!messages.length" class="muted">Ask a question about your documents.</p>
      </div>

      <p v-if="error" class="err">{{ error }}</p>

      <form class="composer" @submit.prevent="send">
        <input
          v-model="input"
          class="composer-input"
          placeholder="Message…"
          aria-label="Message"
          :disabled="busy"
        />
        <button class="btn" type="submit" :disabled="!input.trim() || busy">Send</button>
      </form>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import AppNav from '@/components/AppNav.vue'
import { ChatSession } from '@/services/chatService'
import { usePreviewStore } from '@/stores/preview'
import { useFileNames } from '@/composables/useFileNames'
import { renderMarkdown } from '@/utils/markdown'
import type { Citation } from '@/types'

const preview = usePreviewStore()

// Citation chips show resolved file names instead of raw UUIDs.
const { names, resolve: resolveNames } = useFileNames()

// Chip label: the [n] marker, plus the resolved file name once available (never
// the raw UUID).
function citeLabel(c: Citation): string {
  const name = names.value[c.fileUid]
  return name ? `[${c.marker}] ${name}` : `[${c.marker}]`
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

const messages = ref<Msg[]>([])
const input = ref('')
const busy = ref(false)
const error = ref('')
let session: ChatSession | null = null
let current = -1 // index of the in-flight assistant message

onMounted(() => {
  session = new ChatSession({
    onToken: (t) => {
      if (current >= 0) messages.value[current].content += t
    },
    onCitations: (c) => {
      if (current >= 0) messages.value[current].citations = c
      resolveNames(c.map((x) => x.fileUid))
    },
    onDone: () => {
      busy.value = false
      current = -1
    },
    onError: (e) => {
      error.value = e
      busy.value = false
      current = -1
    },
  })
})

onBeforeUnmount(() => session?.close())

function send() {
  const text = input.value.trim()
  if (!text || busy.value || !session) return
  // History is the prior turns (before this message).
  const history = messages.value.map((m) => ({ role: m.role, content: m.content }))
  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '' })
  current = messages.value.length - 1
  busy.value = true
  error.value = ''
  session.send(text, { history })
  input.value = ''
}

// Render an assistant answer to sanitized HTML. Reasoning models (e.g.
// deepseek-r1) emit <think>…</think> before the answer — keep it out of the
// bubble; show a placeholder while only the hidden reasoning has streamed in.
function assistantHtml(m: Msg): string {
  const stripped = m.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!stripped) {
    return m.content.includes('<think>') ? '<p class="thinking">…thinking…</p>' : ''
  }
  return renderMarkdown(stripped)
}
</script>

<style scoped>
.content {
  max-width: 820px;
  margin: 0 auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px);
}

.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
}

.msg {
  display: flex;
}

.msg.user {
  justify-content: flex-end;
}

.bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--border);
  font-size: 14px;
}

.msg.user .bubble {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.text {
  margin: 0;
  white-space: pre-wrap;
}

/* Rendered Markdown (assistant answers). v-html content is outside the scoped
   styles, so reach it with :deep(). */
.md {
  white-space: normal;
}
.md :deep(p) {
  margin: 0 0 8px;
}
.md :deep(> :last-child) {
  margin-bottom: 0;
}
.md :deep(ul),
.md :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3) {
  font-size: 14px;
  margin: 8px 0 4px;
}
.md :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.md :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px 12px;
  border-radius: 8px;
  overflow: auto;
  margin: 0 0 8px;
}
.md :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}
.md :deep(a) {
  color: var(--primary);
}
.md :deep(table) {
  border-collapse: collapse;
  margin: 0 0 8px;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 8px;
}
.md :deep(.thinking) {
  color: var(--muted);
  font-style: italic;
  margin: 0;
}

.cites {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.cite {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border: none;
  border-radius: 999px;
  background: var(--bg);
  color: var(--muted);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
}

.cite:hover {
  color: var(--primary);
}

.muted {
  color: var(--muted);
  font-size: 13px;
  margin: auto;
}

.err {
  color: var(--danger);
  font-size: 13px;
}

.composer {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.composer-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
}

.btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 14px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
