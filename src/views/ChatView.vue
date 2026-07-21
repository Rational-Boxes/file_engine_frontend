<template>
  <div class="chat-view">
    <AppNav />
    <div class="layout">
      <!-- Chat history: the user's persisted conversations (resume / delete). -->
      <aside class="history">
        <div class="hist-head">
          <button class="new-chat" type="button" @click="newChat" :disabled="!currentConversationId && !messages.length">
            + New chat
          </button>
          <HelpIcon topic="ai-research" label="About the AI research chat" />
        </div>
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
            <!-- Isolated in a shadow root so the LLM can style its own HTML
                 (<style> is scoped there) without leaking into the app. -->
            <ShadowHtml
              v-if="m.role === 'assistant'"
              class="text"
              :html="assistantHtml(m)"
              :streaming="!!m.streaming"
            />
            <p v-else class="text">{{ m.content }}</p>
            <!-- User "Generate report" turn: show the pinned destination. -->
            <div v-if="m.reportDest" class="report-dest">📄 → <code>{{ m.reportDest }}</code></div>
            <!-- Before the first token there's no text to trail, so show a
                 standalone blinking caret as the working indication. -->
            <span v-if="pendingCaret(m)" class="caret" aria-label="Working…"></span>
            <div v-if="m.searching" class="searching">🔎 Searching the web…</div>
            <div v-if="m.writingReport" class="searching">📝 Writing report…</div>
            <!-- Saved report → open it in the preview modal (after the turn is done). -->
            <button
              v-if="m.report && !m.streaming"
              type="button"
              class="open-report"
              @click="openReport(m)"
            >📄 Open report</button>
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

      <!-- MCP tool consent prompt: the assistant wants to run an external tool and
           must have the user's explicit approval first (MCP_INTEGRATIONS §6). -->
      <div v-if="pendingConsent" class="consent" role="alertdialog" aria-label="Tool approval">
        <div class="consent-body">
          <p class="consent-title">
            Allow <strong>{{ pendingConsent.integration }}</strong> to run
            <code>{{ pendingConsent.tool }}</code>?
          </p>
          <p class="consent-args">{{ pendingConsent.argsSummary }}</p>
          <label class="consent-remember">
            <input type="checkbox" v-model="consentRemember" />
            Don't ask again for this tool in this conversation
          </label>
        </div>
        <div class="consent-actions">
          <button class="btn ghost" @click="decideConsent(false)">Deny</button>
          <button class="btn" @click="decideConsent(true)">Approve</button>
        </div>
      </div>

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

      <!-- Right-side tools: chat-wide operations (web search, generate report) live
           here so the composer below the chat is reserved for the user's input. -->
      <aside class="toolbar">
        <h2 class="tb-head">Tools</h2>

        <label
          class="tb-toggle"
          title="Let the assistant search the web when your documents don't have the answer"
        >
          <input type="checkbox" v-model="webSearch" :disabled="busy" aria-label="Web search" />
          <span>Web search</span>
        </label>
        <p class="tb-hint">Let the assistant search the web when your documents don't have the answer.</p>

        <button
          class="tb-action"
          type="button"
          :disabled="busy || !messages.length"
          title="Generate a report of this conversation and save it to a folder you choose"
          @click="openReportDialog"
        >📄 Generate report</button>
        <p class="tb-hint">Summarize this conversation into a document saved to a folder you choose.</p>
      </aside>
    </div>

    <ReportTargetDialog :open="reportDialogOpen" @select="onReportTarget" @cancel="reportDialogOpen = false" />
  </div>
</template>

<script lang="ts">
// Named so <KeepAlive include> can cache it (chat history persists across tabs).
export default { name: 'ChatView' }
</script>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import AppNav from '@/components/AppNav.vue'
import HelpIcon from '@/components/HelpIcon.vue'
import { ChatSession, type ChatSendOptions, type ConsentRequest } from '@/services/chatService'
import { conversationService } from '@/services/conversationService'
import { usePreviewStore } from '@/stores/preview'
import { useFileNames } from '@/composables/useFileNames'
import { renderMarkdown } from '@/utils/markdown'
import ShadowHtml from '@/components/ShadowHtml.vue'
import ReportTargetDialog from '@/components/ReportTargetDialog.vue'
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
  writingReport?: boolean // report-mode turn in flight (shows "Writing report…")
  reportDest?: string // user turn: the pinned destination, shown as a badge
  report?: { uid: string; name: string; path: string } // saved report → "Open report" link
}

// Strip hidden reasoning (<think>…</think>) and the report-save marker delimiters
// (the body streams into the bubble but the raw [[SAVE_REPORT …]] wrappers should
// not show — the marked body is diverted to a file server-side).
function visibleText(m: Msg): string {
  return m.content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\[\[\s*SAVE_REPORT\b[^\]]*?\]\]/gi, '')
    .replace(/\[\[\s*\/\s*SAVE_REPORT\s*\]\]/gi, '')
    .trim()
}

// Reconstruct a saved report's { uid, name, path } from an assistant message's
// persisted confirmation ("✅ Saved the report to /Dir/name.html (file <uid>)"),
// so a resumed chat still shows the "Open report" preview link (the live
// report_saved event isn't replayed on reload). The path may contain spaces, so
// capture non-greedily up to " (file <uid>)".
function reportFromContent(content: string): Msg['report'] {
  const m = /Saved the report to (.+?) \(file ([0-9a-fA-F-]+)\)/.exec(content || '')
  if (!m) return undefined
  const path = m[1]
  return { uid: m[2], name: path.split('/').pop() || path, path }
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
// An MCP tool is awaiting the user's approve/deny (MCP_INTEGRATIONS §6). The server
// pauses the turn until we reply; a timeout there defaults to deny.
const pendingConsent = ref<ConsentRequest | null>(null)
const consentRemember = ref(false)
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
    onConsentRequest: (req) => {
      consentRemember.value = false
      pendingConsent.value = req
    },
    // A "Generate report" save landed — stash it so the "Open report" link (into
    // the preview modal) appears on this turn once it's done.
    onReportSaved: (r) => {
      if (current >= 0) {
        messages.value[current].report = r
        messages.value[current].writingReport = false
      }
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
        messages.value[current].writingReport = false
      }
      pendingConsent.value = null
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
      pendingConsent.value = null
      busy.value = false
      current = -1
    },
  })
})

// Answer the pending MCP tool-consent prompt and resume the turn.
function decideConsent(approve: boolean) {
  const req = pendingConsent.value
  if (!req || !session) return
  session.sendConsent(req.id, approve, consentRemember.value)
  pendingConsent.value = null
}

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
      // Rebuild the "Open report" preview link for a resumed chat from the saved
      // confirmation text (the live turn's report_saved event is gone after reload).
      report: m.role === 'assistant' ? reportFromContent(m.content) : undefined,
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
  // Always send the checkbox state (true OR false) so the user's choice is
  // authoritative — omitting it lets the server fall back to its web_search_default
  // (which may be on), so the model would search even with the box unchecked.
  const opts: ChatSendOptions = { history, webSearch: webSearch.value }
  if (currentConversationId.value) opts.conversationId = currentConversationId.value
  session.send(text, opts)
  input.value = ''
}

// --- Generate report -------------------------------------------------------
const reportDialogOpen = ref(false)

function openReportDialog() {
  if (busy.value) return
  reportDialogOpen.value = true
}

// The user picked a destination. Command a report of this conversation, pinning
// the exact target — the destination is NOT put in the message (the model never
// chooses it); it rides in reportTarget. See GENERATE_REPORT_TO_TARGET.
function onReportTarget(target: { folderUid: string; folderPath: string; filename: string }) {
  reportDialogOpen.value = false
  if (busy.value || !session) return
  const history = messages.value.map((m) => ({ role: m.role, content: m.content }))
  const name = /\.html?$/i.test(target.filename) ? target.filename : target.filename + '.html'
  const dest = (target.folderPath === '/' ? '' : target.folderPath) + '/' + name
  messages.value.push({ role: 'user', content: 'Generate a report of our conversation.', reportDest: dest })
  messages.value.push({ role: 'assistant', content: '', streaming: true, writingReport: true })
  current = messages.value.length - 1
  stick.value = true
  busy.value = true
  error.value = ''
  const opts: ChatSendOptions = { history, reportTarget: target }
  if (currentConversationId.value) opts.conversationId = currentConversationId.value
  session.send('Generate a report of our conversation.', opts)
}

function openReport(m: Msg) {
  if (m.report) preview.open(m.report.uid, m.report.name)
}

// Render an assistant answer to sanitized HTML. Reasoning models (e.g.
// deepseek-r1) emit <think>…</think> before the answer — keep it out of the
// bubble; show a placeholder while only the hidden reasoning has streamed in.
function assistantHtml(m: Msg): string {
  const stripped = visibleText(m)
  if (!stripped) {
    return m.content.includes('<think>') ? '<p class="thinking">…thinking…</p>' : ''
  }
  // allowStyle: the answer renders inside ShadowHtml, so a <style> the LLM emits
  // is scoped to that shadow root (styles the answer, never the app).
  return renderMarkdown(stripped, { allowStyle: true })
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

.hist-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.new-chat {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
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
  background: var(--card);
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
  font-family: var(--font-sans);
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

/* Right-side tools column — chat-wide operations, mirroring the history pane. */
.toolbar {
  width: 200px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 14px;
  overflow-y: auto;
  background: var(--bg);
}
.tb-head {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 0 0 2px;
}
.tb-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text);
  user-select: none;
  cursor: pointer;
}
.tb-toggle input {
  margin: 0;
  cursor: pointer;
}
.tb-action {
  text-align: left;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  color: var(--fg);
  font-size: 14px;
  cursor: pointer;
}
.tb-action:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}
.tb-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.tb-hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 6px;
  line-height: 1.4;
}

/* On narrow screens keep the tools column but make it compact (icon-ish, no
   descriptive hints) so the messages + composer keep their room. */
@media (max-width: 900px) {
  .toolbar {
    width: 128px;
    padding: 14px 10px;
  }
  .tb-hint {
    display: none;
  }
  .tb-toggle {
    font-size: 13px;
  }
  .tb-action {
    font-size: 13px;
    padding: 8px 9px;
  }
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

/* MCP tool-consent prompt (MCP_INTEGRATIONS §6). */
.consent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  border: 1px solid #d9b45f;
  background: #fff8e6;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 6px;
}
.consent-title {
  margin: 0 0 4px;
  font-size: 0.92rem;
}
.consent-title code,
.consent-args {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.consent-args {
  margin: 0 0 6px;
  font-size: 0.8rem;
  color: var(--muted);
  word-break: break-word;
}
.consent-remember {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--muted);
}
.consent-actions {
  display: flex;
  gap: 10px;
  flex: 0 0 auto;
}
.consent .btn.ghost {
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--border);
}
@media (prefers-color-scheme: dark) {
  .consent {
    background: #2a2412;
    border-color: #5c4a1e;
  }
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

.report-dest {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.report-dest code {
  background: var(--bg);
  padding: 1px 5px;
  border-radius: 4px;
}

.open-report {
  margin-top: 8px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
}
.open-report:hover {
  border-color: var(--primary);
}
</style>
