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
  <div class="tadmin">
    <AppNav />
    <main class="content">
      <h1>Tenant administration</h1>
      <nav class="tabs">
        <button v-for="t in TABS" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
      </nav>
      <p v-if="error" class="err">{{ error }}</p>

      <!-- ============ USERS ============ -->
      <!-- The roster, the invite form and the directory lookup are one component:
           they all act on the same set of people, and the roster has enough of
           its own state (filter, open profile) to be worth keeping out of here. -->
      <UserRoster
        v-if="tab === 'Users'"
        :roles="roles"
        :self-uid="auth.user || ''"
        @roles-changed="loadRoles"
      />

      <!-- ============ ROLES ============ -->
      <section v-if="tab === 'Roles'" class="panel">
        <h2>Roles</h2>
        <div class="row">
          <input v-model="newRole" placeholder="new role name" @keyup.enter="createRole" />
          <button class="btn" :disabled="!newRole || busy" @click="createRole">Create role</button>
        </div>
        <ul class="list">
          <li v-for="r in roles" :key="r.name" :class="{ active: selectedRole === r.name }">
            <button class="grow rolename" @click="selectRole(r.name)">{{ r.name }} <span class="muted">· {{ r.member_count }} members</span></button>
            <button v-if="r.name !== 'administrators'" class="link danger" @click="deleteRole(r.name)">Delete</button>
          </li>
        </ul>

        <div v-if="selectedRole" class="members">
          <h3>Members of “{{ selectedRole }}”</h3>
          <div class="row">
            <input v-model="newMember" placeholder="user email / uid" @keyup.enter="addMember" />
            <button class="btn" :disabled="!newMember || busy" @click="addMember">Add</button>
          </div>
          <ul class="list">
            <li v-for="m in members" :key="m">
              <span class="grow">{{ m }}</span>
              <button class="link danger" @click="removeMember(m)">Remove</button>
            </li>
            <li v-if="!members.length" class="muted">No members yet.</li>
          </ul>
        </div>
      </section>

      <!-- ============ TWO-FACTOR ============ -->
      <!-- Per-tenant two-factor policy (PROPOSAL §4.8). Its own tab rather than a
           trailer under Roles: it is a tenant-wide security setting and has
           nothing to do with which users hold which role. Each editor brings its
           own panel wrapper, so it is mounted directly. -->
      <TwoFactorPolicyEditor v-if="tab === 'Two-factor'" />

      <!-- ============ WEBDAV ============ -->
      <!-- Per-tenant WebDAV session TTL (PROPOSAL §14.10). -->
      <WebDavSessionTtlEditor v-if="tab === 'WebDAV'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import TwoFactorPolicyEditor from '@/components/TwoFactorPolicyEditor.vue'
import UserRoster from '@/components/admin/UserRoster.vue'
import WebDavSessionTtlEditor from '@/components/WebDavSessionTtlEditor.vue'
import { ldapAdminService, type Role } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'
import { useAuthStore } from '@/stores/auth'

const TABS = ['Users', 'Roles', 'Two-factor', 'WebDAV'] as const
const tab = ref<(typeof TABS)[number]>('Users')
const error = ref('')
const busy = ref(false)
// Who is signed in — the roster marks them, and the profile modal refuses to let
// them remove their own access.
const auth = useAuthStore()

// The roles list is shared: the Roles tab edits it, the Users tab assigns from it.
const roles = ref<Role[]>([])

// roles
const newRole = ref('')
const selectedRole = ref('')
const members = ref<string[]>([])
const newMember = ref('')

onMounted(async () => {
  await loadRoles()
})

function wrap(fn: () => Promise<void>) {
  return async () => {
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
}

async function loadRoles() {
  roles.value = await ldapAdminService.listRoles()
}

// --- roles ---
const createRole = wrap(async () => {
  await ldapAdminService.createRole(newRole.value)
  newRole.value = ''
  await loadRoles()
})
const deleteRole = (name: string) => wrap(async () => {
  await ldapAdminService.deleteRole(name)
  if (selectedRole.value === name) selectedRole.value = ''
  await loadRoles()
})()
const selectRole = (name: string) => wrap(async () => {
  selectedRole.value = name
  members.value = await ldapAdminService.listMembers(name)
})()
const addMember = wrap(async () => {
  await ldapAdminService.addMember(selectedRole.value, newMember.value)
  newMember.value = ''
  members.value = await ldapAdminService.listMembers(selectedRole.value)
  await loadRoles()
})
const removeMember = (uid: string) => wrap(async () => {
  await ldapAdminService.removeMember(selectedRole.value, uid)
  members.value = await ldapAdminService.listMembers(selectedRole.value)
  await loadRoles()
})()
</script>

<style scoped>
.content { max-width: 780px; margin: 0 auto; padding: 20px 18px; }
.tabs { display: flex; gap: 6px; margin: 12px 0; border-bottom: 1px solid var(--border); }
.tabs button { border: none; background: none; padding: 8px 12px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; }
.tabs button.active { color: var(--fg); border-bottom-color: var(--primary); }
.panel { display: flex; flex-direction: column; gap: 10px; }
h2 { font-size: 15px; margin: 12px 0 2px; }
h3 { font-size: 14px; margin: 8px 0 2px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; flex: 1; min-width: 160px; font-family: inherit; }
.list { list-style: none; padding: 0; margin: 4px 0; }
.list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-top: 1px solid var(--border); }
.list li.active { background: #dbeafe; }
.grow { flex: 1; text-align: left; }
.rolename { border: none; background: none; cursor: pointer; font: inherit; }
.muted { color: var(--muted); font-size: 12px; }
.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; flex: 0 0 auto; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { border: none; background: none; color: var(--primary); cursor: pointer; font-size: 13px; }
.link.danger { color: #b00020; }
.err { color: #b00020; font-size: 13px; }
</style>
