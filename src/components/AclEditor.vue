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
  <div class="acl-editor">
    <p v-if="error" class="acl-err">{{ error }}</p>

    <p v-if="loading" class="acl-muted">Loading ACLs…</p>
    <template v-else-if="entries.length">
      <p v-if="canManage" class="acl-order">Evaluation order (top → bottom):</p>
      <table class="acl-list">
      <tbody>
        <tr v-for="(e, idx) in orderedEntries" :key="idx" :class="{ deny: e.effect === 'deny' }">
          <td class="acl-principal">
            <span class="acl-kind" :class="'acl-kind-' + kindOf(e)">{{ kindLabel(kindOf(e)) }}</span>
            <span class="acl-name" :title="e.principal">{{ e.principal }}</span>
          </td>
          <td class="acl-effect">
            <span class="acl-eff" :class="e.effect">{{ e.effect }}</span>
          </td>
          <td class="acl-perms">
            <span v-for="p in decode(e.permissions)" :key="p.key" class="acl-chip">
              {{ p.label }}
              <button
                v-if="canManage"
                class="acl-x"
                :title="`Revoke ${p.label}`"
                @click="revoke(e, p.key)"
              >
                ✕
              </button>
            </span>
          </td>
        </tr>
      </tbody>
      </table>
    </template>
    <p v-else class="acl-muted">No ACL entries.</p>

    <!-- Evaluation-semantics guidance is only useful to users who can alter
         permissions; a read-only viewer just sees the entries. -->
    <p v-if="canManage" class="acl-note">
      Evaluated top-down: User rules, then Roles &amp; Claims, then Everyone —
      within a group, DENY wins. Anything left unset is read-by-default.
      <HelpIcon topic="acl-basics" label="How permissions (ACLs) work" />
    </p>

    <form v-if="canManage" class="acl-add" @submit.prevent>
      <PrincipalPicker @select="onPick" />
      <div v-if="picked" class="acl-picked">
        <span class="acl-kind" :class="'acl-kind-' + picked.kind">{{ kindLabel(picked.kind) }}</span>
        <span class="acl-name">{{ picked.value }}</span>
        <button class="acl-x" title="Clear" @click="picked = null">✕</button>
      </div>
      <div class="acl-perm-picker" role="group" aria-label="Permissions">
        <label v-for="p in PERMS" :key="p.key" class="acl-perm-opt">
          <input type="checkbox" :value="p.key" v-model="selectedPerms" /> {{ p.label }}
        </label>
      </div>
      <div class="acl-add-row">
        <select v-model="effect" aria-label="Effect">
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </select>
        <button class="btn" :disabled="!picked || !selectedPerms.length || busy" @click="grant">Grant</button>
      </div>

      <label v-if="isDirectory" class="acl-recursive" title="Also apply this grant/removal to every file and subfolder inside">
        <input type="checkbox" v-model="recursive" />
        Apply to all contents (files &amp; subfolders)
      </label>

      <div class="acl-templates">
        <span class="acl-tpl-label">Templates:</span>
        <button
          class="btn btn-tpl"
          :disabled="busy || picked?.kind !== 'user'"
          title="Grant this user full access and deny everyone else (pick a user first)"
          @click="applyTemplate('home')"
        >🏠 Private home folder</button>
        <button
          class="btn btn-tpl"
          :disabled="busy || picked?.kind !== 'role'"
          title="Grant this role read+write and deny everyone else (pick a role first)"
          @click="applyTemplate('gated')"
        >👥 Gated section (role)</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import PrincipalPicker from '@/components/PrincipalPicker.vue'
import HelpIcon from '@/components/HelpIcon.vue'
import { aclService } from '@/services/aclService'
import { fileService } from '@/services/fileService'
import { errorMessage } from '@/services/apiClient'
import { PERMS, decodePermissions } from '@/utils/permissions'
import {
  encodePrincipal,
  principalKindFromType,
  type AclEntry,
  type Principal,
  type PrincipalKind,
} from '@/types'

const props = defineProps<{ uid: string; canManage?: boolean; isDirectory?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const entries = ref<AclEntry[]>([])
const loading = ref(false)
const error = ref('')
const picked = ref<Principal | null>(null)
const selectedPerms = ref<string[]>(['r'])
const effect = ref<'allow' | 'deny'>('allow')
const busy = ref(false)
// When set, a grant/revoke cascades to every descendant file and directory (the
// bridge walks the subtree). Only meaningful for a directory.
const recursive = ref(false)

// Show entries in evaluation order: User (0) → Roles/Claims (1) → Everyone (2),
// and within a tier put DENY first (DENY wins in-tier). Mirrors the core engine.
const TIER: Record<PrincipalKind, number> = { user: 0, role: 1, claim: 1, everyone: 2 }
const orderedEntries = computed(() =>
  [...entries.value].sort((a, b) => {
    const t = TIER[kindOf(a)] - TIER[kindOf(b)]
    if (t !== 0) return t
    if (a.effect !== b.effect) return a.effect === 'deny' ? -1 : 1
    return 0
  }),
)

watch(() => props.uid, load, { immediate: true })

async function load() {
  if (!props.uid) return
  loading.value = true
  error.value = ''
  try {
    entries.value = await aclService.getAcls(props.uid)
  } catch (e) {
    error.value = errorMessage(e, 'Failed to load ACLs')
    entries.value = []
  } finally {
    loading.value = false
  }
}

function kindOf(e: AclEntry): PrincipalKind {
  return principalKindFromType(e.type)
}

function kindLabel(k: PrincipalKind): string {
  return k === 'user' ? 'User' : k === 'role' ? 'Role' : k === 'claim' ? 'Claim' : 'Everyone'
}

function decode(mask: number) {
  return decodePermissions(mask)
}

function onPick(p: Principal) {
  picked.value = p
}

async function grant() {
  if (!picked.value || !selectedPerms.value.length) return
  busy.value = true
  error.value = ''
  try {
    const principal = encodePrincipal(picked.value)
    const opposite: 'allow' | 'deny' = effect.value === 'allow' ? 'deny' : 'allow'
    // Existing rules for this principal with the OPPOSITE effect — a permission we
    // set must not coexist with its opposite (allow vs deny), so clear it first.
    const conflicts = entries.value.filter(
      (e) =>
        e.effect === opposite &&
        encodePrincipal({ kind: principalKindFromType(e.type), value: e.principal }) === principal,
    )
    for (const p of selectedPerms.value) {
      const hasOpposite = conflicts.some((e) => decode(e.permissions).some((x) => x.key === p))
      if (hasOpposite) {
        await fileService.revokePermission(props.uid, {
          principal,
          permission: p,
          effect: opposite,
          recursive: recursive.value,
        })
      }
      await fileService.grantPermission(props.uid, {
        principal,
        permission: p,
        effect: effect.value,
        recursive: recursive.value,
      })
    }
    picked.value = null
    await load()
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e, 'Failed to grant')
  } finally {
    busy.value = false
  }
}

// One-click patterns. 'home': grant the picked user full access + deny everyone
// read. 'gated': grant the picked role read+write + deny everyone read. In both,
// the user/role resolves at a higher tier than the everyone-DENY, so they keep
// access while everyone else is shut out. Grants are per-permission (the backend
// ORs them together).
async function applyTemplate(kind: 'home' | 'gated') {
  if (!picked.value) return
  busy.value = true
  error.value = ''
  try {
    const grants = kind === 'home' ? ['r', 'w', 'd'] : ['r', 'w']
    for (const p of grants) {
      await fileService.grantPermission(props.uid, {
        principal: encodePrincipal(picked.value),
        permission: p,
        effect: 'allow',
      })
    }
    // Deny everyone read — gates the resource; the grant above out-ranks it.
    await fileService.grantPermission(props.uid, {
      principal: 'everyone',
      permission: 'r',
      effect: 'deny',
    })
    picked.value = null
    await load()
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e, 'Failed to apply template')
  } finally {
    busy.value = false
  }
}

async function revoke(e: AclEntry, permKey: string) {
  busy.value = true
  error.value = ''
  try {
    await fileService.revokePermission(props.uid, {
      principal: encodePrincipal({ kind: principalKindFromType(e.type), value: e.principal }),
      permission: permKey,
      effect: e.effect,
      recursive: recursive.value,
    })
    await load()
    emit('changed')
  } catch (err) {
    error.value = errorMessage(err, 'Failed to revoke')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.acl-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.acl-err {
  color: #b00020;
  font-size: 12px;
}

.acl-muted {
  color: var(--muted);
  font-size: 12px;
}

.acl-list {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.acl-list td {
  padding: 6px 6px;
  border-top: 1px solid var(--border);
  vertical-align: top;
}

.acl-list tr.deny .acl-name {
  color: #b00020;
}

.acl-principal {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 160px;
}

.acl-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acl-kind {
  flex: none;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 999px;
  color: #fff;
}

.acl-kind-user {
  background: #2563eb;
}

.acl-kind-role {
  background: #7c3aed;
}

.acl-kind-claim {
  background: #0f766e;
}

.acl-kind-everyone {
  background: #b45309;
}

.acl-eff {
  text-transform: uppercase;
  font-size: 10px;
  font-weight: 600;
}

.acl-eff.allow {
  color: #15803d;
}

.acl-eff.deny {
  color: #b00020;
}

.acl-perms {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.acl-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  /* Theme-adaptive pill. The previous var(--hover, #f2f4f7) always resolved to
     the light fallback (--hover is never defined), so in dark mode the chip was
     light-grey with light (--fg) text — white-on-white. Use theme tokens that
     contrast in both modes. */
  background: var(--border);
  color: var(--fg);
}

.acl-x {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--muted);
  font-size: 11px;
  line-height: 1;
  padding: 0;
}

.acl-x:hover {
  color: #b00020;
}

.acl-order {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 0 0 -4px;
}

.acl-note {
  font-size: 11px;
  color: var(--muted);
  font-style: italic;
}

.acl-templates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.acl-tpl-label {
  font-size: 11px;
  color: var(--muted);
}

.btn-tpl {
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--border);
  font-size: 12px;
}
.btn-tpl:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.acl-add {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.acl-picked {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.acl-perm-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 6px 0;
}

.acl-perm-opt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.acl-add-row {
  display: flex;
  flex-wrap: wrap; /* keep the Grant button on-screen even if the selects are wide */
  align-items: center;
  gap: 6px;
}

.acl-add-row select {
  flex: 1 1 120px; /* share the row and shrink rather than overflow */
  min-width: 0; /* allow shrinking below content width (long option labels) */
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  font-size: 13px;
}

.btn {
  flex: 0 0 auto; /* never shrink or get pushed off the row edge */
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--accent, #2563eb);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
