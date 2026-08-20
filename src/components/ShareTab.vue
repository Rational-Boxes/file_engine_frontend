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
  <section class="share">
    <p v-if="error" class="share-err">{{ error }}</p>

    <!-- ── existing links ─────────────────────────────────────────────── -->
    <div v-if="links.length" class="share-group">
      <h3>Links on this item</h3>
      <ul class="share-list">
        <li v-for="l in links" :key="l.link_uid" class="share-item">
          <span class="share-kind">{{ kindLabel(l.kind) }}</span>
          <span class="share-badge" :data-st="l.status">{{ statusLabel(l.status) }}</span>
          <span class="share-uses">{{ usesLabel(l) }}</span>
          <span class="share-exp">{{ expiryLabel(l) }}</span>
          <button class="share-btn" @click="revoke(l)">Revoke</button>
          <!--
            The reason a link stopped working is the single most expensive
            support conversation this feature can create: nothing about the link
            changed, so the creator has nothing to look at. Say it here.
          -->
          <p v-if="l.status === 'not_working'" class="share-warn">
            {{ l.not_working_message || 'This link is no longer working.' }}
          </p>
        </li>
      </ul>
    </div>

    <!-- ── the created link, shown once ───────────────────────────────── -->
    <div v-if="created" class="share-created">
      <h3>Your link is ready</h3>
      <p class="share-once">
        This is the only time this link is shown — it is not stored anywhere we
        can read it back.
      </p>
      <div class="share-url">
        <input :value="created.url" readonly @focus="selectAll" />
        <button class="share-btn" @click="copy(created.url)">Copy link</button>
      </div>

      <!--
        v1 sends no invite mail: the creator writes their own message. So give
        them something worth pasting - including the warning that a code is
        coming, which is the step a recipient is most likely to mistake for
        phishing on an unfamiliar domain.
      -->
      <details class="share-msg" open>
        <summary>Message to send</summary>
        <textarea :value="messageText" readonly rows="4" @focus="selectAll" />
        <button class="share-btn" @click="copy(messageText)">Copy message</button>
      </details>

      <p v-if="created.member_count != null" class="muted">
        {{ created.member_count }} files · about {{ human(created.archive_bytes) }}
        <template v-if="created.worst_case_egress_bytes">
          · up to {{ human(created.worst_case_egress_bytes) }} if fully downloaded
        </template>
      </p>
    </div>

    <!-- ── create ─────────────────────────────────────────────────────── -->
    <div class="share-group">
      <h3>Share with someone outside</h3>

      <label v-if="isFolder" class="share-field">
        <span>What to share</span>
        <select v-model.number="form.kind">
          <option :value="ShareKind.FOLDER">Let someone download this folder</option>
          <option :value="ShareKind.UPLOAD">Let someone send you files</option>
        </select>
      </label>

      <label class="share-field">
        <span>Who may use it</span>
        <input
          v-model="recipientInput"
          type="text"
          placeholder="name@example.com, another@example.com"
        />
        <!--
          The distinction a user can get wrong without noticing: an address here
          AUTHORIZES someone, it does not contact them.
        -->
        <small class="muted">
          Addresses are who is <em>allowed</em> to use the link — we don't email
          them. Send the link yourself; they'll be emailed a one-time code when
          they open it.
        </small>
      </label>

      <label class="share-field">
        <span>Expires in</span>
        <select v-model.number="form.ttl_days">
          <option v-for="d in TTL_CHOICES" :key="d" :value="d">{{ d }} days</option>
        </select>
      </label>

      <label class="share-field">
        <span>{{ form.kind === ShareKind.UPLOAD ? 'How many files' : 'How many downloads' }}</span>
        <input
          v-model.number="budgetField"
          type="number"
          min="1"
          :max="form.kind === ShareKind.UPLOAD ? undefined : 100"
        />
      </label>

      <label v-if="form.kind === ShareKind.FOLDER" class="share-check">
        <input v-model="form.include_subdirs" type="checkbox" />
        <!-- This checkbox IS the difference between two of the three share
             shapes, so it names what the recipient receives, not the flag. -->
        <span>Include subfolders (they get everything under this folder)</span>
      </label>

      <label v-if="form.kind === ShareKind.FILE" class="share-check">
        <input v-model="form.follow_latest" type="checkbox" />
        <span>
          Always send the newest version
          <small class="muted">(off: they always get the version as it is today)</small>
        </span>
      </label>

      <label class="share-field">
        <span>Note (optional)</span>
        <input v-model="form.note" type="text" placeholder="What is this for?" />
      </label>

      <button class="share-btn primary" :disabled="busy || !recipientList.length" @click="create">
        {{ busy ? 'Creating…' : 'Create link' }}
      </button>
    </div>

    <p class="muted share-foot">
      Sharing with someone who has an account? Use the
      <button class="link" @click="$emit('go-access')">Access</button> tab instead.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ShareKind, shareService,
  type CreatedShareLink, type ShareLink, type ShareKindValue, type ShareStatus,
} from '@/services/shareService'
import { errorMessage } from '@/services/apiClient'

const props = defineProps<{ resourceUid: string; isFolder: boolean; name: string }>()
defineEmits<{ (e: 'go-access'): void }>()

const TTL_CHOICES = [1, 3, 7, 14, 30]

const links = ref<ShareLink[]>([])
const created = ref<CreatedShareLink | null>(null)
const error = ref('')
const busy = ref(false)
const recipientInput = ref('')

const form = ref({
  kind: (props.isFolder ? ShareKind.FOLDER : ShareKind.FILE) as ShareKindValue,
  ttl_days: 7,
  include_subdirs: true,
  follow_latest: false,
  note: '',
})
const budgetField = ref(5)

const recipientList = computed(() =>
  recipientInput.value.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean),
)

/** The block a creator pastes into their own email. */
const messageText = computed(() => {
  if (!created.value) return ''
  const c = created.value
  const size = c.member_count != null
    ? `\n${c.member_count} files, about ${human(c.archive_bytes)}`
    : ''
  const when = new Date(c.expires_at).toLocaleDateString()
  return `${props.name}${size}\n${c.url}\n`
    + `Expires ${when}. You'll be emailed a one-time code when you open it —`
    + ` that's expected, it's how we check it's you.`
})

function kindLabel(k: ShareKindValue): string {
  return k === ShareKind.UPLOAD ? 'Drop box' : k === ShareKind.FOLDER ? 'Folder' : 'File'
}

function statusLabel(s: ShareStatus): string {
  return {
    active: 'Active', expired: 'Expired', revoked: 'Revoked',
    exhausted: 'Used up', blocked: 'Blocked', not_working: '⚠ Not working',
  }[s] ?? s
}

function usesLabel(l: ShareLink): string {
  if (l.kind === ShareKind.UPLOAD) {
    return l.max_files ? `${l.files_consumed} / ${l.max_files} files` : `${l.files_consumed} files`
  }
  return l.max_uses ? `${l.uses_consumed} / ${l.max_uses}` : `${l.uses_consumed}`
}

function expiryLabel(l: ShareLink): string {
  const days = Math.ceil((new Date(l.expires_at).getTime() - Date.now()) / 86_400_000)
  return days > 0 ? `${days}d left` : 'expired'
}

function human(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1 }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

function selectAll(e: Event) {
  ;(e.target as HTMLInputElement | HTMLTextAreaElement).select()
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* clipboard denied — the field is selectable, which is the fallback */
  }
}

async function load() {
  error.value = ''
  try {
    links.value = await shareService.listForNode(props.resourceUid)
  } catch (e) {
    // Degrade rather than throw: the feature may simply be switched off in this
    // deployment, and that should not break the drawer.
    links.value = []
    error.value = errorMessage(e, '')
  }
}

async function create() {
  busy.value = true
  error.value = ''
  try {
    const body = {
      kind: form.value.kind,
      recipients: recipientList.value,
      ttl_days: form.value.ttl_days,
      note: form.value.note || undefined,
      ...(form.value.kind === ShareKind.UPLOAD
        ? { max_files: budgetField.value, max_uses: 20 }
        : { max_uses: budgetField.value }),
      ...(form.value.kind === ShareKind.FOLDER
        ? { include_subdirs: form.value.include_subdirs }
        : {}),
      ...(form.value.kind === ShareKind.FILE
        ? { follow_latest: form.value.follow_latest }
        : {}),
    }
    created.value = await shareService.create(props.resourceUid, body)
    recipientInput.value = ''
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not create the link')
  } finally {
    busy.value = false
  }
}

async function revoke(l: ShareLink) {
  try {
    await shareService.revoke(l.link_uid)
    if (created.value?.link_uid === l.link_uid) created.value = null
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not revoke the link')
  }
}

watch(() => props.resourceUid, () => {
  created.value = null
  void load()
}, { immediate: true })
</script>

<style scoped>
.share { display: flex; flex-direction: column; gap: 1rem; }
.share-group h3 { margin: 0 0 .5rem; font-size: .95rem; }
.share-list { list-style: none; margin: 0; padding: 0; }
.share-item {
  display: flex; align-items: center; gap: .5rem;
  padding: .35rem 0; border-bottom: 1px solid var(--border, #e5e5e5);
  flex-wrap: wrap;
}
.share-kind { font-weight: 600; }
.share-badge { font-size: .75rem; padding: .1rem .4rem; border-radius: .25rem; background: #eee; }
.share-badge[data-st='active'] { background: #dff5e1; }
.share-badge[data-st='revoked'], .share-badge[data-st='expired'] { background: #eee; color: #666; }
.share-badge[data-st='not_working'], .share-badge[data-st='blocked'] { background: #fde2e1; }
.share-uses, .share-exp { font-size: .8rem; color: #666; }
.share-warn { flex-basis: 100%; margin: .25rem 0 0; font-size: .8rem; color: #a33; }
.share-field { display: flex; flex-direction: column; gap: .2rem; margin-bottom: .6rem; }
.share-field > span { font-size: .8rem; font-weight: 600; }
.share-check { display: flex; gap: .4rem; align-items: flex-start; margin-bottom: .6rem; }
.share-btn { padding: .25rem .6rem; cursor: pointer; }
.share-btn.primary { font-weight: 600; }
.share-created {
  padding: .6rem; border: 1px solid var(--border, #e5e5e5); border-radius: .3rem;
  background: var(--surface-2, #fafafa);
}
.share-once { font-size: .8rem; font-weight: 600; margin: 0 0 .4rem; }
.share-url { display: flex; gap: .4rem; }
.share-url input { flex: 1; font-family: monospace; font-size: .8rem; }
.share-msg textarea { width: 100%; font-size: .8rem; margin: .3rem 0; }
.share-err { color: #a33; font-size: .85rem; }
.share-foot { font-size: .8rem; }
.link { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; }
.muted { color: #666; }
</style>
