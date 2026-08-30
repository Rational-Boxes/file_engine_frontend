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
  One tenant member, opened from the roster: who they are, which of this tenant's
  roles they hold, and how to remove them from this workspace. Deleting the global
  account is a sysadmin/LDAP operation and is deliberately not offered here.

  Group membership is edited as a whole set — tick the roles, save once — because
  that is how an admin thinks about it ("Ann is an editor and a reviewer"), and
  because sending the set lets the server diff it and apply the self-removal /
  last-administrator guards to the result rather than to each click.
-->

<template>
  <Teleport to="body">
    <div v-if="uid" class="up-root" role="dialog" aria-modal="true" :aria-label="`Profile: ${uid}`">
      <div class="up-backdrop" @click="close"></div>

      <div ref="panelEl" class="up-panel" @keydown="onKeydown">
        <button ref="closeEl" class="up-x" type="button" title="Close" @click="close">✕</button>

        <p v-if="loading" class="up-muted">Loading…</p>
        <p v-if="error" class="up-err" role="alert">{{ error }}</p>

        <template v-if="user">
          <header class="up-head">
            <img v-if="user.avatar_url" class="up-avatar" :src="user.avatar_url" alt="" />
            <div v-else class="up-avatar up-initials" aria-hidden="true">{{ initials }}</div>
            <div class="up-who">
              <h2 class="up-name">{{ user.display_name || user.uid }}</h2>
              <p class="up-email">{{ user.email }}</p>
              <p class="up-badges">
                <span v-if="user.is_admin" class="up-badge up-badge-admin">Administrator</span>
                <span v-if="isSelf" class="up-badge">This is you</span>
              </p>
            </div>
          </header>

          <dl class="up-facts">
            <div><dt>First name</dt><dd>{{ user.given_name || '—' }}</dd></div>
            <div><dt>Last name</dt><dd>{{ user.surname || '—' }}</dd></div>
            <div><dt>Username</dt><dd>{{ user.uid }}</dd></div>
            <div>
              <dt>Other workspaces</dt>
              <!-- A count, never names: which other tenants use this account is
                   not this tenant admin's business, but the number tells them a
                   removal here still leaves the person access elsewhere. -->
              <dd>{{ user.other_tenant_count || 'none' }}</dd>
            </div>
          </dl>

          <section class="up-section">
            <h3>Group membership</h3>
            <p class="up-sub">Which of this workspace's roles {{ firstName }} holds.</p>
            <ul class="up-roles">
              <li v-for="r in roles" :key="r.name">
                <label class="up-chk">
                  <input
                    type="checkbox"
                    :value="r.name"
                    :checked="draftRoles.includes(r.name)"
                    :disabled="busy || isLockedRole(r.name)"
                    @change="toggleRole(r.name)"
                  />
                  <span>{{ r.name }}</span>
                  <!-- Spelled out rather than a silently disabled box. -->
                  <span v-if="isLockedRole(r.name)" class="up-lock">{{ lockReason }}</span>
                </label>
              </li>
              <li v-if="!roles.length" class="up-muted">This workspace has no roles yet.</li>
            </ul>
            <p v-if="!draftRoles.length" class="up-warn">
              A member must hold at least one role. To take away all access, remove them
              from the workspace below.
            </p>
            <div class="up-actions">
              <button
                class="up-btn up-primary"
                type="button"
                :disabled="busy || !dirty || !draftRoles.length"
                @click="saveRoles"
              >
                Save membership
              </button>
              <button class="up-btn" type="button" :disabled="busy || !dirty" @click="resetRoles">
                Reset
              </button>
              <span v-if="saved" class="up-ok">Saved ✓</span>
            </div>
          </section>

          <section class="up-section">
            <h3>Account</h3>
            <div class="up-actions">
              <button class="up-btn" type="button" :disabled="busy" @click="reinvite">
                Re-send invite email
              </button>
              <span v-if="reinvited" class="up-ok">Invite sent ✓</span>
            </div>
          </section>

          <section class="up-section up-danger-zone">
            <h3>Remove {{ firstName }}</h3>
            <p v-if="isSelf" class="up-sub">
              You cannot remove your own account. Ask another administrator.
            </p>
            <template v-else>
              <div class="up-danger-row">
                <div>
                  <strong>Remove from this workspace</strong>
                  <p class="up-sub">
                    Drops every role they hold here and revokes their WebDAV/MCP keys for
                    this workspace. They lose all access to it; their account, and any other
                    workspace they belong to, are untouched.
                  </p>
                  <p v-if="user.other_tenant_count" class="up-sub">
                    They will still have access to
                    {{ user.other_tenant_count }} other
                    workspace{{ user.other_tenant_count === 1 ? '' : 's' }}.
                  </p>
                </div>
                <button
                  class="up-btn up-danger"
                  type="button"
                  :disabled="busy"
                  @click="confirming = true"
                >
                  Remove from workspace
                </button>
              </div>
              <!-- Deleting the global account itself is a sysadmin operation done in
                   LDAP, not something a tenant admin can do — so no control for it
                   here. -->
            </template>
          </section>
        </template>
      </div>
    </div>
  </Teleport>

  <ConfirmModal
    :open="confirming"
    danger
    title="Remove from this workspace?"
    :message="confirmMessage"
    confirm-label="Remove"
    @cancel="confirming = false"
    @confirm="remove"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import {
  ldapAdminService,
  type AdminUserDetail,
  type Role,
} from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const props = defineProps<{
  // null = closed. The uid, not the roster row, so the modal always shows what
  // the server currently believes rather than a stale copy.
  uid: string | null
  roles: Role[]
  selfUid: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  // Membership changed — the parent reloads the roster and the role counts.
  (e: 'changed'): void
  (e: 'removed', uid: string): void
}>()

const ADMINS = 'administrators'

const user = ref<AdminUserDetail | null>(null)
const draftRoles = ref<string[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const saved = ref(false)
const reinvited = ref(false)
const confirming = ref(false)
const panelEl = ref<HTMLElement | null>(null)
const closeEl = ref<HTMLButtonElement | null>(null)

const isSelf = computed(() => !!user.value && user.value.uid === props.selfUid)
const firstName = computed(
  () => user.value?.given_name || user.value?.display_name?.split(' ')[0] || 'this user',
)
const initials = computed(() => {
  const name = user.value?.display_name || user.value?.uid || ''
  const parts = name.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase()
})
const dirty = computed(() => {
  const before = [...(user.value?.roles || [])].sort().join(' ')
  return before !== [...draftRoles.value].sort().join(' ')
})

// The server enforces both administrator guards; the checkbox reflects the one
// that is knowable here, so an admin does not discover the rule only by having a
// save rejected.
const lockReason = computed(() =>
  isSelf.value ? "you can't remove your own admin rights" : 'the last administrator',
)
function isLockedRole(role: string): boolean {
  if (role !== ADMINS || !user.value?.is_admin) return false
  // Self-removal is the lockout guard and is certain from here. Whether this is
  // the *last* administrator is not (the profile doesn't carry the count), so
  // that one is left to the server to refuse.
  return isSelf.value
}

const confirmMessage = computed(() => {
  const who = user.value?.display_name || user.value?.uid || 'this user'
  return `${who} will lose every role in this workspace and all access to it, and their `
    + 'WebDAV/MCP keys for it will be revoked. Their account stays, so you can add them '
    + 'back later.'
})

watch(
  () => props.uid,
  async (uid) => {
    confirming.value = false
    error.value = ''
    saved.value = false
    reinvited.value = false
    user.value = null
    draftRoles.value = []
    if (!uid) return
    loading.value = true
    try {
      const detail = await ldapAdminService.getUserProfile(uid)
      user.value = detail
      draftRoles.value = [...detail.roles]
    } catch (e) {
      error.value = errorMessage(e, 'Could not load this profile')
    } finally {
      loading.value = false
    }
    await nextTick()
    closeEl.value?.focus()
  },
  { immediate: true },
)

function close() {
  emit('close')
}

function toggleRole(role: string) {
  saved.value = false
  draftRoles.value = draftRoles.value.includes(role)
    ? draftRoles.value.filter((r) => r !== role)
    : [...draftRoles.value, role]
}

function resetRoles() {
  draftRoles.value = [...(user.value?.roles || [])]
  saved.value = false
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

const saveRoles = () =>
  run(async () => {
    if (!user.value) return
    const detail = await ldapAdminService.setUserRoles(user.value.uid, draftRoles.value)
    user.value = detail
    draftRoles.value = [...detail.roles]
    saved.value = true
    emit('changed')
  })

const reinvite = () =>
  run(async () => {
    if (!user.value) return
    await ldapAdminService.reinvite(user.value.uid)
    reinvited.value = true
  })

const remove = () => {
  if (!confirming.value) return
  confirming.value = false
  return run(async () => {
    if (!user.value) return
    const uid = user.value.uid
    await ldapAdminService.removeUser(uid)
    emit('removed', uid)
    close()
  })
}

function onKeydown(e: KeyboardEvent) {
  // While a confirmation is up it owns Escape — otherwise one keypress would
  // dismiss both the prompt and the profile behind it.
  if (e.key === 'Escape' && !confirming.value) {
    e.preventDefault()
    close()
    return
  }
  if (e.key !== 'Tab') return
  const focusable = panelEl.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
  )
  if (!focusable || focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<style scoped>
/* Below ConfirmModal's 1000, so a destructive confirmation stacks on top of the
   profile that launched it. */
.up-root { position: fixed; inset: 0; z-index: 900; display: flex; align-items: center; justify-content: center; }
.up-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.up-panel {
  position: relative; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
  overflow: auto; background: var(--card); color: var(--fg); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); padding: 20px;
}
.up-x { position: absolute; top: 10px; right: 10px; border: none; background: none; color: var(--muted); font-size: 15px; cursor: pointer; line-height: 1; padding: 4px; }
.up-x:hover { color: var(--fg); }

.up-head { display: flex; gap: 14px; align-items: center; padding-right: 24px; }
.up-avatar { width: 52px; height: 52px; border-radius: 50%; flex: 0 0 auto; object-fit: cover; }
.up-initials { display: flex; align-items: center; justify-content: center; background: var(--bg); border: 1px solid var(--border); color: var(--muted); font-size: 18px; font-weight: 600; }
.up-who { min-width: 0; }
.up-name { margin: 0; font-size: 1.15rem; }
.up-email { margin: 2px 0 0; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.up-badges { margin: 6px 0 0; display: flex; gap: 6px; flex-wrap: wrap; }
.up-badge { font-size: 10px; background: var(--bg); border: 1px solid var(--border); color: var(--muted); padding: 1px 8px; border-radius: 999px; }
.up-badge-admin { border-color: var(--primary); color: var(--primary); }

.up-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 16px 0 0; }
.up-facts dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.up-facts dd { margin: 2px 0 0; font-size: 13px; overflow-wrap: anywhere; }

.up-section { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 14px; }
.up-section h3 { margin: 0; font-size: 14px; }
.up-sub { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.up-roles { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 6px; }
.up-chk { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.up-lock { color: var(--muted); font-size: 11px; }
.up-actions { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.up-btn { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 13px; }
.up-btn:hover:not(:disabled) { border-color: var(--primary); }
.up-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.up-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.up-primary:hover:not(:disabled) { filter: brightness(1.08); }
.up-danger { color: var(--danger); border-color: var(--danger); background: transparent; }
.up-danger:hover:not(:disabled) { background: var(--danger); color: #fff; }
.up-danger-zone { border-top-color: var(--danger); }
.up-danger-row { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; margin-top: 12px; }
.up-danger-row > div { min-width: 0; }
.up-danger-row strong { font-size: 13px; }
.up-danger-row .up-btn { flex: 0 0 auto; }

.up-muted { color: var(--muted); font-size: 13px; }
.up-warn { color: var(--danger); font-size: 12px; margin: 8px 0 0; }
.up-err { color: var(--danger); font-size: 13px; margin: 10px 0 0; }
.up-ok { color: var(--success); font-size: 13px; }

@media (max-width: 520px) {
  .up-facts { grid-template-columns: 1fr; }
  .up-danger-row { flex-direction: column; align-items: stretch; }
}
</style>
