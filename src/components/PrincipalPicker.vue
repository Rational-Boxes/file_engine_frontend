<template>
  <div class="principal-picker">
    <input
      class="pp-input"
      type="text"
      :placeholder="placeholder"
      v-model="query"
      autocomplete="off"
      @focus="open = true"
      @keydown.esc="close"
    />
    <ul v-if="open && (loading || error || results.length || query.trim())" class="pp-menu">
      <li v-if="loading" class="pp-status">Searching…</li>
      <li v-else-if="error" class="pp-status pp-error">{{ error }}</li>
      <li v-else-if="!results.length" class="pp-status">No matches</li>
      <li
        v-for="p in results"
        :key="p.kind + ':' + p.value"
        class="pp-item"
        @mousedown.prevent="choose(p)"
      >
        <span class="pp-kind" :class="'pp-kind-' + p.kind">{{ kindLabel(p.kind) }}</span>
        <span class="pp-value">{{ p.value }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { aclService, suggestionsToPrincipals, type PrincipalType } from '@/services/aclService'
import { errorMessage } from '@/services/apiClient'
import type { Principal, PrincipalKind } from '@/types'

const props = withDefaults(
  defineProps<{
    types?: PrincipalType[]
    limit?: number
    placeholder?: string
    debounceMs?: number
  }>(),
  { limit: 8, placeholder: 'Search users, roles, claims…', debounceMs: 200 },
)

const emit = defineEmits<{ (e: 'select', principal: Principal): void }>()

const query = ref('')
const results = ref<Principal[]>([])
const loading = ref(false)
const error = ref('')
const open = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0 // guards against out-of-order responses

watch(query, (q) => {
  if (timer) clearTimeout(timer)
  const trimmed = q.trim()
  if (!trimmed) {
    results.value = []
    error.value = ''
    loading.value = false
    return
  }
  loading.value = true
  open.value = true
  timer = setTimeout(() => void run(trimmed), props.debounceMs)
})

async function run(q: string) {
  const mine = ++seq
  try {
    const s = await aclService.searchPrincipals(q, { types: props.types, limit: props.limit })
    if (mine !== seq) return // superseded by a newer query
    results.value = suggestionsToPrincipals(s)
    error.value = ''
  } catch (e) {
    if (mine !== seq) return
    error.value = errorMessage(e, 'Search failed')
    results.value = []
  } finally {
    if (mine === seq) loading.value = false
  }
}

function choose(p: Principal) {
  emit('select', p)
  query.value = ''
  results.value = []
  close()
}

function close() {
  open.value = false
}

function kindLabel(k: PrincipalKind): string {
  return k === 'user' ? 'User' : k === 'role' ? 'Role' : 'Claim'
}
</script>

<style scoped>
.principal-picker {
  position: relative;
}

.pp-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: var(--fg);
}

.pp-menu {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  margin: 4px 0 0;
  padding: 4px;
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.pp-status {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--muted);
}

.pp-error {
  color: #b00020;
}

.pp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--fg);
}

.pp-item:hover {
  background: var(--hover, #f2f4f7);
}

.pp-kind {
  flex: none;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  color: #fff;
}

.pp-kind-user {
  background: #2563eb;
}

.pp-kind-role {
  background: #7c3aed;
}

.pp-kind-claim {
  background: #0f766e;
}

.pp-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
