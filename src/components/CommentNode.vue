<template>
  <div class="cn" :style="{ marginLeft: indent + 'px' }">
    <div class="cn-item" :class="{ flash: flashing.has(node.id), mine: node.author === me }">
      <div class="cn-meta">
        <span class="cn-author">{{ node.author }}</span>
        <time :title="node.createdAt">{{ ago(node.createdAt) }}</time>
        <button
          v-if="node.editedAt"
          class="cn-link"
          @click="toggleHistory"
        >edited{{ showHistory ? ' ▾' : '' }}</button>
      </div>

      <div v-if="node.redacted" class="cn-tomb">[redacted by an administrator]</div>
      <div v-else-if="node.deleted" class="cn-tomb">[deleted]</div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else-if="!editing" class="cn-body" v-html="rendered"></div>

      <!-- edit-history (§15) -->
      <ul v-if="showHistory" class="cn-history">
        <li v-if="!revisions.length" class="cn-muted">No earlier versions.</li>
        <li v-for="(r, i) in revisions" :key="i">
          <time>{{ ago(r.editedAt) }}</time>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="cn-hbody" v-html="render(r.body)"></span>
        </li>
      </ul>

      <!-- inline edit -->
      <div v-if="editing" class="cn-compose">
        <CommentEditor
          v-model="editDraft"
          submit-label="Save"
          :max-chars="maxChars"
          :mention-source="mentionSource"
          @submit="submitEdit"
        />
        <button class="cn-link" @click="cancelEdit">Cancel</button>
      </div>

      <div v-if="!node.deleted && !node.redacted && !editing" class="cn-actions">
        <button class="cn-link" @click="replying = !replying">Reply</button>
        <button v-if="node.author === me" class="cn-link" @click="startEdit">Edit</button>
        <button v-if="node.author === me" class="cn-link danger" @click="del">Delete</button>
      </div>
      <p v-if="error" class="cn-err">{{ error }}</p>

      <!-- inline reply -->
      <div v-if="replying" class="cn-compose">
        <CommentEditor
          v-model="replyDraft"
          placeholder="Write a reply…"
          submit-label="Reply"
          :max-chars="maxChars"
          :mention-source="mentionSource"
          @submit="submitReply"
        />
        <button class="cn-link" @click="cancelReply">Cancel</button>
      </div>
    </div>

    <!-- children (recursive, unlimited depth) -->
    <CommentNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :me="me"
      :thread-id="threadId"
      :file-uid="fileUid"
      :depth="depth + 1"
      :max-chars="maxChars"
      :flashing="flashing"
      :mention-source="mentionSource"
      @posted="(c) => emit('posted', c)"
      @updated="(c) => emit('updated', c)"
      @deleted="(id) => emit('deleted', id)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import CommentEditor from '@/components/CommentEditor.vue'
import { renderMarkdown } from '@/utils/markdown'
import {
  discussionService,
  extractMentions,
  type Comment,
  type Revision,
  type MentionUser,
} from '@/services/discussionService'

export interface CommentTreeNode extends Comment {
  children: CommentTreeNode[]
}

const props = defineProps<{
  node: CommentTreeNode
  me: string | null
  threadId: string
  fileUid: string
  depth: number
  maxChars: number
  flashing: Set<string>
  mentionSource?: (q: string) => Promise<MentionUser[]>
}>()
const emit = defineEmits<{
  (e: 'posted', c: Comment): void
  (e: 'updated', c: Comment): void
  (e: 'deleted', id: string): void
}>()

const replying = ref(false)
const replyDraft = ref('')
const editing = ref(false)
const editDraft = ref('')
const showHistory = ref(false)
const revisions = ref<Revision[]>([])
const error = ref('')

// Cap the visual indent so deep trees stay readable (the data is unlimited depth).
const indent = computed(() => (props.depth === 0 ? 0 : Math.min(props.depth, 6) * 16))
const rendered = computed(() => renderMarkdown(props.node.body))

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

async function submitReply() {
  const body = replyDraft.value.trim()
  if (!body) return
  error.value = ''
  try {
    const c = await discussionService.reply(props.threadId, body, {
      parentCommentId: props.node.id,
      mentions: extractMentions(body),
    })
    replyDraft.value = ''
    replying.value = false
    emit('posted', c)
  } catch (e: unknown) {
    error.value = mentionError(e) ?? 'Could not reply.'
  }
}

function startEdit() {
  editDraft.value = props.node.body
  editing.value = true
}
function cancelEdit() {
  editing.value = false
  editDraft.value = ''
  error.value = ''
}
function cancelReply() {
  replying.value = false
  replyDraft.value = ''
  error.value = ''
}

async function submitEdit() {
  const body = editDraft.value.trim()
  if (!body) return
  error.value = ''
  try {
    const c = await discussionService.editComment(props.node.id, body)
    editing.value = false
    emit('updated', c)
  } catch {
    error.value = 'Could not save the edit.'
  }
}

async function del() {
  error.value = ''
  try {
    await discussionService.deleteComment(props.node.id)
    emit('deleted', props.node.id)
  } catch {
    error.value = 'Could not delete.'
  }
}

async function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value && !revisions.value.length) {
    revisions.value = await discussionService.revisions(props.node.id).catch(() => [])
  }
}

function mentionError(e: unknown): string | null {
  const detail = (e as { response?: { data?: { detail?: { invalid_mentions?: string[] } } } })
    ?.response?.data?.detail
  return detail?.invalid_mentions?.length
    ? `No access: ${detail.invalid_mentions.join(', ')}`
    : null
}
</script>

<style scoped>
.cn-item {
  padding: 4px 0 2px;
  border-top: 1px solid var(--bg);
}
.cn-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.75rem;
  color: var(--muted);
}
.cn-author {
  font-weight: 600;
  color: var(--fg);
}
.cn-body {
  font-size: 0.9rem;
  color: var(--fg);
}
.cn-body :deep(p) {
  margin: 3px 0;
}
.cn-tomb {
  font-style: italic;
  color: var(--muted);
  font-size: 0.85rem;
}
.cn-actions {
  display: flex;
  gap: 10px;
  margin-top: 2px;
}
.cn-compose {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  margin-top: 4px;
}
.cn-link {
  border: none;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}
.cn-link.danger {
  color: var(--danger);
}
.cn-err {
  color: var(--danger);
  font-size: 0.75rem;
}
.cn-history {
  list-style: none;
  margin: 4px 0;
  padding: 6px 8px;
  background: var(--bg);
  border-radius: 8px;
  font-size: 0.82rem;
}
.cn-history li {
  display: flex;
  gap: 8px;
}
.cn-history time {
  color: var(--muted);
  flex: 0 0 auto;
}
.cn-muted {
  color: var(--muted);
}
.cn {
  border-left: 1px solid transparent;
}
.cn .cn {
  border-left: 1px solid var(--border);
  padding-left: 8px;
}
.cn-item.flash {
  animation: cn-flash 1.5s ease-out;
}
@keyframes cn-flash {
  from {
    background: #dbeafe;
  }
  to {
    background: transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cn-item.flash {
    animation: none;
    background: #eff6ff;
  }
}
</style>
