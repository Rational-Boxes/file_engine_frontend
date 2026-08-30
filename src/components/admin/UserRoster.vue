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
  The Users tab: who is in this workspace, opened one at a time in the profile
  modal.

  Two searches live here and they are not the same thing, so they are visually
  separate. The roster filter narrows a list we already hold. The directory
  lookup below it reaches the *global* user base, which is search-only by design
  (SPECIFICATION §6) — it exists to find someone who already has an account
  elsewhere so they can be invited into this workspace, and it is the only search
  that can return a non-member.
-->

<template>
  <section class="ur">
    <p v-if="error" class="ur-err" role="alert">{{ error }}</p>

    <!-- ------------------------------ roster ------------------------------ -->
    <header class="ur-head">
      <div>
        <h2>Users</h2>
        <p class="ur-sub">
          {{ roster.length }} {{ roster.length === 1 ? 'person has' : 'people have' }}
          access to this workspace.
        </p>
      </div>
      <div class="ur-head-actions">
        <input
          v-model="filter"
          class="ur-filter"
          type="search"
          placeholder="Filter by name, email or role"
          aria-label="Filter the roster"
        />
        <button class="ur-btn ur-primary" type="button" @click="inviting = true">
          Invite a new user
        </button>
      </div>
    </header>
    <p v-if="invited" class="ur-ok">Invited {{ invited }} &mdash; they have been emailed a set-password link ✓</p>

    <p v-if="loading" class="ur-muted">Loading the roster…</p>
    <table v-else-if="visible.length" class="ur-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Roles</th>
          <th><span class="ur-sr">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in visible" :key="u.uid" class="ur-row" @click="open(u.uid)">
          <td>
            <button class="ur-name" type="button" @click.stop="open(u.uid)">
              {{ u.display_name || u.uid }}
            </button>
            <span class="ur-email">{{ u.email }}</span>
          </td>
          <td>
            <span v-for="r in u.roles" :key="r" class="ur-chip" :class="{ 'ur-chip-admin': r === ADMINS }">
              {{ r }}
            </span>
            <!-- A group member whose account no longer exists. Surfaced rather
                 than hidden, because only an admin can clear it. -->
            <span v-if="u.orphaned" class="ur-chip ur-chip-warn" title="No account exists for this member">
              deleted account
            </span>
          </td>
          <td class="ur-right">
            <span v-if="u.uid === selfUid" class="ur-you">you</span>
            <button class="ur-link" type="button" @click.stop="open(u.uid)">Manage</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="filter" class="ur-muted">No one matches “{{ filter }}”.</p>
    <p v-else class="ur-muted">No users yet — invite someone with the button above.</p>

    <!-- ---------------------- global directory lookup ---------------------- -->
    <section class="ur-block">
      <h2>Add someone who already has an account</h2>
      <p class="ur-sub">
        People are shared across workspaces. Search the directory by exact email or a
        3-character prefix — it never lists everyone.
      </p>
      <div class="ur-fields">
        <input
          v-model="userQuery"
          placeholder="exact email / uid or ≥3-char prefix"
          @keyup.enter="search"
        />
        <button class="ur-btn" type="button" :disabled="userQuery.length < 3 || busy" @click="search">
          Search
        </button>
      </div>
      <ul class="ur-list">
        <li v-for="u in found" :key="u.uid">
          <span class="ur-grow">
            {{ u.display_name || u.uid }} <span class="ur-email">{{ u.email }}</span>
          </span>
          <template v-if="u.in_this_tenant">
            <span class="ur-chip">in this workspace</span>
            <button class="ur-link" type="button" @click="open(u.uid)">Manage</button>
          </template>
          <template v-else>
            <select v-model="addRole[u.uid]" class="ur-select" :aria-label="`Role for ${u.uid}`">
              <option value="">Choose a role…</option>
              <option v-for="r in roles" :key="r.name" :value="r.name">{{ r.name }}</option>
            </select>
            <button
              class="ur-link"
              type="button"
              :disabled="!addRole[u.uid] || busy"
              @click="addToTenant(u.uid)"
            >
              Add
            </button>
            <!-- For someone who has an account but never set a password. Members
                 get the same action inside their profile. -->
            <button class="ur-link" type="button" :disabled="busy" @click="reinvite(u.uid)">
              Re-send invite
            </button>
          </template>
        </li>
        <li v-if="searched && !found.length" class="ur-muted">No matching users.</li>
      </ul>
      <p v-if="reinvited" class="ur-ok">Invite re-sent to {{ reinvited }} ✓</p>
    </section>

    <InviteUserModal
      :open="inviting"
      :roles="roles"
      @close="inviting = false"
      @invited="onInvited"
    />

    <UserProfileModal
      :uid="openUid"
      :roles="roles"
      :self-uid="selfUid"
      @close="openUid = null"
      @changed="reload"
      @removed="onRemoved"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import InviteUserModal from '@/components/admin/InviteUserModal.vue'
import UserProfileModal from '@/components/admin/UserProfileModal.vue'
import {
  ldapAdminService,
  type Role,
  type RosterUser,
  type UserSummary,
} from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

// The tenant's roles are owned by the parent (the Roles tab edits them) and
// passed down, so both tabs always agree on the list. Read in the template only.
defineProps<{
  roles: Role[]
  selfUid: string
}>()

const emit = defineEmits<{
  // Membership changed, so the parent's role member-counts are now stale.
  (e: 'roles-changed'): void
}>()

const ADMINS = 'administrators'

const roster = ref<RosterUser[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const filter = ref('')
const openUid = ref<string | null>(null)

const inviting = ref(false)
const invited = ref('')

const userQuery = ref('')
const found = ref<UserSummary[]>([])
const searched = ref(false)
const reinvited = ref('')
const addRole = reactive<Record<string, string>>({})

const visible = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return roster.value
  return roster.value.filter((u) =>
    [u.display_name, u.email, u.uid, ...u.roles].some((f) => (f || '').toLowerCase().includes(q)),
  )
})

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    roster.value = await ldapAdminService.listTenantUsers()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load the user roster')
  } finally {
    loading.value = false
  }
}

// A membership change moves member counts on the Roles tab too, so the parent
// hears about it whenever the roster is refreshed for that reason.
async function reload() {
  await load()
  emit('roles-changed')
}

function open(uid: string) {
  openUid.value = uid
}

function onRemoved(uid: string) {
  // Drop the row immediately — the reload confirms it, but the list should not
  // still show someone the admin just removed.
  roster.value = roster.value.filter((u) => u.uid !== uid)
  found.value = []
  searched.value = false
  void reload()
}

async function run(fn: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = errorMessage(e, 'Request failed')
  } finally {
    busy.value = false
  }
}

// The modal owns the form and the request; the roster only has to catch up.
function onInvited(email: string) {
  invited.value = email
  void reload()
}

const reinvite = (uid: string) =>
  run(async () => {
    await ldapAdminService.reinvite(uid)
    reinvited.value = uid
  })

const search = () =>
  run(async () => {
    found.value = await ldapAdminService.findUsers(userQuery.value)
    searched.value = true
  })

const addToTenant = (uid: string) =>
  run(async () => {
    const role = addRole[uid]
    if (!role) return
    await ldapAdminService.addMember(role, uid)
    delete addRole[uid]
    // Re-run the lookup so the row flips to "in this workspace" rather than
    // sitting there still offering to add them again.
    found.value = await ldapAdminService.findUsers(userQuery.value)
    await reload()
  })
</script>

<style scoped>
.ur { display: flex; flex-direction: column; gap: 10px; }
.ur-head { display: flex; gap: 12px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
.ur-head h2 { margin: 0; font-size: 15px; }
.ur-sub { margin: 2px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.ur-head-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ur-filter { flex: 0 1 260px; min-width: 180px; }

.ur-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ur-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.ur-table td { padding: 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.ur-row { cursor: pointer; }
.ur-row:hover { background: var(--bg); }
.ur-name { display: block; border: none; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--fg); cursor: pointer; text-align: left; }
.ur-row:hover .ur-name { color: var(--primary); }
.ur-email { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.ur-right { text-align: right; white-space: nowrap; }
.ur-you { color: var(--muted); font-size: 11px; margin-right: 8px; }
.ur-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.ur-chip { display: inline-block; font-size: 10px; background: var(--bg); border: 1px solid var(--border); color: var(--muted); padding: 1px 8px; border-radius: 999px; margin: 1px 4px 1px 0; }
.ur-chip-admin { border-color: var(--primary); color: var(--primary); }
.ur-chip-warn { border-color: var(--danger); color: var(--danger); }

.ur-block { border-top: 1px solid var(--border); padding-top: 14px; margin-top: 8px; }
.ur-block h2 { margin: 0; font-size: 15px; }
.ur-fields { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.ur-fields input { flex: 1; min-width: 160px; }
.ur-list { list-style: none; padding: 0; margin: 8px 0 0; }
.ur-list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-top: 1px solid var(--border); flex-wrap: wrap; }
.ur-grow { flex: 1; min-width: 160px; }

input, .ur-select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; background: var(--card); color: var(--fg); }
.ur-btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg); font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.ur-btn:hover:not(:disabled) { border-color: var(--primary); }
.ur-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.ur-primary:hover:not(:disabled) { filter: brightness(1.08); }
.ur-btn:disabled, .ur-link:disabled { opacity: 0.5; cursor: not-allowed; }
.ur-link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; padding: 0; }
.ur-muted { color: var(--muted); font-size: 13px; }
.ur-ok { color: var(--success); font-size: 13px; }
.ur-err { color: var(--danger); font-size: 13px; }
</style>
