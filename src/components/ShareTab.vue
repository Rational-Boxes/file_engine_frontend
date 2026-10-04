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
          <span v-if="l.kind === ShareKind.MEDIA && l.access_mode" class="share-mode">
            {{ MODE_SHORT[l.access_mode] }}
          </span>
          <span v-if="l.media_state === 'pending_media'" class="share-badge" data-st="blocked">
            Preparing
          </span>
          <span class="share-badge" :data-st="l.status">{{ statusLabel(l.status) }}</span>
          <span class="share-uses">{{ usesLabel(l) }}</span>
          <span class="share-exp">{{ expiryLabel(l) }}</span>
          <button class="share-btn" @click="toggle(l.link_uid)">
            {{ expanded === l.link_uid ? 'Hide' : 'Who / activity' }}
          </button>
          <!--
            Once a link is revoked there is nothing left for this to do — the
            server answers `changed: false` — so the button is removed rather
            than left to look like a pending action. Expired and used-up links
            keep it: revoking those still writes a real "I ended this" record,
            which a link that merely ran out of road does not have.
          -->
          <button
            v-if="l.status !== 'revoked'"
            class="share-btn"
            @click="askRevoke(l)"
          >
            Revoke
          </button>
          <!--
            The reason a link stopped working is the single most expensive
            support conversation this feature can create: nothing about the link
            changed, so the creator has nothing to look at. Say it here.
          -->
          <p v-if="l.status === 'not_working'" class="share-warn">
            {{ l.not_working_message || 'This link is no longer working.' }}
          </p>
          <MediaLinkDetail
            v-if="expanded === l.link_uid && l.kind === ShareKind.MEDIA"
            :link="l"
            class="share-detail"
            @changed="load"
          />
          <ShareLinkDetail
            v-else-if="expanded === l.link_uid"
            :link-uid="l.link_uid"
            :status="l.status"
            class="share-detail"
          />
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

      <!--
        For a media link the email is where it is going (§2.1), so the email
        block comes first: a still that links to the page, with a plain-text
        fallback for clients that block images. The Web Component and iframe
        snippets arrive with the embed kit (MS8).
      -->
      <details v-if="created.kind === ShareKind.MEDIA && emailHtml" class="share-msg" open data-test="email-snippet">
        <summary>For an email</summary>
        <textarea :value="emailHtml" readonly rows="5" @focus="selectAll" />
        <button class="share-btn" @click="copy(emailHtml)">Copy email HTML</button>
      </details>
      <p v-if="created.kind === ShareKind.MEDIA && created.media_state === 'pending_media'" class="muted" data-test="created-preparing">
        A web-playable copy is being prepared. The link works now — send it; it
        plays as soon as the copy is ready (usually a minute or two).
      </p>

      <p v-if="created.member_count != null" class="muted">
        {{ created.member_count }} files · about {{ human(created.archive_bytes) }}
        <template v-if="created.worst_case_egress_bytes">
          · up to {{ human(created.worst_case_egress_bytes) }} if fully downloaded
        </template>
      </p>
    </div>

    <!-- ── create ─────────────────────────────────────────────────────── -->
    <div class="share-group">
      <h3>
        Share with someone outside
        <HelpIcon topic="share-links" label="Sending files outside your organisation" />
      </h3>

      <label v-if="isFolder" class="share-field">
        <span>What to share</span>
        <select v-model.number="form.kind">
          <option :value="ShareKind.FOLDER">Let someone download this folder</option>
          <option :value="ShareKind.UPLOAD">Let someone send you files</option>
        </select>
      </label>

      <label v-if="mediaOffered" class="share-field">
        <span>What to share</span>
        <select v-model.number="form.kind" data-test="kind">
          <option :value="ShareKind.FILE">Let someone download this file</option>
          <option :value="ShareKind.MEDIA">Let someone {{ isAudio ? 'listen to' : 'watch' }} this</option>
        </select>
      </label>

      <!-- ── media (MEDIA_SHARE.md §10) ──────────────────────────────── -->
      <template v-if="isMedia">
        <!-- Radios, never a dropdown: the difference between these IS the
             security posture of the link, and a collapsed control hides it. -->
        <fieldset class="share-modes" data-test="modes">
          <legend>Who can {{ isAudio ? 'listen' : 'watch' }}</legend>
          <label class="share-check">
            <input v-model="accessMode" type="radio" value="verified" />
            <span>
              <strong>Only people I name.</strong>
              They confirm with a one-time code emailed to them.
            </span>
          </label>
          <label class="share-check">
            <input v-model="accessMode" type="radio" value="claimed" />
            <span>
              <strong>Anyone with the link who gives an email address.</strong>
              The address is not checked — you see what they typed.
            </span>
          </label>
          <label class="share-check" :class="{ off: !mediaCaps?.open_mode }">
            <input v-model="accessMode" type="radio" value="open" :disabled="!mediaCaps?.open_mode" />
            <span>
              <strong>Anyone with the link.</strong> No sign-in.
              <small v-if="!mediaCaps?.open_mode" class="muted">(not enabled on this deployment)</small>
            </span>
          </label>
        </fieldset>

        <label v-if="accessMode !== 'open'" class="share-field">
          <span>{{ accessMode === 'verified' ? 'Who may watch' : 'Who you expect (optional)' }}</span>
          <input v-model="recipientInput" type="text" placeholder="name@example.com, another@example.com" />
          <small class="muted">
            <template v-if="accessMode === 'verified'">
              Addresses are who is <em>allowed</em> to watch — we don't email them.
              Send the link yourself.
            </template>
            <template v-else>
              Only marks who you expected in the viewer list. Anyone with the link can still watch.
            </template>
          </small>
        </label>

        <label class="share-field">
          <span>Title viewers see{{ accessMode === 'open' ? '' : ' (optional)' }}</span>
          <input v-model="displayName" type="text" :placeholder="accessMode === 'open' ? 'Required for a public link' : name" data-test="display-name" />
          <small v-if="accessMode === 'open'" class="muted">
            Not the file name by default: a public title should not publish your internal naming.
          </small>
        </label>

        <template v-if="accessMode === 'open'">
          <label class="share-field">
            <span>Sites that may embed it (optional)</span>
            <input v-model="embedInput" type="text" placeholder="https://www.example.com" />
          </label>
          <label class="share-check share-confirm" data-test="confirm-public">
            <input v-model="confirmPublic" type="checkbox" />
            <span>I understand: <strong>anyone with this link, and anyone they forward it to, can watch this.</strong></span>
          </label>
        </template>

        <label class="share-field">
          <span>At most this many {{ accessMode === 'open' ? 'viewers' : 'people' }} (optional)</span>
          <input v-model.number="maxViewers" type="number" min="0" placeholder="no limit" />
        </label>

        <!-- The worst case, in the same plain block a folder link states its
             archive size in — the egress budget is the bound that matters. -->
        <p class="share-summary muted" data-test="worst-case">
          This link stops serving after {{ human(mediaCaps?.default_max_bytes) }} in total<template v-if="viewEstimate">
          — about {{ viewEstimate }} full viewings</template>. For a bigger
          audience, publish on PeerTube, YouTube or Vimeo instead.
        </p>

        <!-- The trigger is explicit, not something the user discovers from a
             progress bar (§10). -->
        <p v-if="!published" class="share-summary" data-test="will-prepare">
          <template v-if="publishFailure">{{ publishFailure }}</template>
          <template v-else>
            Creating this link will prepare a web-playable copy first (usually a
            minute or two, stored alongside this file). The link works straight
            away and plays once the copy is ready.
          </template>
        </p>
      </template>

      <label v-if="!isMedia" class="share-field">
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

      <label v-if="!isMedia" class="share-field">
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

      <button class="share-btn primary" :disabled="busy || !canCreate" data-test="create" @click="create">
        {{ busy ? 'Creating…' : 'Create link' }}
      </button>
    </div>

    <p class="muted share-foot">
      Sharing with someone who has an account? Use the
      <button class="link" @click="$emit('go-access')">Access</button> tab instead.
    </p>

    <!--
      Revoking cannot be undone: there is no un-revoke, and re-sharing mints a
      NEW URL, so everyone already holding the old one has to be told again.
      That is too much to hang on one unguarded click in a row of buttons.

      A dialog rather than a second click in the same spot — the two-click
      pattern used by the tenant-wide console is defeated by exactly the input
      this is meant to stop, since a double click lands on both states. This
      moves the confirm elsewhere, focuses Cancel, and takes Escape.
    -->
    <ConfirmModal
      :open="revokeTarget !== null"
      title="Revoke this link?"
      :message="revokeMessage"
      confirm-label="Revoke"
      :danger="true"
      @confirm="confirmRevoke"
      @cancel="revokeTarget = null"
    />
  </section>
</template>

<script setup lang="ts">
import HelpIcon from '@/components/HelpIcon.vue'
import { computed, ref, watch } from 'vue'
import {
  ShareKind, shareService,
  type CreatedShareLink, type ShareLink, type ShareKindValue, type ShareStatus,
} from '@/services/shareService'
import { errorMessage } from '@/services/apiClient'
import ShareLinkDetail from '@/components/ShareLinkDetail.vue'
import MediaLinkDetail from '@/components/MediaLinkDetail.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useCapabilities } from '@/composables/useCapabilities'
import { failureDetail, isPublished, mediaService, primaryJob, type MediaState } from '@/services/mediaService'
import type { AccessMode, ShareCapabilities } from '@/services/shareService'

const props = defineProps<{ resourceUid: string; isFolder: boolean; name: string }>()
defineEmits<{ (e: 'go-access'): void }>()

const TTL_CHOICES = [1, 3, 7, 14, 30]

const links = ref<ShareLink[]>([])
const created = ref<CreatedShareLink | null>(null)
const error = ref('')
const busy = ref(false)
const recipientInput = ref('')
const expanded = ref<string | null>(null)
const revokeTarget = ref<ShareLink | null>(null)

const form = ref({
  kind: (props.isFolder ? ShareKind.FOLDER : ShareKind.FILE) as ShareKindValue,
  ttl_days: 7,
  include_subdirs: true,
  follow_latest: false,
  note: '',
})
const budgetField = ref(5)

// ── media (MEDIA_SHARE.md §10) ────────────────────────────────────────────
const VIDEO_RE = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|mpg|mpeg|3gp|ogv)$/i
const AUDIO_RE = /\.(mp3|m4a|wav|ogg|oga|opus|flac|aac|wma)$/i
const MODE_SHORT: Record<AccessMode, string> = {
  verified: 'named people', claimed: 'email given', open: 'public',
}
const { features } = useCapabilities()
const mediaCaps = ref<ShareCapabilities['media'] | null>(null)
const mediaState = ref<MediaState | null>(null)
const accessMode = ref<AccessMode>('verified')
const displayName = ref('')
const confirmPublic = ref(false)
const embedInput = ref('')
const maxViewers = ref<number | null>(null)

const isAudio = computed(() => AUDIO_RE.test(props.name))
const isMediaFile = computed(() => !props.isFolder && (VIDEO_RE.test(props.name) || isAudio.value))
/** Offered only where it will work: csai can encode AND share_service has media links on. */
const mediaOffered = computed(() =>
  isMediaFile.value && features.media && !!mediaCaps.value?.available)
const isMedia = computed(() => form.value.kind === ShareKind.MEDIA)
const published = computed(() => isPublished(mediaState.value))
const publishFailure = computed(() => failureDetail(mediaState.value))
const viewEstimate = computed(() => {
  const size = primaryJob(mediaState.value)?.output_bytes
  const budget = mediaCaps.value?.default_max_bytes
  return size && budget ? Math.floor(budget / size).toLocaleString() : ''
})

const canCreate = computed(() => {
  if (!isMedia.value) return recipientList.value.length > 0
  if (accessMode.value === 'verified') return recipientList.value.length > 0
  if (accessMode.value === 'open') return confirmPublic.value && !!displayName.value.trim()
  return true
})

/** For an email: a still linking to the page, plus a plain-text fallback. */
const emailHtml = computed(() => {
  const c = created.value
  if (!c || c.kind !== ShareKind.MEDIA || !c.media_url) return ''
  let poster = ''
  try {
    const u = new URL(c.media_url)
    poster = `${u.origin}/media/v1/${c.link_uid}/poster?${u.searchParams.toString()}`
  } catch {
    return ''
  }
  const title = (c.display_name || props.name).replace(/[<>&"]/g, '')
  return `<a href="${c.url}"><img src="${poster}" alt="▶ Watch: ${title}" width="280" style="border:0;display:block"></a>\n`
    + `<p><a href="${c.url}">▶ Watch “${title}”</a></p>`
})

async function loadMedia() {
  mediaCaps.value = null
  mediaState.value = null
  if (!isMediaFile.value) return
  try {
    mediaCaps.value = (await shareService.capabilities()).media
  } catch {
    mediaCaps.value = null          // share_service unreachable or older: no media branch
  }
  if (!mediaCaps.value?.available) return
  try {
    mediaState.value = await mediaService.state(props.resourceUid)
  } catch {
    mediaState.value = null         // unknown: say it will be prepared, which is safe
  }
}

const recipientList = computed(() =>
  recipientInput.value.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean),
)

/** The block a creator pastes into their own email. */
const messageText = computed(() => {
  if (!created.value) return ''
  const c = created.value
  if (c.kind === ShareKind.MEDIA) {
    const when = new Date(c.expires_at).toLocaleDateString()
    const how = c.access_mode === 'verified'
      ? " You'll be emailed a one-time code when you open it — that's expected, it's how we check it's you."
      : c.access_mode === 'claimed'
        ? ' You will be asked for your email address before it plays.'
        : ''
    return `${c.display_name || props.name}\n${c.url}\nAvailable until ${when}.${how}`
  }
  const size = c.member_count != null
    ? `\n${c.member_count} files, about ${human(c.archive_bytes)}`
    : ''
  const when = new Date(c.expires_at).toLocaleDateString()
  return `${props.name}${size}\n${c.url}\n`
    + `Expires ${when}. You'll be emailed a one-time code when you open it —`
    + ` that's expected, it's how we check it's you.`
})

function kindLabel(k: ShareKindValue): string {
  if (k === ShareKind.MEDIA) return isAudio.value ? 'Audio' : 'Video'
  return k === ShareKind.UPLOAD ? 'Drop box' : k === ShareKind.FOLDER ? 'Folder' : 'File'
}

function statusLabel(s: ShareStatus): string {
  return {
    active: 'Active', expired: 'Expired', revoked: 'Revoked',
    exhausted: 'Used up', blocked: 'Blocked', not_working: '⚠ Not working',
  }[s] ?? s
}

function usesLabel(l: ShareLink): string {
  if (l.kind === ShareKind.MEDIA) return `${human(l.bytes_consumed)} served`
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
    const origins = embedInput.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
    const body = isMedia.value ? {
      kind: ShareKind.MEDIA,
      access_mode: accessMode.value,
      recipients: accessMode.value === 'open' ? [] : recipientList.value,
      ttl_days: form.value.ttl_days,
      note: form.value.note || undefined,
      display_name: displayName.value.trim() || undefined,
      ...(accessMode.value === 'open'
        ? { confirm_public: confirmPublic.value,
            ...(origins.length ? { allowed_embed_origins: origins } : {}) }
        : {}),
      ...(maxViewers.value ? { max_viewers: maxViewers.value } : {}),
    } : {
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
    confirmPublic.value = false
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not create the link')
  } finally {
    busy.value = false
  }
}

function toggle(uid: string) {
  expanded.value = expanded.value === uid ? null : uid
}

function askRevoke(l: ShareLink) {
  revokeTarget.value = l
}

/**
 * Named for what the recipient loses, not for the row being changed — "revoke
 * this link" reads as tidying up, and the thing worth pausing over is that
 * people who were sent it stop being able to open it.
 */
const revokeMessage = computed(() => {
  const l = revokeTarget.value
  if (!l) return ''
  // The recipient count is not on this payload — it belongs to the tenant-wide
  // console — so this says "everyone it was sent to" rather than inventing a
  // number, and names the item so the dialog is not ambiguous in a drawer that
  // can be reopened over a different file.
  const what = kindLabel(l.kind).toLowerCase()
  return `Everyone this ${what} link was sent to will lose access to`
    + ` “${props.name}”. This cannot be undone — sharing it again creates a new`
    + ' address, which you would have to send out yourself.'
})

/**
 * Separate from `askRevoke`, deliberately: one function with a `confirmed` flag
 * bound to the row button would revoke on the first click the moment someone
 * mistyped the guard. There is no path from a row click to this.
 */
async function confirmRevoke() {
  const l = revokeTarget.value
  revokeTarget.value = null
  if (!l) return
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
  form.value.kind = (props.isFolder ? ShareKind.FOLDER : ShareKind.FILE) as ShareKindValue
  void loadMedia()
  // Or the dialog would still be open over a different file, aimed at a link
  // that is no longer on screen.
  revokeTarget.value = null
  void load()
}, { immediate: true })
</script>

<style scoped>
.share { display: flex; flex-direction: column; gap: 1rem; }
.share-group h3 { margin: 0 0 .5rem; font-size: .95rem; }
.share-list { list-style: none; margin: 0; padding: 0; }
.share-item {
  display: flex; align-items: center; gap: .5rem;
  padding: .35rem 0; border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.share-kind { font-weight: 600; }
.share-mode { font-size: .75rem; color: var(--muted); }
.share-modes { border: 1px solid var(--border); border-radius: .3rem; padding: .4rem .6rem; margin: 0 0 .6rem; }
.share-modes legend { font-size: .8rem; font-weight: 600; padding: 0 .2rem; }
.share-modes .off { opacity: .6; }
.share-confirm { padding: .4rem; border: 1px solid var(--danger); border-radius: .3rem; }
.share-summary { font-size: .8rem; margin: 0 0 .6rem; }
/* Tinted by INK, not by fill. A fill light enough to read against dark ink is
   too light to read against light ink — so the state colour goes on the text
   and the border, and the fill stays a theme surface in both. */
.share-badge {
  font-size: .75rem; padding: .1rem .4rem; border-radius: .25rem;
  background: var(--bg); border: 1px solid var(--border); color: var(--fg);
}
.share-badge[data-st='active'] { color: var(--success); border-color: var(--success); }
.share-badge[data-st='revoked'], .share-badge[data-st='expired'] { color: var(--muted); }
.share-badge[data-st='not_working'], .share-badge[data-st='blocked'] {
  color: var(--danger); border-color: var(--danger);
}
.share-uses, .share-exp { font-size: .8rem; color: var(--muted); }
.share-detail { flex-basis: 100%; }
.share-warn { flex-basis: 100%; margin: .25rem 0 0; font-size: .8rem; color: var(--danger); }
.share-field { display: flex; flex-direction: column; gap: .2rem; margin-bottom: .6rem; }
.share-field > span { font-size: .8rem; font-weight: 600; }
.share-check { display: flex; gap: .4rem; align-items: flex-start; margin-bottom: .6rem; }
/* Themed explicitly. The global `button { color: inherit }` rule gives a button
   the theme ink, which in dark mode is LIGHT — so a button that sets no
   background of its own keeps the UA's light grey and ends up light-on-light.
   Setting both is the only way to be right in both themes. */
.share-btn {
  padding: .25rem .6rem;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--fg);
}
.share-btn:hover:not(:disabled) { border-color: var(--primary); }
.share-btn.primary {
  font-weight: 600;
  background: var(--primary);
  border-color: var(--primary);
  /* Not var(--fg): the primary fill is blue in BOTH themes, so its text is
     white in both. Theme ink here would be dark-on-blue in light mode. */
  color: #fff;
}
.share-btn.primary:hover:not(:disabled) { background: var(--primary-hover); }
.share-btn:disabled { opacity: .5; cursor: not-allowed; }
.share-created {
  padding: .6rem; border: 1px solid var(--border); border-radius: .3rem;
  /* --surface-2 is not a token this app defines, so the light literal was
     ALWAYS used and this panel stayed near-white in dark mode. --bg is the
     recessed surface (the card sits on it), which is what this wants. */
  background: var(--bg);
}
.share-once { font-size: .8rem; font-weight: 600; margin: 0 0 .4rem; }
.share-url { display: flex; gap: .4rem; }
.share-url input { flex: 1; font-family: monospace; font-size: .8rem; }
.share-msg textarea { width: 100%; font-size: .8rem; margin: .3rem 0; }
.share-err { color: var(--danger); font-size: .85rem; }
.share-foot { font-size: .8rem; }
.link { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; }
.muted { color: var(--muted); }
</style>
