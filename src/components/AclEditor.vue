<template>
  <div class="acl-editor">
    <p v-if="error" class="acl-err">{{ error }}</p>

    <p v-if="loading" class="acl-muted">Loading ACLs…</p>
    <table v-else-if="entries.length" class="acl-list">
      <tbody>
        <tr v-for="(e, idx) in entries" :key="idx" :class="{ deny: e.effect === 'deny' }">
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
    <p v-else class="acl-muted">No ACL entries.</p>

    <p v-if="hasDeny" class="acl-note">DENY overrides ALLOW for the same principal.</p>

    <form v-if="canManage" class="acl-add" @submit.prevent>
      <PrincipalPicker @select="onPick" />
      <div v-if="picked" class="acl-picked">
        <span class="acl-kind" :class="'acl-kind-' + picked.kind">{{ kindLabel(picked.kind) }}</span>
        <span class="acl-name">{{ picked.value }}</span>
        <button class="acl-x" title="Clear" @click="picked = null">✕</button>
      </div>
      <div class="acl-add-row">
        <select v-model="perm" aria-label="Permission">
          <option v-for="p in PERMS" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>
        <select v-model="effect" aria-label="Effect">
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </select>
        <button class="btn" :disabled="!picked || busy" @click="grant">Grant</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import PrincipalPicker from '@/components/PrincipalPicker.vue'
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

const props = defineProps<{ uid: string; canManage?: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const entries = ref<AclEntry[]>([])
const loading = ref(false)
const error = ref('')
const picked = ref<Principal | null>(null)
const perm = ref('r')
const effect = ref<'allow' | 'deny'>('allow')
const busy = ref(false)

const hasDeny = computed(() => entries.value.some((e) => e.effect === 'deny'))

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
  return k === 'user' ? 'User' : k === 'role' ? 'Role' : 'Claim'
}

function decode(mask: number) {
  return decodePermissions(mask)
}

function onPick(p: Principal) {
  picked.value = p
}

async function grant() {
  if (!picked.value) return
  busy.value = true
  error.value = ''
  try {
    await fileService.grantPermission(props.uid, {
      principal: encodePrincipal(picked.value),
      permission: perm.value,
      effect: effect.value,
    })
    picked.value = null
    await load()
    emit('changed')
  } catch (e) {
    error.value = errorMessage(e, 'Failed to grant')
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
  background: var(--hover, #f2f4f7);
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

.acl-note {
  font-size: 11px;
  color: var(--muted);
  font-style: italic;
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

.acl-add-row {
  display: flex;
  gap: 6px;
}

.acl-add-row select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
}

.btn {
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
