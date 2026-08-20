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
  "What have I got open right now" — the standing answer, beside ReviewsInbox
  and in the same idiom.

  Grouped rather than flat, because the three groups want different reactions:
  something is wrong, something arrived, and everything else is fine. Expired and
  revoked links are absent on purpose — the Share tab is where history lives;
  this is a working view.

  This is YOUR links. The tenant-wide view is a separate admin surface.
-->
<template>
  <section v-if="show" class="si">
    <h2>Sharing</h2>

    <p v-if="error" class="si-err">{{ error }}</p>

    <!--
      Empty most days, and that emptiness is the point — so the heading only
      appears when there is something in it.
    -->
    <template v-if="inbox.needsAttention.length">
      <h3 class="si-group si-warn">Needs attention</h3>
      <ul class="si-list">
        <li v-for="l in inbox.needsAttention" :key="l.link_uid" class="si-row">
          <RouterLink :to="shareTab(l)" class="si-what">{{ label(l) }}</RouterLink>
          <!-- The sentence the creator can act on, from the pre-flight. -->
          <span class="si-why">{{ l.not_working_message || statusWord(l) }}</span>
        </li>
      </ul>
    </template>

    <template v-if="inbox.dropBoxes.length">
      <h3 class="si-group">Drop boxes</h3>
      <ul class="si-list">
        <li v-for="l in inbox.dropBoxes" :key="l.link_uid" class="si-row">
          <RouterLink :to="shareTab(l)" class="si-what">{{ label(l) }}</RouterLink>
          <!-- A drop box is a thing you are WAITING ON, so what has landed
               matters more than how much budget is left. -->
          <span class="muted">{{ dropSummary(l) }}</span>
        </li>
      </ul>
    </template>

    <template v-if="inbox.active.length">
      <h3 class="si-group">Active links</h3>
      <ul class="si-list">
        <li v-for="l in inbox.active" :key="l.link_uid" class="si-row">
          <RouterLink :to="shareTab(l)" class="si-what">{{ label(l) }}</RouterLink>
          <span class="si-st" :data-st="l.status">{{ statusWord(l) }}</span>
          <span class="muted">{{ usesLabel(l) }} · {{ until(l.expires_at) }} left</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { shareService, type InboxShareLink, type SharingInbox } from '@/services/shareService'

const inbox = ref<SharingInbox>({ needsAttention: [], dropBoxes: [], active: [] })
const error = ref('')
const loaded = ref(false)

// Nothing open and nothing wrong means no panel at all — an empty "Sharing"
// heading is noise on a dashboard for the many users who never share anything.
const show = computed(() =>
  !!error.value || inbox.value.needsAttention.length
    || inbox.value.dropBoxes.length || inbox.value.active.length)

function label(l: InboxShareLink): string {
  if (l.note) return l.note
  return l.kind === 1 ? 'Drop box' : l.kind === 2 ? 'Shared folder' : 'Shared file'
}

function statusWord(l: InboxShareLink): string {
  return l.status === 'not_working' ? 'Not working'
    : l.status === 'blocked' ? 'Locked out'
    : l.status === 'exhausted' ? 'Used up'
    : 'Active'
}

function usesLabel(l: InboxShareLink): string {
  return l.max_uses ? `${l.uses_consumed} / ${l.max_uses} used`
    : `${l.uses_consumed} used`
}

function dropSummary(l: InboxShareLink): string {
  const files = l.max_files ? `${l.files_consumed} of ${l.max_files} files`
    : `${l.files_consumed} file${l.files_consumed === 1 ? '' : 's'}`
  return `${files} · ${l.recipient_count} sender${l.recipient_count === 1 ? '' : 's'}`
}

function until(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return 'no time'
  const d = Math.floor(ms / 86400000)
  if (d >= 1) return `${d}d`
  const h = Math.floor(ms / 3600000)
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60000))}m`
}

/** Every row goes to the resource's Share tab — never a preview route, which
 *  does not exist for a folder at all. */
function shareTab(l: InboxShareLink) {
  return l.kind === 0
    ? { path: '/files', query: { file: l.resource_uid, tab: 'share' } }
    : { path: '/files', query: { folder: l.resource_uid, tab: 'share' } }
}

onMounted(async () => {
  try {
    inbox.value = await shareService.inbox()
  } catch {
    // Sharing may be switched off for the deployment, in which case this is a
    // 404 and silence is right. Only a loaded-but-failed state is worth saying.
    error.value = ''
  } finally {
    loaded.value = true
  }
})
</script>

<style scoped>
/* Theme tokens only — a literal grey is right in exactly one theme. */
.si { margin: .5rem 0; }
.si h2 { font-size: .95rem; margin: 0 0 .3rem; }
.si-group { font-size: .75rem; text-transform: uppercase; color: var(--muted); margin: .5rem 0 .15rem; }
.si-group.si-warn { color: var(--danger); }
.si-list { list-style: none; margin: 0; padding: 0; }
.si-row { display: flex; gap: .5rem; align-items: baseline; flex-wrap: wrap; padding: .15rem 0; }
.si-what { font-size: .85rem; }
.si-why { font-size: .8rem; color: var(--danger); }
.si-st {
  font-size: .72rem; padding: .05rem .3rem; border-radius: .25rem;
  background: var(--bg); border: 1px solid var(--border); color: var(--fg);
}
.si-st[data-st='active'] { color: var(--success); border-color: var(--success); }
.si-err { color: var(--danger); font-size: .8rem; }
.muted { color: var(--muted); font-size: .8rem; }
</style>
