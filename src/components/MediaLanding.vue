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

<!--
  The landing page's media branch (MEDIA_SHARE.md §10): the poster, the gate the
  link's mode needs, a "preparing" state, the player, and — where the creator
  allowed it — a download.

  The gate is chosen from the door's `requires`, BEFORE anything asks for bytes,
  so a viewer never meets a failed media element. Opening the page fetches no
  media and opens no session: a session (a view, in the audit chain) starts
  only when the viewer presses play or gives what the gate asks for.
-->
<template>
  <div class="ml">
    <template v-if="state === 'gone'">
      <h1>This link isn't available</h1>
      <p>It may have expired, been used up, or been withdrawn. Ask whoever sent it to share it again.</p>
    </template>

    <template v-else-if="state === 'popular'">
      <h1>{{ title }}</h1>
      <p data-test="popular">{{ popularMessage || 'This video is temporarily unavailable because it has been very popular. Please try again later.' }}</p>
    </template>

    <template v-else-if="peek">
      <h1>{{ title }}</h1>

      <p v-if="state === 'preparing'" class="ml-lead" data-test="preparing">
        This {{ noun }} is still being prepared — usually a minute or two. This
        page will start it as soon as it's ready.
      </p>

      <!-- the poster, until there is something to play -->
      <div v-if="!session && peek.kind === 'video' && peek.poster" class="ml-poster">
        <img :src="door.abs(peek.poster) + posterQuery" alt="" />
        <button
          v-if="state === 'ready' && peek.requires === 'none'"
          class="ml-play"
          aria-label="Play"
          data-test="play"
          :disabled="busy"
          @click="openSession()"
        >▶</button>
      </div>
      <button
        v-else-if="!session && state === 'ready' && peek.requires === 'none'"
        class="ml-btn primary"
        data-test="play"
        :disabled="busy"
        @click="openSession()"
      >▶ Play</button>

      <!-- claimed: an address, not checked -->
      <form v-if="!session && state === 'ready' && peek.requires === 'email'" class="ml-gate" data-test="claim" @submit.prevent="claim">
        <label class="ml-field">
          <span>Your email address</span>
          <input v-model="email" type="email" required autocomplete="email" />
        </label>
        <!-- The consent is the click, made with this line in view: a notice, not
             a pre-ticked box (which is not consent). media-v2 records it. -->
        <p class="ml-small ml-consent" data-test="consent">{{ claimNotice }}</p>
        <button class="ml-btn primary" :disabled="busy || !email">
          {{ busy ? 'Opening…' : `Watch` }}
        </button>
      </form>

      <!-- verified: a code -->
      <form v-if="!session && state === 'ready' && peek.requires === 'code' && !codeSent" class="ml-gate" data-test="identify" @submit.prevent="requestCode">
        <p class="ml-lead">To watch, we'll email you a one-time code. That's expected — it's how we check it's you.</p>
        <label class="ml-field">
          <span>Your email address</span>
          <input v-model="email" type="email" required autocomplete="email" />
        </label>
        <button class="ml-btn primary" :disabled="busy || !email">Email me a code</button>
      </form>
      <form v-if="!session && state === 'ready' && peek.requires === 'code' && codeSent" class="ml-gate" data-test="code" @submit.prevent="submitCode">
        <p>If that address is on this link, a code is on its way to <strong>{{ email }}</strong>.</p>
        <label class="ml-field">
          <span>Six-digit code</span>
          <input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
        </label>
        <p v-if="codeError" class="ml-err">{{ codeError }}</p>
        <button class="ml-btn primary" :disabled="busy || code.length < 6">Continue</button>
      </form>

      <p v-if="error" class="ml-err" data-test="error">{{ error }}</p>

      <!-- the player -->
      <MediaPlayer
        v-if="session"
        :sources="absSources"
        :kind="peek.kind"
        :poster="peek.poster ? door.abs(peek.poster) + posterQuery : null"
        :beacon-url="session.beacon ? door.abs(session.beacon) : undefined"
        autoplay
        data-test="player"
      />

      <p v-if="session && peek.allow_download" class="ml-dl">
        <a class="ml-btn" :href="door.downloadUrl(session.session)" download data-test="download">⬇ Download</a>
      </p>

      <p v-if="peek.tracking && !session && peek.requires !== 'email'" class="ml-small" data-test="tracking-note">
        {{ consentText }}
      </p>
      <p v-if="!peek.tracking" class="ml-small">The sender does not see how much of this you watch.</p>
    </template>

    <p v-else class="ml-small" data-test="loading">{{ error || 'Loading…' }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MediaPlayer from '@/components/MediaPlayer.vue'
import { mediaDoor, Popular, Preparing, type MediaPeek, type MediaSession, Unavailable } from '@/services/mediaDoorService'

const props = defineProps<{ linkUid: string; secret: string; mediaBase: string }>()

/** The wording a viewer saw is recorded with their address (§7.3). */
// Which wording the viewer agreed to, recorded with their address (MEDIA_SHARE.md
// §7.3). v1 was a checkbox beside consentText; v2 is the notice above Watch.
const CONSENT_ID = 'media-v2'

const door = mediaDoor(props.mediaBase, props.linkUid, props.secret)
const state = ref<'loading' | 'gone' | 'popular' | 'preparing' | 'ready'>('loading')
const peek = ref<MediaPeek | null>(null)
const session = ref<MediaSession | null>(null)
const email = ref('')
const code = ref('')
const codeSent = ref(false)
const codeError = ref('')
const error = ref('')
const busy = ref(false)
const popularMessage = ref('')
let poll: ReturnType<typeof setTimeout> | null = null

const TOKEN_KEY = `share.media.${props.linkUid}`
const noun = computed(() => (peek.value?.kind === 'audio' ? 'recording' : 'video'))
const title = computed(() => peek.value?.title || `Shared ${noun.value}`)
const posterQuery = computed(() => `?k=${encodeURIComponent(props.secret)}`)
const consentText = computed(() => (peek.value?.tracking
  ? `The sender can see whether and how much of this you ${peek.value?.kind === 'audio' ? 'listen to' : 'watch'}.`
  : `Your address is shared with the sender.`))
const claimNotice = computed(() => (peek.value?.tracking
  ? `By clicking Watch, you agree that the sender can see whether and how much of this you ${
    peek.value?.kind === 'audio' ? 'listen to' : 'watch'}.`
  : 'By clicking Watch, you agree that your address is shared with the sender.'))
const absSources = computed(() => (session.value?.sources ?? []).map((s) => ({ ...s, url: door.abs(s.url) })))

// Only the door's own refusal means the link is dead. Everything else — a 429
// from the edge (which carries no CORS, so the browser reports it as a network
// error), a 5xx, a dropped connection — is a busy moment: say so and ask again.
// Production 2026-10-04: a viewer reopening a link while the last tab still
// streamed got 429 on this call and was told the link had expired.
const RETRY_MS = [2000, 4000, 8000, 15000, 30000]
let retries = 0

async function load() {
  try {
    peek.value = await door.peek()
    state.value = peek.value.state === 'ready' ? 'ready' : 'preparing'
    retries = 0
    error.value = ''
  } catch (e) {
    if (e instanceof Popular) { popularMessage.value = e.message; state.value = 'popular'; return }
    if (e instanceof Unavailable && /^(404|410)$/.test(e.message)) { state.value = 'gone'; return }
    if (retries < RETRY_MS.length) {
      error.value = 'The video service is busy — trying again…'
      poll = setTimeout(() => void load(), RETRY_MS[retries++])
    } else {
      error.value = 'We could not reach the video service. Please reload the page in a moment.'
    }
    return
  }
  if (state.value === 'preparing') poll = setTimeout(() => void load(), 5000)
}

async function handle<T>(fn: () => Promise<T>): Promise<T | null> {
  busy.value = true
  error.value = ''
  try {
    return await fn()
  } catch (e) {
    if (e instanceof Preparing) { state.value = 'preparing'; poll = setTimeout(() => void load(), 5000) }
    else if (e instanceof Popular) { popularMessage.value = e.message; state.value = 'popular' }
    else if ((e as { status?: number }).status === 400) error.value = 'Please check the address and try again.'
    else if ((e as { status?: number }).status === 429) error.value = 'Too many tries from here. Please wait a few minutes.'
    // No answer at all (offline, or a response the browser would not hand over)
    // is not a dead link. Saying "not available" here sent a viewer away from a
    // working link whose code had just been emailed (production 2026-10-04).
    else if (e instanceof TypeError) error.value = 'We could not reach the video service. Please try again.'
    else state.value = 'gone'
    return null
  } finally {
    busy.value = false
  }
}

async function openSession(recipientToken?: string) {
  const s = await handle(() => door.session(email.value.trim().toLowerCase() || undefined, recipientToken))
  if (s) session.value = s
}

async function claim() {
  const s = await handle(() => door.claim(email.value.trim().toLowerCase(), CONSENT_ID))
  if (s) session.value = s
}

async function requestCode() {
  // The code form follows an ANSWER: the reply is uniform ("sent if authorized"),
  // so any answer means "now enter the code".
  if (await handle(() => door.identify(email.value.trim().toLowerCase()))) codeSent.value = true
}

async function submitCode() {
  codeError.value = ''
  const r = await handle(() => door.verify(email.value.trim().toLowerCase(), code.value.trim()))
  if (!r) return
  if (!r.ok) {
    codeError.value = r.locked ? 'Too many attempts. Try again in about 15 minutes.' : 'That code was not right.'
    code.value = ''
    return
  }
  try { sessionStorage.setItem(TOKEN_KEY, r.recipient_token || '') } catch { /* private mode */ }
  await openSession(r.recipient_token)
}

onMounted(() => void load())
onBeforeUnmount(() => { if (poll) clearTimeout(poll) })
</script>

<style scoped>
.ml { display: flex; flex-direction: column; gap: .7rem; }
.ml h1 { margin: 0; font-size: 1.3rem; }
.ml-lead { margin: 0; }
/* The poster stays at its own size, centred (the card is page-wide for media);
   only the playing video stretches to fill. It still shrinks on a narrow screen. */
.ml-poster { position: relative; align-self: center; max-width: 100%; }
.ml-poster img { max-width: 100%; height: auto; border-radius: .3rem; display: block; }
.ml-play {
  position: absolute; inset: 0; margin: auto; width: 4rem; height: 4rem;
  border-radius: 50%; border: 0; font-size: 1.6rem; cursor: pointer;
  background: rgba(0, 0, 0, .6); color: #fff;
}
/* The card is page-wide for media; a form that wide is a row of long thin
   boxes, so the gate keeps the measure the card used to have. */
.ml-gate {
  display: flex; flex-direction: column; gap: .5rem;
  width: 100%; max-width: 30rem; align-self: center;
}
.ml-field { display: flex; flex-direction: column; gap: .2rem; }
.ml-consent { margin: 0; }
.ml-btn {
  padding: .4rem .8rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--card); color: var(--fg); cursor: pointer; text-decoration: none;
  align-self: flex-start;
}
.ml-btn.primary { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 600; }
.ml-btn:disabled { opacity: .5; cursor: not-allowed; }
.ml-err { color: var(--danger); margin: 0; }
.ml-small { font-size: .8rem; color: var(--muted); margin: 0; }
.ml-dl { margin: 0; }
</style>
