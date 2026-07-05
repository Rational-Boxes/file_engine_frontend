<template>
  <!-- Collapsed: only a toggle with the comment count + attention flag (§10b-i). -->
  <button v-if="!embedded && layout === 'collapsed'" class="tp-toggle" @click="setLayout(lastOpen)">
    💬 Comments ({{ totalComments }})
    <span v-if="flag" class="tp-flag" :title="flagTitle">{{ flagText }}</span>
  </button>

  <section v-else class="tp" :class="embedded ? 'tp-embedded' : `tp-${layout}`">
    <header class="tp-head">
      <span class="tp-title">Comments ({{ totalComments }})</span>
      <span v-if="presence.length" class="tp-presence" :title="presence.join(', ')">
        👁 {{ presence.length }} here
      </span>
      <button class="tp-review-btn" title="Request review of this document" @click="reviewOpen = !reviewOpen">⚑ Review</button>
      <span class="tp-spacer"></span>
      <template v-if="!embedded">
        <button class="tp-lbtn" :class="{ on: layout === 'right' }" title="Dock right" @click="setLayout('right')">▐</button>
        <button class="tp-lbtn" :class="{ on: layout === 'bottom' }" title="Dock bottom" @click="setLayout('bottom')">▄</button>
        <button class="tp-lbtn" title="Collapse" @click="setLayout('collapsed')">✕</button>
      </template>
    </header>

    <div v-if="reviewOpen" class="tp-review">
      <input
        v-model="reviewInput"
        class="tp-review-in"
        placeholder="Reviewer emails, comma-separated"
        @keydown.enter="requestReview"
      />
      <button class="tp-review-go" @click="requestReview">Request</button>
      <span v-if="reviewMsg" class="tp-review-msg">{{ reviewMsg }}</span>
    </div>

    <div class="tp-body">
      <p v-if="loading" class="tp-muted">Loading…</p>

      <article
        v-for="t in threads"
        :key="t.id"
        class="thread"
        :class="{ resolved: t.status === 'resolved' }"
      >
        <div v-if="t.anchorStale || t.status === 'resolved' || t.status === 'open'" class="thread-head">
          <span v-if="t.anchorStale" class="stale" title="Commented on an earlier revision">stale</span>
          <span v-if="t.status === 'resolved'" class="badge-res">resolved</span>
          <span class="thread-spacer"></span>
          <button
            v-if="t.status === 'open'"
            class="tp-resolve"
            title="Mark this discussion resolved"
            @click="resolve(t)"
          >Resolve</button>
        </div>

        <!-- The post + its replies (unlimited-depth tree). -->
        <CommentNode
          v-for="root in treeFor(t)"
          :key="root.id"
          :node="root"
          :me="me"
          :thread-id="t.id"
          :file-uid="fileUid"
          :depth="0"
          :max-chars="maxChars"
          :flashing="flashing"
          :mention-source="mentionSource"
          @posted="onPosted"
          @updated="onUpdated"
          @deleted="onDeleted"
        />
      </article>

      <!-- Composer for a new root message — always available, below the messages. -->
      <div class="tp-composer">
        <CommentEditor
          v-model="newBody"
          placeholder="Write a comment…"
          submit-label="Post"
          :max-chars="maxChars"
          :mention-source="mentionSource"
          @submit="open"
        />
        <p v-if="error" class="tp-err">{{ error }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import CommentNode, { type CommentTreeNode } from '@/components/CommentNode.vue'
import {
  discussionService,
  extractMentions,
  type Thread,
  type Comment,
  type FlagCounts,
} from '@/services/discussionService'
import { LiveSession, type LiveCommentEvent } from '@/services/discussionLive'

const props = defineProps<{
  fileUid: string
  focusThread?: string
  focusComment?: string
  embedded?: boolean // rendered inside a container (drawer tab): no collapse/dock chrome
}>()
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
const newBody = ref('')
const reviewOpen = ref(false)
const reviewInput = ref('')
const reviewMsg = ref('')

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

// @mention autocomplete source for the editors (only users who can READ this file).
const mentionSource = (q: string) => discussionService.mentionable(props.fileUid, q)

// Build the comment tree (roots = comments with no parent) for CommentNode.
function treeFor(t: Thread): CommentTreeNode[] {
  const byId: Record<string, CommentTreeNode> = {}
  const roots: CommentTreeNode[] = []
  for (const c of t.comments || []) byId[c.id] = { ...c, children: [] }
  for (const c of t.comments || []) {
    const node = byId[c.id]
    const parent = c.parentCommentId ? byId[c.parentCommentId] : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    threads.value = await discussionService.listThreads(props.fileUid)
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
  error.value = ''
  try {
    const t = await discussionService.openThread(props.fileUid, {
      body,
      mentions: extractMentions(body),
    })
    if (!threads.value.some((x) => x.id === t.id)) threads.value.unshift(t)
    newBody.value = ''
  } catch (e: unknown) {
    const detail = (e as { response?: { data?: { detail?: { invalid_mentions?: string[] } } } })
      ?.response?.data?.detail
    error.value = detail?.invalid_mentions?.length
      ? `No access: ${detail.invalid_mentions.join(', ')}`
      : 'Could not post. Check your access and try again.'
  }
}

// Handlers from CommentNode (reply/edit/delete happen there, results flow up here).
function onPosted(c: Comment) {
  appendComment(c.threadId, c)
}
function onUpdated(c: Comment) {
  const t = threadOf(c.threadId)
  const existing = t?.comments?.find((x) => x.id === c.id)
  if (existing) {
    Object.assign(existing, c)
    markFlash(c.id)
  }
}
function onDeleted(id: string) {
  for (const t of threads.value) {
    const c = t.comments?.find((x) => x.id === id)
    if (c) {
      c.deleted = true
      c.body = ''
      return
    }
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

async function requestReview() {
  const reviewers = reviewInput.value.split(',').map((s) => s.trim()).filter(Boolean)
  if (!reviewers.length) return
  reviewMsg.value = ''
  try {
    const created = await discussionService.raiseReview(props.fileUid, reviewers)
    reviewMsg.value = `Requested from ${created.map((r) => r.reviewer).join(', ')}`
    reviewInput.value = ''
  } catch (e: unknown) {
    const detail = (e as { response?: { data?: { detail?: { invalid_reviewers?: string[] } } } })
      ?.response?.data?.detail
    reviewMsg.value = detail?.invalid_reviewers?.length
      ? `No access: ${detail.invalid_reviewers.join(', ')}`
      : 'Could not request review.'
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
    parentCommentId: (raw.parent_comment_id as string) ?? null,
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
/* Embedded in a drawer tab: fill the container, no border (the tab provides it). */
.tp-embedded {
  width: 100%;
  height: 100%;
  border: none;
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
.tp-review-btn {
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 6px;
  padding: 1px 8px;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--fg);
}
.tp-review {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.tp-review-in {
  flex: 1 1 auto;
  min-width: 140px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 8px;
  font: inherit;
}
.tp-review-go {
  border: 1px solid var(--primary);
  background: var(--primary);
  color: #fff;
  border-radius: 8px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 0.8rem;
}
.tp-review-msg {
  font-size: 0.75rem;
  color: var(--muted);
  flex-basis: 100%;
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
.tp-composer {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
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
