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
  What is currently reachable from outside this tenant, by whom, and who left
  that door open.

  Not a report — a working queue. The default is live links only, ordered by
  risk (the server owns that ordering), because a hundred expired links are
  noise and one live link on a project root shared with eleven outside
  addresses is the finding.
-->
<template>
  <div class="ash">
    <AppNav />
    <main class="ash-main">
      <header class="ash-head">
        <h1>Shared outside</h1>
        <p class="muted">
          Links that let people without an account reach this tenant's files.
        </p>
      </header>

      <!-- Reachable by URL with the nav entry hidden, so it answers for itself
           rather than showing an empty queue that reads as "nothing is shared"
           when the truth is that nothing can be. -->
      <p v-if="!features.sharing" class="ash-empty">
        This deployment does not run the sharing service, so no files can be
        shared outside it.
      </p>

      <!-- ── filters ──────────────────────────────────────────────────── -->
      <section v-if="features.sharing" class="ash-filters">
        <label>
          <span>Creator</span>
          <input
            v-model="filters.creator" type="text" placeholder="who shared it"
            @keyup.enter="load"
          />
        </label>
        <label>
          <span>Recipient or domain</span>
          <!-- The question that arrives when a relationship ends. Substring,
               so @contractor.example answers it for the whole company. -->
          <input
            v-model="filters.recipient" type="text" placeholder="@contractor.example"
            @keyup.enter="load"
          />
        </label>
        <label>
          <span>Folder</span>
          <input
            v-model="filters.subtree" type="text" placeholder="/projects/acme"
            @keyup.enter="load"
          />
        </label>
        <label>
          <span>Status</span>
          <select v-model="statusChoice" @change="load">
            <option value="live">Live only</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="exhausted">Used up</option>
            <option value="blocked">Locked out</option>
            <option value="all">Everything</option>
          </select>
        </label>
        <button class="ash-btn" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Apply' }}
        </button>
        <button v-if="anyFilter" class="ash-btn" @click="clearFilters">Clear</button>
      </section>

      <p v-if="error" class="ash-err">{{ error }}</p>

      <!--
        Offered only when a creator filter is active. "Revoke everything
        matching whatever is on screen" is too easy to fire with a half-typed
        filter; the departed-employee case is specifically per-person.
      -->
      <div v-if="filters.creator && rows.length" class="ash-bulk">
        <button class="ash-btn danger" :disabled="loading" @click="askRevokeAll">
          Revoke all {{ rows.length }} link{{ rows.length === 1 ? '' : 's' }}
          from {{ filters.creator }}
        </button>
        <span v-if="confirmAll" class="ash-confirm">
          This ends access for everyone holding those links.
          <button class="ash-btn danger" @click="revokeAll">Yes, revoke</button>
          <button class="ash-btn" @click="confirmAll = false">Cancel</button>
        </span>
      </div>

      <!--
        Never a silent cap. An admin who closes a review believing they saw
        everything is the failure this whole console exists to prevent.
      -->
      <p v-if="truncated" class="ash-trunc">
        Showing the first {{ rows.length }} — there are more. Narrow the filters
        to see the rest.
      </p>

      <!-- ── the queue ────────────────────────────────────────────────── -->
      <table v-if="rows.length" class="ash-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Kind</th>
            <th>Creator</th>
            <th>Recipients</th>
            <th>Status</th>
            <th>Expires</th>
            <th>Uses</th>
            <th>Last activity</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.link_uid" :class="{ dead: r.status !== 'active' }">
            <td>
              <!--
                Deep-links into the ordinary browser, where the admin's OWN ACLs
                apply. The console must not become a way to read content its
                holder is not otherwise entitled to.
              -->
              <RouterLink :to="browseTo(r)" class="ash-res"
                          :title="r.resource_path || r.resource_uid">
                {{ shortPath(r) }}
              </RouterLink>
              <small v-if="r.resource_path" class="muted"> at share time</small>
            </td>
            <td>{{ kindLabel(r.kind) }}</td>
            <td>
              <button class="ash-linkish" @click="filterCreator(r.creator)">
                {{ r.creator }}
              </button>
            </td>
            <td>{{ r.recipient_count }}</td>
            <td><span class="ash-st" :data-st="r.status">{{ r.status }}</span></td>
            <td>{{ until(r.expires_at) }}</td>
            <td>{{ r.max_uses ? `${r.uses_consumed} / ${r.max_uses}` : r.uses_consumed }}</td>
            <td>{{ r.last_activity ? ago(r.last_activity) : '—' }}</td>
            <td>
              <button
                v-if="r.status !== 'revoked'" class="ash-btn danger"
                @click="revokeOne(r)"
              >
                {{ confirmUid === r.link_uid ? 'Confirm' : 'Revoke' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Only when sharing exists. Otherwise this would report "nothing is
           shared outside this tenant", which is true and misleading: it reads
           as a clean bill of health rather than a service that is not there. -->
      <p v-else-if="!loading && features.sharing" class="muted ash-empty">
        {{ anyFilter ? 'Nothing matches those filters.'
                     : 'Nothing is shared outside this tenant right now.' }}
      </p>

      <!--
        The honest caveat. Revocation is not a recall, and an oversight console
        that implies otherwise is worse than none.
      -->
      <p class="ash-caveat muted">
        Revoking stops future use. It does not un-send anything already
        downloaded.
      </p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import { useCapabilities } from '@/composables/useCapabilities'
import { shareService, type AdminShareLink } from '@/services/shareService'
import { errorMessage } from '@/services/apiClient'

const { features } = useCapabilities()
const rows = ref<AdminShareLink[]>([])
const loading = ref(false)
const error = ref('')
const confirmUid = ref('')
const confirmAll = ref(false)
const truncated = ref(false)
const statusChoice = ref('live')

const filters = reactive({ creator: '', recipient: '', subtree: '' })

const anyFilter = computed(() =>
  !!(filters.creator || filters.recipient || filters.subtree) || statusChoice.value !== 'live')

/**
 * Into the ordinary file browser, which takes `?folder=` or `?file=` — a file
 * link points at a file, the other two kinds at a folder. Whatever the admin's
 * own ACLs say applies there; nothing is bypassed by having arrived from here.
 */
function browseTo(r: AdminShareLink) {
  return r.kind === 0
    ? { path: '/files', query: { file: r.resource_uid } }
    : { path: '/files', query: { folder: r.resource_uid } }
}

function kindLabel(kind: number): string {
  return kind === 1 ? 'Drop box' : kind === 2 ? 'Folder' : 'File'
}

/** The tail of the path — a full path eats the row, and the tail identifies it. */
function shortPath(r: AdminShareLink): string {
  if (!r.resource_path) return r.resource_uid.slice(0, 8)
  const parts = r.resource_path.split('/').filter(Boolean)
  return parts.length <= 2 ? r.resource_path : `…/${parts.slice(-2).join('/')}`
}

function until(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'expired'
  const d = Math.floor(ms / 86400000)
  if (d >= 1) return `${d}d`
  const h = Math.floor(ms / 3600000)
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60000))}m`
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (Number.isNaN(s)) return ''
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

async function load() {
  loading.value = true
  error.value = ''
  confirmUid.value = ''
  confirmAll.value = false
  try {
    const res = await shareService.listTenant({
      // "live" is a scope, the rest are status values — the server takes them
      // as separate parameters, so they are separated here rather than in it.
      live: statusChoice.value === 'live',
      status: ['live', 'all'].includes(statusChoice.value) ? '' : statusChoice.value,
      creator: filters.creator.trim(),
      recipient: filters.recipient.trim(),
      subtree: filters.subtree.trim(),
    })
    rows.value = res.links
    truncated.value = res.truncated
  } catch (e) {
    error.value = errorMessage(e, 'Could not load the tenant’s share links')
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  filters.creator = ''
  filters.recipient = ''
  filters.subtree = ''
  statusChoice.value = 'live'
  void load()
}

function filterCreator(who: string) {
  // One click from "who is this?" to "show me every door they left open".
  filters.creator = who
  void load()
}

async function revokeOne(r: AdminShareLink) {
  // Two-step in place rather than a modal: revocation is irreversible for the
  // people holding the URL, and a mis-click on a dense table is easy.
  if (confirmUid.value !== r.link_uid) {
    confirmUid.value = r.link_uid
    return
  }
  try {
    await shareService.revoke(r.link_uid)
    await load()
  } catch (e) {
    error.value = errorMessage(e, 'Could not revoke that link')
  }
}

/**
 * Two functions rather than one with a `confirmed` flag. Bound directly to
 * @click, a flag parameter receives the PointerEvent — which is truthy, so the
 * first click would bulk-revoke with no confirmation at all. Splitting them
 * makes that unrepresentable instead of a comment nobody reads.
 */
function askRevokeAll() {
  confirmAll.value = true
}

async function revokeAll() {
  confirmAll.value = false
  try {
    const n = await shareService.revokeAllFor(filters.creator.trim())
    // After the reload, not before: load() clears `error` on the way in, so a
    // message set first is wiped and the admin sees a silently unchanged list.
    await load()
    if (!n) error.value = 'Nothing was revoked — those links were already closed.'
  } catch (e) {
    error.value = errorMessage(e, 'Could not revoke those links')
  }
}

onMounted(() => void load())
</script>

<style scoped>
/* Theme tokens only. A button that sets no background keeps the UA's light grey
   while the global `button { color: inherit }` gives it light ink in dark mode —
   light-on-light. Badges fail the same way with a hardcoded fill. */
.ash-main { padding: 1rem; }
.ash-head h1 { font-size: 1.2rem; margin: 0 0 .2rem; }
.ash-filters { display: flex; gap: .6rem; flex-wrap: wrap; align-items: flex-end; margin: .8rem 0; }
.ash-filters label { display: flex; flex-direction: column; gap: .15rem; }
.ash-filters span { font-size: .75rem; font-weight: 600; }
.ash-btn {
  padding: .3rem .7rem; cursor: pointer;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--card); color: var(--fg);
}
.ash-btn:hover:not(:disabled) { border-color: var(--primary); }
.ash-btn:disabled { opacity: .5; cursor: not-allowed; }
.ash-btn.danger { color: var(--danger); border-color: var(--danger); }
.ash-bulk { margin: .5rem 0; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.ash-confirm { font-size: .85rem; display: flex; gap: .4rem; align-items: center; }
.ash-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.ash-table th { text-align: left; font-size: .75rem; text-transform: uppercase; color: var(--muted); }
.ash-table td, .ash-table th { padding: .3rem .4rem; border-bottom: 1px solid var(--border); }
.ash-table tr.dead { color: var(--muted); }
.ash-res { font-family: monospace; }
.ash-linkish { background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; font: inherit; color: inherit; }
.ash-st {
  font-size: .75rem; padding: .05rem .35rem; border-radius: .25rem;
  background: var(--bg); border: 1px solid var(--border); color: var(--fg);
}
.ash-st[data-st='active'] { color: var(--success); border-color: var(--success); }
.ash-st[data-st='revoked'] { color: var(--muted); }
.ash-st[data-st='blocked'] { color: var(--danger); border-color: var(--danger); }
.ash-err { color: var(--danger); font-size: .85rem; }
/* No warning token in the palette; danger is the honest nearest neighbour and
   truncation IS a "you are not seeing everything" warning. */
.ash-trunc { font-size: .8rem; color: var(--danger); }
.ash-empty { margin: 1.5rem 0; }
.ash-caveat { margin-top: 1rem; font-size: .8rem; }
.muted { color: var(--muted); }
</style>
