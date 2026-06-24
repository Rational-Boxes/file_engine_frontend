<template>
  <div class="admin-roles">
    <AppNav />
    <main class="content">
      <AdminTabs />
      <h1 class="title">Role management</h1>
      <p v-if="error" class="err">{{ error }}</p>

      <div class="cols">
        <!-- Roles -->
        <section class="panel">
          <h2 class="panel-head">Roles</h2>
          <ul class="role-list">
            <li
              v-for="r in roles"
              :key="r"
              :class="{ active: r === selected }"
              @click="select(r)"
            >
              <span class="role-name">{{ r }}</span>
              <button class="link danger" :disabled="busy" @click.stop="remove(r)">delete</button>
            </li>
            <li v-if="!roles.length && !loading" class="muted">No roles.</li>
          </ul>
          <form class="add-role" @submit.prevent="create">
            <input v-model="newRole" placeholder="new role name" />
            <button class="btn" type="submit" :disabled="!newRole.trim() || busy">Create</button>
          </form>
        </section>

        <!-- Members of the selected role -->
        <section class="panel">
          <h2 class="panel-head">
            Members<span v-if="selected"> · {{ selected }}</span>
          </h2>
          <template v-if="selected">
            <ul class="member-list">
              <li v-for="u in members" :key="u">
                <span class="member-name">{{ u }}</span>
                <button class="link danger" :disabled="busy" @click="removeMember(u)">remove</button>
              </li>
              <li v-if="!members.length" class="muted">No members.</li>
            </ul>
            <div class="add-member">
              <p class="muted">Add a user</p>
              <PrincipalPicker :types="['user']" placeholder="Search users…" @select="addMember" />
            </div>
          </template>
          <p v-else class="muted">Select a role to view its members.</p>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppNav from '@/components/AppNav.vue'
import AdminTabs from '@/components/AdminTabs.vue'
import PrincipalPicker from '@/components/PrincipalPicker.vue'
import { roleService } from '@/services/roleService'
import { errorMessage } from '@/services/apiClient'
import type { Principal } from '@/types'

const roles = ref<string[]>([])
const selected = ref('')
const members = ref<string[]>([])
const newRole = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')

onMounted(loadRoles)

async function loadRoles() {
  loading.value = true
  error.value = ''
  try {
    roles.value = await roleService.listRoles()
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load roles')
  } finally {
    loading.value = false
  }
}

async function select(role: string) {
  selected.value = role
  members.value = []
  try {
    members.value = await roleService.usersInRole(role)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load members')
  }
}

async function create() {
  const name = newRole.value.trim()
  if (!name) return
  busy.value = true
  error.value = ''
  try {
    await roleService.createRole(name)
    newRole.value = ''
    await loadRoles()
  } catch (e) {
    error.value = errorMessage(e, 'Failed to create role')
  } finally {
    busy.value = false
  }
}

async function remove(role: string) {
  busy.value = true
  error.value = ''
  try {
    await roleService.deleteRole(role)
    if (selected.value === role) {
      selected.value = ''
      members.value = []
    }
    await loadRoles()
  } catch (e) {
    error.value = errorMessage(e, 'Failed to delete role')
  } finally {
    busy.value = false
  }
}

async function addMember(p: Principal) {
  if (!selected.value || p.kind !== 'user') return
  busy.value = true
  error.value = ''
  try {
    await roleService.assignUser(selected.value, p.value)
    members.value = await roleService.usersInRole(selected.value)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to add member')
  } finally {
    busy.value = false
  }
}

async function removeMember(user: string) {
  if (!selected.value) return
  busy.value = true
  error.value = ''
  try {
    await roleService.removeUser(selected.value, user)
    members.value = await roleService.usersInRole(selected.value)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to remove member')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.content {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 18px;
}

.title {
  font-size: 20px;
  margin: 0 0 16px;
}

.err {
  color: var(--danger);
  font-size: 13px;
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.panel {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.panel-head {
  font-size: 14px;
  margin: 0 0 10px;
}

.role-list,
.member-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.role-list li,
.member-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 13px;
}

.role-list li {
  cursor: pointer;
}

.role-list li.active {
  background: var(--bg);
  font-weight: 600;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}

.add-role,
.add-member {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.add-member {
  flex-direction: column;
}

.add-role input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
}

.btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-size: 13px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.link {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
}

.link.danger {
  color: var(--danger);
}

.link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
