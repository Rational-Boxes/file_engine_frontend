<template>
  <div class="chat-view">
    <AppNav />
    <main class="content">
      <div class="messages">
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="bubble">
            <p class="text">{{ display(m) }}</p>
            <div v-if="m.citations && m.citations.length" class="cites">
              <span v-for="c in m.citations" :key="c.fileUid" class="cite" :title="c.fileUid">
                [{{ c.marker }}] {{ c.fileUid }}
              </span>
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
import type { Citation } from '@/types'

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

// Reasoning models (e.g. deepseek-r1) emit <think>…</think> before the answer —
// keep it out of the displayed bubble.
function display(m: Msg): string {
  if (m.role !== 'assistant') return m.content
  const stripped = m.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!stripped && m.content.includes('<think>')) return '…thinking…'
  return stripped || m.content
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

.cites {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.cite {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--muted);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
