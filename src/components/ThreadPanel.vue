<template>
  <!-- Collapsed: only a toggle with the comment count + attention flag (§10b-i). -->
  <button v-if="layout === 'collapsed'" class="tp-toggle" @click="setLayout(lastOpen)">
    💬 Comments ({{ totalComments }})
    <span v-if="flag" class="tp-flag" :title="flagTitle">{{ flagText }}</span>
  </button>

  <section v-else class="tp" :class="`tp-${layout}`">
    <header class="tp-head">
      <span class="tp-title">Comments ({{ totalComments }})</span>
      <span v-if="presence.length" class="tp-presence" :title="presence.join(', ')">
        👁 {{ presence.length }} here
      </span>
      <span class="tp-spacer"></span>
      <button class="tp-lbtn" :class="{ on: layout === 'right' }" title="Dock right" @click="setLayout('right')">▐</button>
      <button class="tp-lbtn" :class="{ on: layout === 'bottom' }" title="Dock bottom" @click="setLayout('bottom')">▄</button>
      <button class="tp-lbtn" title="Collapse" @click="setLayout('collapsed')">✕</button>
    </header>

    <div class="tp-body">
      <p v-if="error" class="tp-err">{{ error }}</p>
      <p v-else-if="loading" class="tp-muted">Loading…</p>
      <p v-else-if="!threads.length" class="tp-muted">No comments yet. Start the discussion.</p>

      <article
        v-for="t in threads"
        :key="t.id"
        class="thread"
        :class="{ resolved: t.status === 'resolved' }"
      >
        <div class="thread-head">
          <strong v-if="t.title">{{ t.title }}</strong>
          <span v-if="t.anchorStale" class="stale" title="Commented on an earlier revision">stale</span>
          <span v-if="t.status === 'resolved'" class="badge-res">resolved</span>
        </div>
        <div
          v-for="c in t.comments || []"
          :id="`comment-${c.id}`"
          :key="c.id"
          class="comment"
          :class="{ flash: flashing.has(c.id), mine: c.author === me }"
        >
          <div class="c-meta">
            <span class="c-author">{{ c.author }}</span>
            <time>{{ ago(c.createdAt) }}</time>
            <span v-if="c.editedAt" class="c-edited">edited</span>
            <button v-if="c.author === me && !c.deleted && !c.redacted" class="c-x" @click="del(c)">delete</button>
          </div>
          <div v-if="c.redacted" class="c-redacted">[redacted by an administrator]</div>
          <div v-else-if="c.deleted" class="c-redacted">[deleted]</div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-else class="c-body" v-html="render(c.body)"></div>
        </div>

        <div class="thread-foot">
          <CommentEditor
            v-model="replyDrafts[t.id]"
            placeholder="Reply…"
            submit-label="Reply"
            :max-chars="maxChars"
            @submit="reply(t)"
          />
          <button
            v-if="t.status === 'open'"
            class="tp-resolve"
            title="Mark resolved"
            @click="resolve(t)"
          >
            Resolve
          </button>
        </div>
      </article>

      <details class="new-thread" open>
        <summary>New thread</summary>
        <input v-model="newTitle" class="nt-title" placeholder="Title (optional)" />
        <CommentEditor
          v-model="newBody"
          placeholder="Start a new discussion…"
          submit-label="Post"
          :max-chars="maxChars"
          @submit="open"
        />
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { renderMarkdown } from '@/utils/markdown'
import {
  discussionService,
  type Thread,
  type Comment,
  type FlagCounts,
} from '@/services/discussionService'
import { LiveSession, type LiveCommentEvent } from '@/services/discussionLive'

const props = defineProps<{ fileUid: string; focusThread?: string; focusComment?: string }>()
const emit = defineEmits<{ (e: 'layout', l: 'collapsed' | 'right' | 'bottom'): void }>()

type Layout = 'collapsed' | 'right' | 'bottom'
const LAYOUT_KEY = 'fe.discuss.panelLayout'
const maxChars = 10000

const auth = useAuthStore()
const me = computed(() => auth.user)

const threads = ref<Thread[]>([])
const loading = ref(false)
const error = ref('')
const presence = ref<string[]>([])
const flag = ref<FlagCounts | null>(null)
const flashing = reactive(new Set<string>())
const newTitle = ref('')
const newBody = ref('')
const replyDrafts = reactive<Record<string, string>>({})

const layout = ref<Layout>(readLayout())
const lastOpen = ref<Layout>(layout.value === 'collapsed' ? 'right' : layout.value)

let session: LiveSession | null = null

const totalComments = computed(() =>
  threads.value.reduce((n, t) => n + (t.comments?.length || 0), 0),
)
const flagText = computed(() => {
  if (!flag.value) return ''
  const parts: string[] = []
  if (flag.value.mentions) parts.push(`@${flag.value.mentions}`)
  if (flag.value.reviews) parts.push(`review ${flag.value.reviews}`)
  return parts.join(' · ')
})
const flagTitle = computed(() =>
  flag.value
    ? `${flag.value.mentions} mention(s), ${flag.value.reviews} pending review(s)`
    : '',
)

function readLayout(): Layout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY)
    if (v === 'collapsed' || v === 'right' || v === 'bottom') return v
  } catch {
    /* ignore */
  }
  return 'right'
}
function setLayout(l: Layout) {
  layout.value = l
  if (l !== 'collapsed') lastOpen.value = l
  try {
    localStorage.setItem(LAYOUT_KEY, l)
  } catch {
    /* ignore */
  }
  emit('layout', l)
}

function render(md: string): string {
  return renderMarkdown(md)
}
function ago(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    threads.value = await discussionService.listThreads(props.fileUid)
    for (const t of threads.value) if (!(t.id in replyDrafts)) replyDrafts[t.id] = ''
    const flags = await discussionService
      .flags([props.fileUid])
      .catch(() => ({}) as Record<string, FlagCounts>)
    flag.value = flags[props.fileUid] ?? null
    focusDeepLink()
  } catch {
    error.value = 'Could not load comments.'
  } finally {
    loading.value = false
  }
}

function focusDeepLink() {
  const id = props.focusComment
  if (!id) return
  requestAnimationFrame(() => {
    const el = document.getElementById(`comment-${id}`)
    el?.scrollIntoView({ block: 'center' })
    markFlash(id)
  })
}

function markFlash(commentId: string) {
  flashing.add(commentId)
  setTimeout(() => flashing.delete(commentId), 1600)
}

function threadOf(id: string): Thread | undefined {
  return threads.value.find((t) => t.id === id)
}

async function open() {
  const body = newBody.value.trim()
  if (!body) return
  try {
    const t = await discussionService.openThread(props.fileUid, {
      title: newTitle.value.trim() || undefined,
      body,
    })
    if (!threads.value.some((x) => x.id === t.id)) threads.value.unshift(t)
    newTitle.value = ''
    newBody.value = ''
  } catch {
    error.value = 'Could not post. Check your access and try again.'
  }
}

async function reply(t: Thread) {
  const body = (replyDrafts[t.id] || '').trim()
  if (!body) return
  try {
    const c = await discussionService.reply(t.id, body)
    appendComment(t.id, c)
    replyDrafts[t.id] = ''
  } catch {
    error.value = 'Could not reply. A mentioned user may lack access.'
  }
}

async function resolve(t: Thread) {
  try {
    const updated = await discussionService.setThreadStatus(t.id, 'resolved')
    Object.assign(t, updated)
  } catch {
    error.value = 'Could not resolve.'
  }
}

async function del(c: Comment) {
  try {
    await discussionService.deleteComment(c.id)
    c.deleted = true
    c.body = ''
  } catch {
    error.value = 'Could not delete.'
  }
}

function appendComment(threadId: string, c: Comment) {
  const t = threadOf(threadId)
  if (!t) return
  if (!t.comments) t.comments = []
  if (!t.comments.some((x) => x.id === c.id)) {
    t.comments.push(c)
    markFlash(c.id)
  }
}

// --- live sync (§10h) ---
function onLiveComment(e: LiveCommentEvent) {
  if (e.action === 'created' && e.comment) {
    const c = mapLive(e.comment)
    if (c) appendComment(e.thread_id, c)
  } else if (e.action === 'updated' && e.comment) {
    const c = mapLive(e.comment)
    const t = threadOf(e.thread_id)
    const existing = c && t?.comments?.find((x) => x.id === c.id)
    if (existing && c) {
      Object.assign(existing, c)
      markFlash(existing.id)
    }
  } else if ((e.action === 'deleted' || e.action === 'redacted') && e.comment_id) {
    const t = threadOf(e.thread_id)
    const existing = t?.comments?.find((x) => x.id === e.comment_id)
    if (existing) {
      if (e.action === 'redacted') existing.redacted = true
      else existing.deleted = true
      existing.body = ''
    }
  }
}

function mapLive(raw: Record<string, unknown>): Comment | null {
  if (!raw.id) return null
  return {
    id: raw.id as string,
    threadId: raw.thread_id as string,
    author: raw.author as string,
    body: (raw.body as string) ?? '',
    createdAt: (raw.created_at as string) ?? new Date().toISOString(),
    editedAt: (raw.edited_at as string) ?? null,
    deleted: !!raw.deleted,
    redacted: !!raw.redacted,
  }
}

onMounted(() => {
  emit('layout', layout.value)
  load()
  try {
    session = new LiveSession(props.fileUid, {
      onComment: onLiveComment,
      onThread: (e) => {
        const t = threadOf(e.thread_id)
        if (t) t.status = 'resolved'
      },
      onPresence: (e) => {
        presence.value = (e.viewers || []).filter((u) => u !== me.value)
      },
    })
  } catch {
    /* live is enhancement-only */
  }
})
onBeforeUnmount(() => session?.close())
</script>

<style scoped>
.tp-toggle {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.85rem;
}
.tp-flag {
  margin-left: 6px;
  background: var(--primary);
  color: #fff;
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 0.7rem;
}
.tp {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--border);
  min-height: 0;
}
.tp-right {
  height: 100%;
  border-radius: 0;
}
.tp-bottom {
  width: 100%;
  max-height: 40vh;
}
.tp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.tp-title {
  font-weight: 600;
  font-size: 0.9rem;
}
.tp-presence {
  font-size: 0.75rem;
  color: var(--muted);
}
.tp-spacer {
  flex: 1;
}
.tp-lbtn {
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 6px;
  padding: 1px 7px;
  cursor: pointer;
  color: var(--muted);
}
.tp-lbtn.on {
  color: var(--fg);
  background: var(--bg);
}
.tp-body {
  overflow: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tp-muted {
  color: var(--muted);
}
.tp-err {
  color: var(--danger);
}
.thread {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}
.thread.resolved {
  opacity: 0.7;
}
.thread-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.stale,
.badge-res {
  font-size: 0.68rem;
  border-radius: 999px;
  padding: 1px 7px;
}
.stale {
  background: #fef3c7;
  color: #92400e;
}
.badge-res {
  background: #dcfce7;
  color: #166534;
}
.comment {
  padding: 4px 0;
  border-top: 1px solid var(--bg);
}
.c-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.75rem;
  color: var(--muted);
}
.c-author {
  font-weight: 600;
  color: var(--fg);
}
.c-x {
  border: none;
  background: transparent;
  color: var(--danger);
  cursor: pointer;
  font-size: 0.72rem;
}
.c-body {
  font-size: 0.9rem;
}
.c-body :deep(p) {
  margin: 4px 0;
}
.c-redacted {
  font-style: italic;
  color: var(--muted);
  font-size: 0.85rem;
}
.thread-foot {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tp-resolve {
  align-self: flex-start;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 8px;
  padding: 2px 10px;
  cursor: pointer;
  font-size: 0.8rem;
}
.new-thread summary {
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 6px;
}
.nt-title {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
  font: inherit;
}

/* New content flashes in (§10h) — respects reduced-motion. */
@keyframes tp-flash {
  from {
    background: #dbeafe;
  }
  to {
    background: transparent;
  }
}
.comment.flash {
  animation: tp-flash 1.5s ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .comment.flash {
    animation: none;
    background: #eff6ff;
  }
}
</style>
