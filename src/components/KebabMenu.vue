<template>
  <div ref="root" class="kebab">
    <button ref="btn" class="kebab-btn" aria-label="Actions" @click.stop="toggle">⋮</button>
    <Teleport to="body">
      <ul
        v-if="open"
        ref="menu"
        class="kebab-menu"
        :style="menuStyle"
        @click.stop
      >
        <li v-for="item in items" :key="item.action">
          <button
            class="kebab-item"
            :class="{ danger: item.danger }"
            @click="choose(item.action)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'

export interface KebabItem {
  action: string
  label: string
  danger?: boolean
}

defineProps<{ items: KebabItem[] }>()
const emit = defineEmits<{ (e: 'select', action: string): void }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const btn = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

// The menu is teleported to <body> and fixed-positioned so no ancestor's
// overflow can clip it; it flips above the button when there's no room below.
function position() {
  const b = btn.value
  const m = menu.value
  if (!b || !m) return
  const r = b.getBoundingClientRect()
  const mh = m.offsetHeight
  const mw = m.offsetWidth
  const gap = 4
  const spaceBelow = window.innerHeight - r.bottom
  const flipUp = spaceBelow < mh + gap && r.top > mh + gap
  const top = flipUp ? r.top - mh - gap : r.bottom + gap
  const left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8))
  menuStyle.value = { top: `${top}px`, left: `${left}px` }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    position()
  }
}
function close() {
  open.value = false
}
function choose(action: string) {
  close()
  emit('select', action)
}

const onDocClick = (e: MouseEvent) => {
  const t = e.target as Node
  if (root.value?.contains(t) || menu.value?.contains(t)) return
  close()
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}
// Reposition would drift with the page; closing on scroll/resize is simplest.
const onReflow = () => close()

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onReflow, true)
  window.addEventListener('resize', onReflow)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onReflow, true)
  window.removeEventListener('resize', onReflow)
})
</script>

<style scoped>
.kebab {
  display: inline-block;
}

.kebab-btn {
  border: none;
  background: none;
  font-size: 18px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--muted);
}

.kebab-btn:hover {
  background: var(--border);
}
</style>

<style>
/* Unscoped: the menu is teleported to <body>, outside this component's tree. */
.kebab-menu {
  position: fixed;
  z-index: 1000;
  margin: 0;
  padding: 4px;
  list-style: none;
  min-width: 150px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}

.kebab-menu .kebab-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  color: var(--fg);
  cursor: pointer;
}

.kebab-menu .kebab-item:hover {
  background: var(--bg);
}

.kebab-menu .kebab-item.danger {
  color: var(--danger);
}
</style>
