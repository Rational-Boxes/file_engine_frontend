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
  <Teleport to="body">
    <div
      v-if="help.open"
      class="help-root"
      role="dialog"
      aria-modal="true"
      aria-label="Help"
    >
      <div class="help-backdrop" @click="help.close()"></div>

      <div ref="panelEl" class="help-panel" @keydown="onKeydown">
        <header class="help-head">
          <div class="help-nav-btns">
            <button
              class="help-nav-btn"
              type="button"
              title="Back"
              aria-label="Back"
              :disabled="!help.canBack"
              @click="help.back()"
            >‹</button>
            <button
              class="help-nav-btn"
              type="button"
              title="Forward"
              aria-label="Forward"
              :disabled="!help.canForward"
              @click="help.forward()"
            >›</button>
          </div>
          <h1 class="help-title">{{ activeTitle }}</h1>
          <button class="help-x" type="button" aria-label="Close help" @click="help.close()">✕</button>
        </header>

        <div class="help-cols">
          <aside class="help-side">
            <HelpSearch v-model="search" @select="go" />
            <nav v-if="!search.trim()" class="help-index" aria-label="Help topics">
              <div v-for="group in groups" :key="group.category" class="help-group">
                <h2 class="help-group-h">{{ group.category }}</h2>
                <ul>
                  <li v-for="t in group.topics" :key="t.id">
                    <button
                      class="help-topic-link"
                      type="button"
                      :class="{ active: t.id === help.activeTopicId }"
                      @click="go(t.id)"
                    >{{ t.title }}</button>
                  </li>
                </ul>
              </div>
            </nav>
          </aside>

          <main ref="bodyEl" class="help-body" @scroll="onScroll">
            <HelpArticle v-if="help.activeTopicId" :topic-id="help.activeTopicId" @navigate="go" />
            <p v-else class="help-welcome">Select a topic to get started.</p>
          </main>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useHelpStore } from '@/stores/help'
import { categorizedTopics, getTopic } from '@/help'
import HelpSearch from '@/components/HelpSearch.vue'
import HelpArticle from '@/components/HelpArticle.vue'

const help = useHelpStore()
const groups = categorizedTopics()

const panelEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)

// Search text is backed by the store so it survives close/reopen (§6).
const search = computed({
  get: () => help.nav.search,
  set: (v: string) => help.setSearch(v),
})

const activeTitle = computed(() => getTopic(help.activeTopicId)?.title || 'Help')

// A topic-link / search-result / See-also click is a navigation (pushTopic).
function go(id: string) {
  help.pushTopic(id)
}

// Persist scroll offset per topic so Back returns to where the reader was.
function onScroll() {
  if (help.activeTopicId && bodyEl.value) {
    help.rememberScroll(help.activeTopicId, bodyEl.value.scrollTop)
  }
}

// Restore the remembered scroll offset whenever the shown article changes.
watch(
  () => help.activeTopicId,
  async (id) => {
    await nextTick()
    if (bodyEl.value) bodyEl.value.scrollTop = id ? (help.nav.scrollTops[id] ?? 0) : 0
  },
)

// --- Focus management + background inert ---------------------------------
let lastFocused: HTMLElement | null = null

function focusables(): HTMLElement[] {
  if (!panelEl.value) return []
  return Array.from(
    panelEl.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null)
}

// Trap Tab within the panel; Esc closes.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    help.close()
    return
  }
  if (e.key !== 'Tab') return
  const items = focusables()
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

const appEl = () => document.getElementById('app')

watch(
  () => help.open,
  async (open) => {
    if (open) {
      lastFocused = document.activeElement as HTMLElement
      // Make the app behind the modal inert so focus can't escape behind it.
      appEl()?.setAttribute('inert', '')
      await nextTick()
      // Restore scroll for the current article and move focus into the panel.
      if (bodyEl.value && help.activeTopicId) {
        bodyEl.value.scrollTop = help.nav.scrollTops[help.activeTopicId] ?? 0
      }
      focusables()[0]?.focus()
    } else {
      appEl()?.removeAttribute('inert')
      lastFocused?.focus?.()
      lastFocused = null
    }
  },
)

// Safety net: never leave the app inert if the modal is torn down while open.
onBeforeUnmount(() => appEl()?.removeAttribute('inert'))
</script>

<style scoped>
.help-root {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
}
.help-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}
.help-panel {
  position: relative;
  width: min(900px, 94vw);
  height: min(84vh, 920px);
  display: flex;
  flex-direction: column;
  background: var(--card);
  /* Teleported outside #app — set theme ink explicitly (see ThreadOverlay). */
  color: var(--fg);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
}
.help-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.help-nav-btns {
  display: flex;
  gap: 4px;
}
.help-nav-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 1.2rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.help-nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.help-title {
  flex: 1;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.help-x {
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 3px 9px;
}
.help-cols {
  flex: 1;
  min-height: 0;
  display: flex;
}
.help-side {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 14px;
  overflow-y: auto;
}
.help-index {
  margin-top: 14px;
}
.help-group + .help-group {
  margin-top: 16px;
}
.help-group-h {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 0 0 6px;
}
.help-group ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.help-topic-link {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 0.9rem;
}
.help-topic-link:hover {
  background: var(--bg);
}
.help-topic-link.active {
  background: var(--bg);
  color: var(--fg);
  font-weight: 600;
}
.help-body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 22px 26px;
}
.help-welcome {
  color: var(--muted);
}

@media (max-width: 640px) {
  .help-cols {
    flex-direction: column;
  }
  .help-side {
    width: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: 40%;
  }
}
</style>
