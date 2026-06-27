<template>
  <div class="chat-view">
    <AppNav />
    <div class="layout">
      <!-- Chat history: the user's persisted conversations (resume / delete). -->
      <aside class="history">
        <button class="new-chat" type="button" @click="newChat" :disabled="!currentConversationId && !messages.length">
          + New chat
        </button>
        <ul class="conv-list">
          <li
            v-for="c in conversations"
            :key="c.id"
            class="conv"
            :class="{ active: c.id === currentConversationId }"
          >
            <button type="button" class="conv-open" :title="c.title" @click="selectConversation(c.id)">
              {{ c.title }}
            </button>
            <button
              type="button"
              class="conv-del"
              aria-label="Delete chat"
              title="Delete chat"
              @click.stop="removeConversation(c.id)"
            >
              ×
            </button>
          </li>
        </ul>
        <p v-if="!conversations.length" class="hist-empty">No saved chats yet.</p>
      </aside>

      <main class="content">
      <div ref="messagesEl" class="messages" @scroll="onScroll">
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="bubble" :aria-busy="m.streaming || undefined">
            <!-- Assistant answers may contain Markdown — render to sanitized HTML.
                 User messages stay plain text (escaped by interpolation). The
                 `streaming` class appends a blinking caret after the last line
                 while tokens are still arriving (a "working" indication). -->
            <div
              v-if="m.role === 'assistant'"
              class="text md"
              :class="{ streaming: m.streaming }"
              v-html="assistantHtml(m)"
            ></div>
            <p v-else class="text">{{ m.content }}</p>
            <!-- Before the first token there's no text to trail, so show a
                 standalone blinking caret as the working indication. -->
            <span v-if="pendingCaret(m)" class="caret" aria-label="Working…"></span>
            <div v-if="m.searching" class="searching">🔎 Searching the web…</div>
            <div v-if="m.citations && m.citations.length" class="cites">
              <template v-for="(c, ci) in m.citations" :key="ci">
                <a
                  v-if="c.kind === 'web'"
                  class="cite cite-web"
                  :href="c.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :title="c.title || c.url"
                >
                  {{ webLabel(c) }}
                </a>
                <button
                  v-else
                  type="button"
                  class="cite"
                  :title="names[c.fileUid || ''] || ''"
                  @click="c.fileUid && preview.open(c.fileUid)"
                >
                  {{ citeLabel(c) }}
                </button>
              </template>
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
        <label
          class="web-toggle"
          title="Let the assistant search the web when your documents don't have the answer"
        >
          <input type="checkbox" v-model="webSearch" :disabled="busy" aria-label="Web search" />
          <span>Web</span>
        </label>
        <button class="btn" type="submit" :disabled="!input.trim() || busy">Send</button>
      </form>
      </main>
    </div>
  </div>
</template>

<script lang="ts">
// Named so <KeepAlive include> can cache it (chat history persists across tabs).
export default { name: 'ChatView' }
</script>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import AppNav from '@/components/AppNav.vue'
import { ChatSession, type ChatSendOptions } from '@/services/chatService'
import { conversationService } from '@/services/conversationService'
import { usePreviewStore } from '@/stores/preview'
import { useFileNames } from '@/composables/useFileNames'
import { renderMarkdown } from '@/utils/markdown'
import type { Citation, ConversationSummary } from '@/types'

const preview = usePreviewStore()

// Citation chips show resolved file names instead of raw UUIDs.
const { names, resolve: resolveNames } = useFileNames()

// Chip label: the [n] marker, plus the resolved file name once available (never
// the raw UUID).
function citeLabel(c: Citation): string {
  const name = c.fileUid ? names.value[c.fileUid] : ''
  return name ? `[${c.marker}] ${name}` : `[${c.marker}]`
}

// Web citation label: the [n] marker plus the result's host (or title).
function webLabel(c: Citation): string {
  let host = c.title || c.url || ''
  try {
    if (c.url) host = new URL(c.url).hostname
  } catch {
    /* keep title/url */
  }
  return `[${c.marker}] ${host}`
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  searching?: boolean
  streaming?: boolean // tokens still arriving — drives the working caret
}

// Strip hidden reasoning (<think>…</think>) and return the visible answer text.
function visibleText(m: Msg): string {
  return m.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

// A standalone blinking caret is the working indication only while the turn is
// in flight and nothing visible has streamed in yet (no answer text, no hidden
// reasoning placeholder). Once text appears, the trailing `.md.streaming` caret
// takes over instead.
function pendingCaret(m: Msg): boolean {
  return !!m.streaming && !visibleText(m) && !m.content.includes('<think>')
}

const messages = ref<Msg[]>([])
const input = ref('')
const busy = ref(false)
const webSearch = ref(false)
const error = ref('')

// Chat history pane: the user's saved conversations + the one we're viewing.
const conversations = ref<ConversationSummary[]>([])
const currentConversationId = ref<string | null>(null)

let session: ChatSession | null = null
let current = -1 // index of the in-flight assistant message

// Auto-scroll: follow the conversation to the bottom as text streams in, but
// only while the user is already pinned near the bottom — if they've scrolled up
// to read earlier messages, don't yank them back down.
const messagesEl = ref<HTMLElement | null>(null)
const stick = ref(true)
const STICK_THRESHOLD = 80 // px from the bottom still counts as "at the bottom"

function onScroll() {
  const el = messagesEl.value
  if (el) stick.value = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD
}

function scrollToBottom() {
  const el = messagesEl.value
  if (el && stick.value) el.scrollTop = el.scrollHeight
}

// Re-pin to the bottom after the next DOM update (a new/extended message).
watch(messages, () => void nextTick(scrollToBottom), { deep: true })

onMounted(() => {
  void refreshConversations()
  session = new ChatSession({
    onToken: (t) => {
      if (current >= 0) messages.value[current].content += t
    },
    onCitations: (c) => {
      if (current >= 0) messages.value[current].citations = c
      resolveNames(c.filter((x) => x.kind !== 'web' && x.fileUid).map((x) => x.fileUid as string))
    },
    onToolCall: () => {
      if (current >= 0) messages.value[current].searching = true
    },
    onToolResult: () => {
      if (current >= 0) messages.value[current].searching = false
    },
    // Adopt the server-assigned conversation so this chat resumes after reload,
    // and refresh the list so a brand-new chat shows up (and reorders) in the pane.
    onConversation: (id) => {
      if (currentConversationId.value !== id) {
        currentConversationId.value = id
        void refreshConversations()
      }
    },
    onDone: () => {
      if (current >= 0) {
        messages.value[current].searching = false
        messages.value[current].streaming = false
      }
      busy.value = false
      current = -1
      // Title is derived from the first message server-side — reflect it.
      void refreshConversations()
    },
    onError: (e) => {
      error.value = e
      if (current >= 0) {
        messages.value[current].searching = false
        messages.value[current].streaming = false
      }
      busy.value = false
      current = -1
    },
  })
})

onBeforeUnmount(() => session?.close())

async function refreshConversations() {
  try {
    conversations.value = await conversationService.list()
  } catch {
    /* history is best-effort — chat still works without the pane */
  }
}

// Resume a saved chat: load its messages into the transcript.
async function selectConversation(id: string) {
  if (busy.value || id === currentConversationId.value) return
  try {
    const convo = await conversationService.get(id)
    messages.value = convo.messages.map((m) => ({
      role: m.role,
      content: m.content,
      citations: m.citations,
    }))
    currentConversationId.value = id
    error.value = ''
    stick.value = true // jump to the latest message of the resumed chat
    resolveNames(
      convo.messages
        .flatMap((m) => m.citations)
        .filter((c) => c.kind !== 'web' && c.fileUid)
        .map((c) => c.fileUid as string),
    )
  } catch {
    error.value = 'Could not load that conversation.'
  }
}

// Start a fresh chat (a new conversation is created server-side on first send).
function newChat() {
  if (busy.value) return
  messages.value = []
  currentConversationId.value = null
  error.value = ''
}

async function removeConversation(id: string) {
  await conversationService.remove(id)
  if (id === currentConversationId.value) newChat()
  await refreshConversations()
}

function send() {
  const text = input.value.trim()
  if (!text || busy.value || !session) return
  // History is the prior turns (before this message).
  const history = messages.value.map((m) => ({ role: m.role, content: m.content }))
  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '', streaming: true })
  current = messages.value.length - 1
  stick.value = true // sending a message should follow the reply down
  busy.value = true
  error.value = ''
  const opts: ChatSendOptions = { history }
  if (webSearch.value) opts.webSearch = true
  if (currentConversationId.value) opts.conversationId = currentConversationId.value
  session.send(text, opts)
  input.value = ''
}

// Render an assistant answer to sanitized HTML. Reasoning models (e.g.
// deepseek-r1) emit <think>…</think> before the answer — keep it out of the
// bubble; show a placeholder while only the hidden reasoning has streamed in.
function assistantHtml(m: Msg): string {
  const stripped = visibleText(m)
  if (!stripped) {
    return m.content.includes('<think>') ? '<p class="thinking">…thinking…</p>' : ''
  }
  return renderMarkdown(stripped)
}
</script>

<style scoped>
.layout {
  display: flex;
  height: calc(100vh - 56px);
}

/* Left history pane — saved conversations. */
.history {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 8px;
  overflow-y: auto;
  background: var(--bg);
}

.new-chat {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.new-chat:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.new-chat:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.conv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conv {
  display: flex;
  align-items: center;
  border-radius: 8px;
}

.conv.active {
  background: rgba(0, 0, 0, 0.06);
}

.conv-open {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: none;
  border: none;
  padding: 7px 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-open:hover {
  color: var(--primary);
}

.conv-del {
  border: none;
  background: none;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 6px;
  visibility: hidden;
}

.conv:hover .conv-del,
.conv.active .conv-del {
  visibility: visible;
}

.conv-del:hover {
  color: var(--danger);
}

.hist-empty {
  color: var(--muted);
  font-size: 12px;
  padding: 4px 8px;
  margin: 0;
}

.content {
  flex: 1;
  max-width: 820px;
  margin: 0 auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
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

/* Web citations are external links — tinted + underlined to distinguish them
   from document citations (which open the in-app preview). */
.cite-web {
  background: #fff7ed;
  color: #b45309;
  text-decoration: underline;
}

.cite-web:hover {
  color: #92400e;
}

/* Working indication: a blinking caret while the answer streams in. The
   trailing form attaches to the end of the last rendered line; the standalone
   form (.caret) shows before any text has arrived. */
.caret {
  display: inline-block;
  width: 0.55em;
  height: 1.05em;
  vertical-align: text-bottom;
  background: var(--primary);
  border-radius: 1px;
  animation: caret-blink 1s steps(1, end) infinite;
}

.md.streaming :deep(> :last-child)::after {
  content: '';
  display: inline-block;
  width: 0.55em;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: currentColor;
  border-radius: 1px;
  animation: caret-blink 1s steps(1, end) infinite;
}

@keyframes caret-blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.searching {
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  margin-top: 4px;
}

.web-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
  user-select: none;
  cursor: pointer;
  white-space: nowrap;
}

.web-toggle input {
  margin: 0;
  cursor: pointer;
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
