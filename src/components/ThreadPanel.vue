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
  <!-- Minimized: only a toggle with the comment count + attention flag (§10b-i).
       When a title-bar slot is provided (the preview window), teleport into it. -->
  <Teleport :to="titlebarTarget || 'body'" :disabled="!titlebarTarget || layout !== 'collapsed'">
    <button
      v-if="layout === 'collapsed'"
      class="tp-toggle"
      :class="{ 'tp-toggle-chip': !!titlebarTarget }"
      @click="setLayout(lastOpen)"
    >
      💬 Comments ({{ totalComments }})
      <span v-if="flag" class="tp-flag" :title="flagTitle">{{ flagText }}</span>
    </button>
  </Teleport>

  <section
    v-if="layout !== 'collapsed'"
    v-bind="$attrs"
    class="tp"
    :class="embedded ? 'tp-embedded' : `tp-${layout}`"
  >
    <header class="tp-head">
      <span class="tp-title">Comments ({{ totalComments }})</span>
      <HelpIcon topic="comments" label="How comments &amp; discussions work" />
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
      <template v-else-if="!hideDock">
        <button v-if="pos" class="tp-lbtn" :class="{ on: pos === 'side' }" title="Dock to the right" @click="emit('update:pos', 'side')">▐</button>
        <button v-if="pos" class="tp-lbtn" :class="{ on: pos === 'bottom' }" title="Dock below" @click="emit('update:pos', 'bottom')">▄</button>
        <button class="tp-lbtn" title="Minimize comments" @click="setLayout('collapsed')">—</button>
      </template>
    </header>

    <div v-if="reviewOpen" class="tp-review">
      <div class="tp-review-field">
        <input
          v-model="reviewInput"
          class="tp-review-in"
          placeholder="Reviewers — type a name…"
          @input="onReviewInput"
          @keydown.enter="requestReview"
          @blur="reviewSug = []"
        />
        <ul v-if="reviewSug.length" class="tp-review-sug">
          <li v-for="u in reviewSug" :key="u.user" @mousedown.prevent="pickReviewer(u)">
            <strong>{{ u.user }}</strong><span v-if="u.email && u.email !== u.user">· {{ u.email }}</span>
          </li>
        </ul>
      </div>
      <button class="tp-review-go" @click="requestReview">Request</button>
      <span v-if="reviewMsg" class="tp-review-msg">{{ reviewMsg }}</span>
    </div>

    <div class="tp-tabs" role="tablist">
      <button
        class="tp-tab"
        :class="{ active: activeTab === 'comments' }"
        role="tab"
        :aria-selected="activeTab === 'comments'"
        @click="activeTab = 'comments'"
      >Comments <span class="tp-tab-n">{{ totalComments }}</span></button>
      <button
        class="tp-tab"
        :class="{ active: activeTab === 'reviews' }"
        role="tab"
        :aria-selected="activeTab === 'reviews'"
        @click="activeTab = 'reviews'"
      >Reviews<span v-if="recordCount" class="tp-tab-n">{{ recordCount }}</span></button>
    </div>

    <div class="tp-body">
      <template v-if="activeTab === 'comments'">
      <!-- Review requested of me on this document — approve / send back right here. -->
      <div v-for="r in myReviews" :key="r.id" class="tp-review-ask">
        <span class="tp-review-ask-lbl">⚑ Review requested by {{ r.requester }}</span>
        <span class="tp-review-ask-actions">
          <button v-if="r.status === 'requested'" class="tp-rbtn" @click="ackMyReview(r)">Acknowledge</button>
          <button class="tp-rbtn ok" @click="resolveMyReview(r, 'approved')">Approve</button>
          <button class="tp-rbtn" @click="resolveMyReview(r, 'changes')">Request changes</button>
        </span>
      </div>

      <p v-if="loading" class="tp-muted">Loading…</p>

      <article
        v-for="t in threads"
        :id="`thread-${t.id}`"
        :key="t.id"
        class="thread"
        :class="{ resolved: t.status === 'resolved' }"
      >
        <div v-if="t.anchorStale || t.status === 'resolved' || t.status === 'open'" class="thread-head">
          <span v-if="t.anchorStale" class="stale" title="Commented on an earlier revision">stale</span>
          <span v-if="t.status === 'resolved'" class="badge-res">resolved</span>
          <!-- Annotation thread: restore the author's captured 3D view (§9). -->
          <button
            v-if="t.anchor?.kind === 'model-viewpoint'"
            type="button"
            class="tp-viewbtn"
            title="Restore this 3D view"
            @click="emit('restore-view', t.id)"
          >🎯 View</button>
          <!-- Download the anchored comment as a BCF file (.bcfzip) for use outside
               the API — e.g. opening the issue in a desktop BCF Manager. -->
          <button
            v-if="t.anchor?.kind === 'model-viewpoint'"
            type="button"
            class="tp-viewbtn"
            title="Download this comment as a BCF file (.bcfzip)"
            @click="downloadBcf(t)"
          >⬇ BCF</button>
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
          :pending-markup="pendingMarkup"
          @posted="onPosted"
          @updated="onUpdated"
          @deleted="onDeleted"
          @show-markup="(m) => emit('show-markup', m)"
        />
      </article>

      <!-- Composer for a new root message — always available, below the messages. -->
      <div class="tp-composer">
        <!-- A 3D viewpoint captured from the viewer is attached to the next thread (§9). -->
        <div v-if="pendingAnchor" class="tp-anchor-chip">
          <span>📍 3D view attached</span>
          <button type="button" class="tp-anchor-clear" title="Detach the 3D view" @click="clearPendingAnchor">✕</button>
        </div>
        <!-- A marked-up PDF copy saved from the viewer, attached to the next comment (Phase 7.1). -->
        <div v-if="pendingMarkup" class="tp-anchor-chip">
          <span>📄 Marked-up copy attached</span>
          <button type="button" class="tp-anchor-clear" title="Detach the marked-up copy" @click="clearPendingMarkup">✕</button>
        </div>
        <CommentEditor
          v-model="newBody"
          :placeholder="pendingAnchor || pendingMarkup ? 'Describe what you\'re pointing at…' : 'Write a comment…'"
          submit-label="Post"
          :max-chars="maxChars"
          :mention-source="mentionSource"
          @submit="open"
        />
        <p v-if="error" class="tp-err">{{ error }}</p>
      </div>
      </template>

      <!-- Reviews tab: the review-request record + resolutions for this document. -->
      <template v-else>
        <section class="tp-rec-sec">
          <h4 class="tp-rec-h">Review requests</h4>
          <p v-if="!fileReviews.length" class="tp-muted">No review requests on this document.</p>
          <ul v-else class="tp-rec-list">
            <li v-for="r in fileReviews" :key="r.id" class="tp-rec">
              <span class="tp-rec-ic">⚑</span>
              <div class="tp-rec-main">
                <div class="tp-rec-line">
                  <strong>{{ r.requester }}</strong> asked <strong>{{ r.reviewer }}</strong> to review
                  <span class="tp-rec-status" :class="'st-' + r.status">{{ reviewLabel(r) }}</span>
                </div>
                <div class="tp-rec-when">
                  {{ fmtDate(r.createdAt) }}<template v-if="r.completedAt"> · completed {{ fmtDate(r.completedAt) }}</template>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section class="tp-rec-sec">
          <h4 class="tp-rec-h">Resolutions</h4>
          <p v-if="!resolvedThreads.length" class="tp-muted">No resolved discussions yet.</p>
          <ul v-else class="tp-rec-list">
            <li v-for="t in resolvedThreads" :key="t.id" class="tp-rec">
              <span class="tp-rec-ic ok">✓</span>
              <div class="tp-rec-main">
                <div class="tp-rec-line">
                  <strong>{{ t.resolvedBy }}</strong> resolved
                  <em>{{ t.title || 'a discussion' }}</em>
                  <span v-if="t.resolvedVersion" class="tp-rec-ver">@ {{ t.resolvedVersion }}</span>
                </div>
                <div class="tp-rec-when">{{ fmtDate(t.updatedAt) }}</div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import CommentEditor from '@/components/CommentEditor.vue'
import HelpIcon from '@/components/HelpIcon.vue'
import CommentNode, { type CommentTreeNode } from '@/components/CommentNode.vue'
import {
  discussionService,
  extractMentions,
  type Thread,
  type Comment,
  type FlagCounts,
  type MentionUser,
  type ReviewRequest,
  type ModelViewpointAnchor,
  type CommentMarkup,
} from '@/services/discussionService'
import bcfService from '@/services/bcfService'
import { LiveSession, type LiveCommentEvent } from '@/services/discussionLive'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  fileUid: string
  focusThread?: string
  focusComment?: string
  embedded?: boolean // rendered inside a container (drawer tab): no collapse/dock chrome
  titlebarTarget?: string // CSS selector of the window's title-bar slot for the minimized chip
  pos?: 'side' | 'bottom' // parent-owned dock orientation, shown in the header
  hideDock?: boolean // parent owns the dock/minimize controls (e.g. the 3D viewer header)
}>()
const emit = defineEmits<{
  (e: 'layout', l: 'collapsed' | 'right' | 'bottom'): void
  (e: 'update:pos', p: 'side' | 'bottom'): void
  (e: 'count', n: number): void
  // The current thread list, so a host (e.g. the 3D viewer) can render markers (§9).
  (e: 'threads', threads: Thread[]): void
  // Restore an annotation thread's saved 3D view (host wires this to the viewer).
  (e: 'restore-view', threadId: string): void
  // Reshow a comment's marked-up PDF copy (host loads the rendition read-only).
  (e: 'show-markup', markup: CommentMarkup): void
}>()

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
// A 3D view captured from the viewer, pending attachment to the next new thread
// (§9). Set by the viewer's "Comment here"; rides along on open() then clears.
const pendingAnchor = ref<ModelViewpointAnchor | null>(null)
// A browser-annotated PDF copy (Phase 7.1) the host saved, pending attachment to the
// next comment (root OR reply). Set by the PDF viewer's "Save markup to a comment"
// (via a ref); rides along on open()/reply then clears.
const pendingMarkup = ref<CommentMarkup | null>(null)
const reviewOpen = ref(false)
const reviewInput = ref('')
const reviewMsg = ref('')
const myReviews = ref<ReviewRequest[]>([])
// Side-bar tabs: the comment threads vs. the review-request + resolution record.
const activeTab = ref<'comments' | 'reviews'>('comments')
const fileReviews = ref<ReviewRequest[]>([])
const resolvedThreads = computed(() => threads.value.filter((t) => t.status === 'resolved'))
const recordCount = computed(() => fileReviews.value.length + resolvedThreads.value.length)
// The discussion service returns ISO-8601 timestamp strings (unlike the file
// store's epoch seconds), so format them locally for the record.
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isNaN(t)
    ? ''
    : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
// Human label for a review's state/outcome (the record reads as plain English).
function reviewLabel(r: ReviewRequest): string {
  if (r.status === 'completed') {
    if (r.outcome === 'approved') return 'approved'
    if (r.outcome === 'changes') return 'changes requested'
    return 'completed'
  }
  return r.status // requested | acknowledged | declined
}

// When the parent owns minimize (hideDock, e.g. the 3D viewer), never start in the
// shared "collapsed" state — the parent controls visibility, so keep the panel open.
const layout = ref<Layout>(props.hideDock ? 'right' : readLayout())
const lastOpen = ref<Layout>(layout.value === 'collapsed' ? 'right' : layout.value)

let session: LiveSession | null = null

const totalComments = computed(() =>
  threads.value.reduce((n, t) => n + (t.comments?.length || 0), 0),
)
// Surface the count so a parent-owned header control (e.g. the 3D viewer) can show it.
watch(totalComments, (n) => emit('count', n), { immediate: true })
// Surface the thread set to the host (the 3D viewer renders a marker per anchored
// thread). Fires on load and whenever a thread is added/removed.
watch(() => threads.value.length, () => emit('threads', threads.value), { immediate: true })
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

// Reviewer field uses the SAME who-can-read filter as @mentions. Autocomplete on the
// current comma-separated token.
const reviewSug = ref<MentionUser[]>([])
function reviewerTokenStart(): number {
  return reviewInput.value.lastIndexOf(',') + 1
}
function onReviewInput() {
  const q = reviewInput.value.slice(reviewerTokenStart()).trim()
  if (!q) {
    reviewSug.value = []
    return
  }
  discussionService
    .mentionable(props.fileUid, q)
    .then((list) => (reviewSug.value = list.slice(0, 8)))
    .catch(() => (reviewSug.value = []))
}
function pickReviewer(u: MentionUser) {
  const before = reviewInput.value.slice(0, reviewerTokenStart()).trimEnd()
  reviewInput.value = (before ? before + ' ' : '') + (u.email || u.user) + ', '
  reviewSug.value = []
}

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
    fileReviews.value = await discussionService
      .listFileReviews(props.fileUid)
      .catch(() => [] as ReviewRequest[])
    loadMyReviews()
    focusDeepLink()
  } catch {
    error.value = 'Could not load comments.'
  } finally {
    loading.value = false
  }
}

// Open review requests assigned to me on THIS file — surfaced inline so I can
// approve / request changes right in the preview, not only on the dashboard.
const REVIEW_OPEN = new Set(['requested', 'acknowledged'])
async function loadMyReviews() {
  try {
    const mine = await discussionService.listReviews('reviewer')
    myReviews.value = mine.filter((r) => r.fileUid === props.fileUid && REVIEW_OPEN.has(r.status))
  } catch {
    myReviews.value = []
  }
}
async function ackMyReview(r: ReviewRequest) {
  try {
    await discussionService.acknowledgeReview(r.id)
    await loadMyReviews()
  } catch {
    reviewMsg.value = 'Could not acknowledge.'
  }
}
async function resolveMyReview(r: ReviewRequest, outcome: 'approved' | 'changes') {
  try {
    await discussionService.completeReview(r.id, outcome)
    await loadMyReviews()
  } catch {
    reviewMsg.value = 'Could not submit the review.'
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

// Begin an annotation: attach a viewer-captured viewpoint to the next new thread
// and reveal the composer. Called by the viewer's "Comment here" (via a ref).
function startAnnotation(anchor: ModelViewpointAnchor) {
  pendingAnchor.value = anchor
  if (layout.value === 'collapsed') layout.value = props.pos === 'bottom' ? 'bottom' : 'right'
}
function clearPendingAnchor() {
  pendingAnchor.value = null
}

// Attach a saved marked-up PDF copy to the next comment. Called by the PDF viewer's
// "Save markup to a comment" (via a ref); mirrors startAnnotation for 3D viewpoints.
function startMarkupAttach(markup: CommentMarkup) {
  pendingMarkup.value = markup
  if (layout.value === 'collapsed') layout.value = props.pos === 'bottom' ? 'bottom' : 'right'
}
function clearPendingMarkup() {
  pendingMarkup.value = null
}

// Download an anchored comment as a BCF (.bcfzip) via the BCF-XML export door, for
// use outside the API (e.g. a desktop BCF Manager). Surfaces an inline error on
// failure rather than throwing at the click handler.
async function downloadBcf(t: Thread) {
  try {
    await bcfService.downloadThreadBcf(t)
  } catch {
    error.value = 'Could not export the BCF file.'
  }
}

// Scroll a thread into view (and open the panel if collapsed) — used when an
// in-scene 3D annotation marker is clicked (§9).
function focusThread(threadId: string) {
  if (layout.value === 'collapsed') layout.value = props.pos === 'bottom' ? 'bottom' : 'right'
  requestAnimationFrame(() => {
    document.getElementById(`thread-${threadId}`)?.scrollIntoView({ block: 'center' })
  })
}
defineExpose({ startAnnotation, startMarkupAttach, focusThread })

async function open() {
  const body = newBody.value.trim()
  if (!body) return
  error.value = ''
  try {
    const t = await discussionService.openThread(props.fileUid, {
      body,
      mentions: extractMentions(body),
      // A pending 3D viewpoint turns this thread into an anchored annotation (§9).
      anchor: pendingAnchor.value ?? undefined,
      // A pending marked-up PDF copy attaches to the opening comment (Phase 7.1).
      markup: pendingMarkup.value ?? undefined,
    })
    if (!threads.value.some((x) => x.id === t.id)) threads.value.unshift(t)
    newBody.value = ''
    pendingAnchor.value = null
    pendingMarkup.value = null
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
  // A reply that consumed the pending marked-up copy clears the composer chip.
  if (c.markup && pendingMarkup.value) pendingMarkup.value = null
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

function connectLive() {
  session?.close()
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
}

onMounted(() => {
  emit('layout', layout.value)
  load()
  connectLive()
})
// Reload + reconnect when the anchored file changes without a remount
// (e.g. navigating /preview/:uid, or reusing a kept-alive panel).
watch(
  () => props.fileUid,
  () => {
    threads.value = []
    load()
    connectLive()
  },
)
onBeforeUnmount(() => session?.close())
</script>

<style scoped>
.tp-toggle {
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.85rem;
}
/* Compact chip variant when docked into a window title bar. */
.tp-toggle-chip {
  padding: 3px 10px;
  font-size: 0.8rem;
  white-space: nowrap;
}
.tp-toggle-chip:hover {
  background: var(--bg);
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
  background: var(--card);
  color: var(--fg);
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
.tp-review-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 140px;
}
.tp-review-in {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 8px;
  font: inherit;
  background: var(--card);
  color: var(--fg);
}
.tp-review-sug {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 30;
  list-style: none;
  margin: 2px 0 0;
  padding: 4px;
  max-height: 180px;
  overflow: auto;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}
.tp-review-sug li {
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.85rem;
  display: flex;
  gap: 6px;
}
.tp-review-sug li:hover {
  background: var(--bg);
}
.tp-review-sug span {
  color: var(--muted);
}
.tp-review-ask {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  margin-bottom: 10px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--bg);
  font-size: 0.85rem;
}
.tp-review-ask-lbl {
  font-weight: 600;
}
.tp-review-ask-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.tp-rbtn {
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 8px;
  padding: 2px 10px;
  cursor: pointer;
  font-size: 0.8rem;
}
.tp-rbtn.ok {
  border-color: var(--primary);
  color: var(--primary);
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

/* Comments / Reviews tabs */
.tp-tabs {
  display: flex;
  gap: 4px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.tp-tab {
  border: none;
  background: transparent;
  color: var(--muted);
  padding: 8px 10px;
  font-size: 13px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
}
.tp-tab:hover {
  color: var(--fg);
}
.tp-tab.active {
  color: var(--fg);
  border-bottom-color: var(--primary);
  font-weight: 600;
}
.tp-tab-n {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
}

/* Review-record list (Reviews tab) */
.tp-rec-sec + .tp-rec-sec {
  margin-top: 6px;
}
.tp-rec-h {
  margin: 4px 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.tp-rec-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tp-rec {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.tp-rec-ic {
  flex: 0 0 auto;
  color: var(--muted);
}
.tp-rec-ic.ok {
  color: #15803d;
}
.tp-rec-main {
  min-width: 0;
  font-size: 13px;
}
.tp-rec-line {
  line-height: 1.4;
}
.tp-rec-status {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 11px;
  background: var(--bg);
  color: var(--muted);
}
.tp-rec-status.st-completed {
  color: #15803d;
}
.tp-rec-ver {
  color: var(--muted);
  font-size: 12px;
}
.tp-rec-when {
  color: var(--muted);
  font-size: 11px;
  margin-top: 1px;
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
.tp-viewbtn {
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  border-radius: 8px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.78rem;
}
.tp-viewbtn:hover {
  border-color: var(--accent, #6ea8fe);
}
.tp-composer {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
/* "3D view attached" chip above the composer when a viewpoint is pending (§9). */
.tp-anchor-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 8px;
  padding: 0.15rem 0.5rem;
  font-size: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  color: var(--fg);
}
.tp-anchor-clear {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  line-height: 1;
  padding: 0;
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
