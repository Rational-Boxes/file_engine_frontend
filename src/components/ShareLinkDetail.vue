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
  Who has picked this link up, and who hasn't.

  With no account on the far side this is the ONLY place that can answer "did it
  arrive, and did they open it?". Because the recipient set is closed, the useful
  view is a roster rather than an event stream — "Priya has it, Marcus never
  opened the mail" is the actual question, and it doubles as the nudge list.
-->
<template>
  <div class="sld">
    <p v-if="error" class="sld-err">{{ error }}</p>

    <!-- ── roster ─────────────────────────────────────────────────────── -->
    <h4>Who it's for</h4>
    <ul class="sld-list">
      <li v-for="r in recipients" :key="r.email" class="sld-row">
        <span class="sld-who">{{ r.email }}</span>
        <span class="sld-st" :data-st="r.status">{{ recipientLabel(r) }}</span>
        <span v-if="r.failed_codes > 2" class="sld-warn" title="Repeated wrong codes">
          ⚠ code attempts failing
        </span>
        <button v-if="!r.removed_at" class="sld-btn" @click="remove(r.email)">Remove</button>
      </li>
      <li v-if="!recipients.length" class="muted">No recipients.</li>
    </ul>

    <div class="sld-add">
      <input
        v-model="newEmail"
        type="email"
        placeholder="add another address"
        @keyup.enter="add"
      />
      <button class="sld-btn" :disabled="!newEmail.trim()" @click="add">Add</button>
    </div>
    <!-- Adding widens who can reach the resource, so it is audited as a
         permission change. Say that rather than let it feel like an edit. -->
    <small class="muted">
      Adding an address lets that person use this link. They still need a code,
      and you still send them the link yourself.
    </small>

    <!-- ── ledger ─────────────────────────────────────────────────────── -->
    <h4>Activity</h4>
    <ul class="sld-list">
      <li v-for="d in redemptions" :key="d.redemption_uid" class="sld-row">
        <span class="sld-who">{{ d.verified_email }}</span>
        <time :title="d.opened_at">{{ ago(d.opened_at) }}</time>
        <span class="muted">{{ movedLabel(d) }}</span>
        <span v-if="d.source_addr" class="muted sld-ip">{{ d.source_addr }}</span>
        <!-- For a drop, "what did they send us" should be one click. -->
        <RouterLink v-if="d.result_uid" :to="`/preview/${d.result_uid}`" class="sld-link">
          open file
        </RouterLink>
      </li>
      <li v-if="!redemptions.length" class="muted">
        Nobody has used this link yet.
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  shareService, type ShareRecipient, type ShareRedemption,
} from '@/services/shareService'
import { errorMessage } from '@/services/apiClient'

const props = defineProps<{ linkUid: string }>()

const recipients = ref<ShareRecipient[]>([])
const redemptions = ref<ShareRedemption[]>([])
const newEmail = ref('')
const error = ref('')

/**
 * The status ladder. "On the list" deliberately does NOT claim they were
 * contacted — v1 mails no invite, so the system knows nothing about whether
 * they received anything.
 *
 * "Opened" is evidence, not proof: anyone holding the URL can trigger a code
 * request for a listed address, so the wording stays weaker than the timestamp
 * might tempt one to write.
 */
function recipientLabel(r: ShareRecipient): string {
  if (r.removed_at) return 'Removed'
  if (r.last_used_at) return r.uses_consumed > 1 ? `Used ${r.uses_consumed}×` : 'Used'
  if (r.first_verified_at) return 'Verified'
  if (r.last_code_sent_at) return 'A code was requested'
  return 'On the list'
}

function movedLabel(d: ShareRedemption): string {
  if (d.files_moved) return `${d.files_moved} file${d.files_moved > 1 ? 's' : ''}`
  if (d.bytes_moved) return human(d.bytes_moved)
  return d.completed_at ? 'nothing transferred' : 'opened'
}

function human(bytes: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1 }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

function ago(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

async function load() {
  error.value = ''
  try {
    const [rs, ds] = await Promise.all([
      shareService.recipients(props.linkUid, true),
      shareService.redemptions(props.linkUid),
    ])
    recipients.value = rs
    redemptions.value = ds
  } catch (e) {
    error.value = errorMessage(e, 'Could not load this link’s activity')
  }
}

async function add() {
  const email = newEmail.value.trim().toLowerCase()
  if (!email) return
  try {
    await shareService.addRecipient(props.linkUid, email)
    newEmail.value = ''
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not add that address')
  }
}

async function remove(email: string) {
  try {
    // A partial revoke: this address loses access, the link keeps working for
    // everyone else — cheaper than re-issuing, which would invalidate the URL
    // for people who already have it.
    await shareService.removeRecipient(props.linkUid, email)
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not remove that address')
  }
}

watch(() => props.linkUid, () => void load(), { immediate: true })
</script>

<style scoped>
/* Theme tokens throughout, never literal greys. The global
   `button { color: inherit }` gives buttons the theme ink — light in dark mode —
   so anything that sets no background of its own ends up light-on-light. Badges
   have the same problem: a hardcoded #eee fill under light ink is unreadable. */
.sld { padding: .4rem 0 .2rem 1rem; border-left: 2px solid var(--border); }
.sld h4 { margin: .5rem 0 .25rem; font-size: .8rem; text-transform: uppercase; color: var(--muted); }
.sld-list { list-style: none; margin: 0; padding: 0; }
.sld-row { display: flex; align-items: center; gap: .5rem; padding: .2rem 0; flex-wrap: wrap; }
.sld-who { font-size: .85rem; }
.sld-st {
  font-size: .75rem; padding: .05rem .35rem; border-radius: .25rem;
  background: var(--bg); border: 1px solid var(--border); color: var(--fg);
}
/* Tinted by INK rather than fill: a fill light enough to read against dark ink
   is too light to read against light ink, and vice versa. */
.sld-st[data-st='used'] { color: var(--success); border-color: var(--success); }
.sld-st[data-st='removed'] { color: var(--muted); text-decoration: line-through; }
.sld-warn { font-size: .75rem; color: var(--danger); }
.sld-ip { font-family: monospace; font-size: .75rem; }
.sld-btn {
  padding: .1rem .4rem; font-size: .75rem; cursor: pointer;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--card); color: var(--fg);
}
.sld-btn:hover { border-color: var(--primary); }
.sld-add { display: flex; gap: .4rem; margin: .3rem 0; }
.sld-add input { flex: 1; }
.sld-link { font-size: .75rem; }
.sld-err { color: var(--danger); font-size: .8rem; }
.muted { color: var(--muted); font-size: .8rem; }
time { font-size: .75rem; color: var(--muted); }
</style>
