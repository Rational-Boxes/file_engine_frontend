<template>
  <div class="principal-picker">
    <input
      ref="inputEl"
      class="pp-input"
      type="text"
      :placeholder="placeholder"
      v-model="query"
      autocomplete="off"
      @focus="onFocus"
      @keydown.esc="close"
    />
    <!-- Teleported to <body> and fixed-positioned so the suggestions escape the
         details drawer's `overflow: auto` pane (which would otherwise clip them);
         z-index keeps them above adjacent chrome. -->
    <Teleport to="body">
      <ul v-if="menuVisible" class="pp-menu" :style="menuStyle">
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
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
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
const inputEl = ref<HTMLInputElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0 // guards against out-of-order responses

// The dropdown is shown whenever the field is focused and there is something to
// show (a spinner, an error, results, or a non-empty query awaiting results).
const menuVisible = computed(
  () =>
    open.value &&
    (loading.value || !!error.value || results.value.length > 0 || query.value.trim().length > 0),
)

// Anchor the teleported menu under the input using viewport coordinates.
function positionMenu() {
  const el = inputEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  menuStyle.value = { top: `${r.bottom}px`, left: `${r.left}px`, width: `${r.width}px` }
}

function onFocus() {
  open.value = true
  void nextTick(positionMenu)
}

// Keep the menu glued to the input as the page scrolls or resizes while open.
function onViewportChange() {
  if (menuVisible.value) positionMenu()
}

watch(menuVisible, (v) => {
  if (v) void nextTick(positionMenu)
})
watch(results, () => {
  if (menuVisible.value) void nextTick(positionMenu)
})

onMounted(() => {
  window.addEventListener('scroll', onViewportChange, true) // capture: catch scroll in any ancestor
  window.addEventListener('resize', onViewportChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})

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
  /* Fixed + teleported to <body>: top/left/width are set inline from the input's
     bounding rect, so the menu escapes any `overflow` ancestor (e.g. the details
     drawer's scrollable pane). Popover-tier z-index keeps it above the chrome. */
  position: fixed;
  z-index: 1000;
  margin-top: 4px;
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
