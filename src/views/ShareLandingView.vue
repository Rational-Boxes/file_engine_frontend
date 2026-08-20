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
  What an outside recipient sees. They have no account, no support channel, and
  every reason to think a code request on an unfamiliar domain is phishing — so
  this page carries more explanation than any signed-in surface would.

  Deliberately a session-less shell: no AppNav, no tenant chrome beyond a name,
  no sign-in affordance, and no bearer token on any call (sharePublicService has
  no auth interceptor at all).
-->
<template>
  <main class="sl">
    <div class="sl-card">
      <!-- ── dead link ────────────────────────────────────────────────── -->
      <template v-if="state === 'gone'">
        <h1>This link isn't available</h1>
        <!--
          Every failure looks the same from here by design: expired, revoked,
          used up, or never existed. Saying which would tell someone probing
          links that they hold a real one.
        -->
        <p>
          It may have expired, been used up, or been withdrawn. Ask whoever sent
          it to share it again.
        </p>
      </template>

      <!-- ── verification ─────────────────────────────────────────────── -->
      <template v-else-if="state === 'identify' || state === 'code'">
        <h1>{{ headline }}</h1>
        <p class="sl-lead">
          To open this, we'll email you a one-time code. That's expected — it's
          how we check it's you, and the link on its own won't work for anyone else.
        </p>

        <form v-if="state === 'identify'" @submit.prevent="requestCode">
          <label class="sl-field">
            <span>Your email address</span>
            <input v-model="email" type="email" required autocomplete="email" />
          </label>
          <button class="sl-btn primary" :disabled="busy || !email">
            {{ busy ? 'Sending…' : 'Email me a code' }}
          </button>
        </form>

        <form v-else @submit.prevent="submitCode">
          <!--
            Uniform wording: this says nothing about whether the address was on
            the link, because anyone holding the URL can reach this screen.
          -->
          <p class="sl-sent">
            If that address is on this link, a code is on its way to
            <strong>{{ email }}</strong>.
          </p>
          <label class="sl-field">
            <span>Six-digit code</span>
            <input
              v-model="code" inputmode="numeric" autocomplete="one-time-code"
              maxlength="6" required
            />
          </label>
          <p v-if="countdown > 0" class="muted">
            This code expires in {{ mmss(countdown) }}.
          </p>
          <p v-else class="muted">That code has expired — send another.</p>

          <p v-if="codeError" class="sl-err">{{ codeError }}</p>
          <!--
            After a resend the previous code stops working, and a delayed first
            email will be the one they reach for. Say which to use.
          -->
          <p v-if="resent" class="sl-note">
            Use the code from the newest email — the earlier one no longer works.
          </p>

          <button class="sl-btn primary" :disabled="busy || code.length < 6">
            {{ busy ? 'Checking…' : 'Continue' }}
          </button>
          <button
            class="sl-btn" type="button" :disabled="busy || resendWait > 0"
            @click="requestCode"
          >
            {{ resendWait > 0 ? `Send another in ${mmss(resendWait)}` : "Didn't get a code? Send another" }}
          </button>
        </form>
      </template>

      <!-- ── payload ──────────────────────────────────────────────────── -->
      <template v-else-if="state === 'ready' && peek">
        <h1>{{ headline }}</h1>

        <!-- file / folder download -->
        <template v-if="peek.kind !== 1">
          <p class="sl-lead">
            <template v-if="peek.member_count != null">
              {{ peek.member_count }} file{{ peek.member_count === 1 ? '' : 's' }},
              about {{ human(peek.archive_bytes) }}
            </template>
            <template v-else>{{ human(peek.size_bytes) }}</template>
            · expires {{ shortDate(peek.expires_at) }}
            <template v-if="peek.uses_remaining != null">
              · {{ peek.uses_remaining }} download{{ peek.uses_remaining === 1 ? '' : 's' }} left
            </template>
          </p>
          <a class="sl-btn primary" :href="downloadUrl" download>Download</a>

          <details v-if="manifest.length" class="sl-manifest">
            <summary>What's in it ({{ manifest.length }})</summary>
            <!-- Read-only text: no per-file fetch, no preview, no navigation. -->
            <ul>
              <li v-for="m in manifest" :key="m.path">
                {{ m.path }} <span class="muted">{{ human(m.size_bytes) }}</span>
              </li>
            </ul>
          </details>
        </template>

        <!-- drop box -->
        <template v-else>
          <p class="sl-lead">
            Send files to whoever shared this with you.
            <template v-if="peek.files_remaining != null">
              {{ peek.files_remaining }} file{{ peek.files_remaining === 1 ? '' : 's' }} left
            </template>
            <template v-if="peek.bytes_remaining != null">
              · {{ human(peek.bytes_remaining) }} left
            </template>
          </p>
          <label class="sl-field">
            <span>Your name (optional)</span>
            <input v-model="claimedName" type="text" placeholder="so they know who sent it" />
          </label>
          <input type="file" multiple :disabled="busy" @change="onFiles" />
          <p v-if="dropError" class="sl-err">{{ dropError }}</p>
          <ul v-if="dropped.length" class="sl-dropped">
            <li v-for="d in dropped" :key="d">✓ {{ d }}</li>
          </ul>
        </template>
      </template>

      <p v-else class="muted">Loading…</p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  sharePublicService, splitToken,
  type SharePeek, type ShareManifestEntry, type ShareSession,
} from '@/services/sharePublicService'

const route = useRoute()
const { linkUid, secret } = splitToken(String(route.params.token ?? ''))

type State = 'loading' | 'gone' | 'identify' | 'code' | 'ready'
const state = ref<State>('loading')
const peek = ref<SharePeek | null>(null)
const session = ref<ShareSession | null>(null)
const manifest = ref<ShareManifestEntry[]>([])

const email = ref('')
const code = ref('')
const claimedName = ref('')
const busy = ref(false)
const codeError = ref('')
const dropError = ref('')
const resent = ref(false)
const dropped = ref<string[]>([])

const countdown = ref(0)     // seconds until the code expires
const resendWait = ref(0)    // seconds until another may be requested
let timer: ReturnType<typeof setInterval> | undefined

// The recipient token is a bearer credential with its own lifetime. It goes in
// sessionStorage, never localStorage: this page is on the SPA's origin, and a
// day-long credential left behind on a shared machine outlives the visit.
const TOKEN_KEY = `share.recipient.${linkUid}`
function storedToken(): string { return sessionStorage.getItem(TOKEN_KEY) ?? '' }

const headline = computed(() => {
  if (!peek.value) return 'Shared with you'
  if (peek.value.kind === 1) return 'Send files'
  // The note is creator-written and routinely names the thing ("Q3 drawings —
  // Acme merger"). It is payload, not chrome, so it waits behind verification
  // exactly like the file name and size do; anyone can reach the screens above.
  return state.value === 'ready' && peek.value.note ? peek.value.note : 'Shared with you'
})

const downloadUrl = computed(() =>
  session.value ? sharePublicService.contentUrl(linkUid, secret, session.value.redemption_uid) : '#',
)

function human(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1 }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

function mmss(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

function tick() {
  if (countdown.value > 0) countdown.value -= 1
  if (resendWait.value > 0) resendWait.value -= 1
}

async function load() {
  if (!linkUid || !secret) { state.value = 'gone'; return }
  try {
    peek.value = await sharePublicService.peek(linkUid, secret)
  } catch {
    state.value = 'gone'
    return
  }
  // A live recipient token from earlier in this tab skips straight past the
  // challenge — a re-download inside the window should not need a fresh code.
  if (storedToken()) {
    await openSession()
  } else {
    state.value = 'identify'
  }
}

async function requestCode() {
  busy.value = true
  codeError.value = ''
  try {
    const r = await sharePublicService.identify(linkUid, secret, email.value.trim().toLowerCase())
    resent.value = state.value === 'code'
    state.value = 'code'
    countdown.value = r.expires_in_seconds || 600
    resendWait.value = 60
  } catch {
    // Even a failure here says nothing specific: the uniform response is the
    // point, and a network error must not become an oracle either.
    state.value = 'code'
    countdown.value = 600
    resendWait.value = 60
  } finally {
    busy.value = false
  }
}

async function submitCode() {
  busy.value = true
  codeError.value = ''
  try {
    const r = await sharePublicService.verify(linkUid, secret,
      email.value.trim().toLowerCase(), code.value.trim())
    if (!r.ok) {
      // "Wait 15 minutes" and "this link is broken" must be distinguishable, or
      // a locked-out recipient simply gives up.
      codeError.value = r.locked
        ? 'Too many attempts. Try again in about 15 minutes.'
        : 'That code was not right.'
      code.value = ''
      return
    }
    if (r.recipient_token) sessionStorage.setItem(TOKEN_KEY, r.recipient_token)
    await openSession()
  } catch {
    codeError.value = 'That code was not right.'
  } finally {
    busy.value = false
  }
}

async function openSession() {
  try {
    session.value = await sharePublicService.openSession(
      linkUid, secret, email.value.trim().toLowerCase(), storedToken())
    state.value = 'ready'
    if (peek.value?.kind === 2) {
      manifest.value = await sharePublicService.manifest(
        linkUid, secret, session.value.redemption_uid)
    }
  } catch {
    // The token may have expired since it was stored; fall back to the
    // challenge rather than stranding them on a dead screen.
    sessionStorage.removeItem(TOKEN_KEY)
    state.value = email.value ? 'identify' : 'gone'
  }
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length || !session.value) return
  busy.value = true
  dropError.value = ''
  try {
    for (const f of files) {
      const r = await sharePublicService.drop(linkUid, secret,
        session.value.redemption_uid, f, claimedName.value.trim())
      // Report what it was STORED as: a name collision renames it, and
      // "did my file arrive?" otherwise has no answer.
      dropped.value.push(r.stored_name)
    }
    // The budget moves as files land, so re-read it rather than counting locally.
    peek.value = await sharePublicService.peek(linkUid, secret)
  } catch {
    dropError.value = 'That file could not be sent. It may be too large, or the '
      + 'allowance may be used up.'
  } finally {
    busy.value = false
    input.value = ''
  }
}

onMounted(() => {
  timer = setInterval(tick, 1000)
  void load()
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.sl { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.sl-card {
  width: min(30rem, 100%); padding: 1.5rem;
  border: 1px solid var(--border, #e5e5e5); border-radius: .5rem;
  background: var(--surface, #fff);
}
.sl-card h1 { font-size: 1.15rem; margin: 0 0 .5rem; }
.sl-lead { font-size: .9rem; color: #444; }
.sl-sent { font-size: .85rem; }
.sl-field { display: flex; flex-direction: column; gap: .2rem; margin: .6rem 0; }
.sl-field > span { font-size: .8rem; font-weight: 600; }
.sl-btn { display: inline-block; padding: .4rem .8rem; margin: .2rem .3rem .2rem 0; cursor: pointer; }
.sl-btn.primary { font-weight: 600; }
.sl-err { color: #a33; font-size: .85rem; }
.sl-note { font-size: .8rem; color: #555; }
.sl-manifest { margin-top: .8rem; font-size: .85rem; }
.sl-manifest ul { max-height: 12rem; overflow: auto; padding-left: 1rem; }
.sl-dropped { list-style: none; padding: 0; font-size: .85rem; }
.muted { color: #666; font-size: .85rem; }
</style>
