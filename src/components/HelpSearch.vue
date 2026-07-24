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
  <div class="help-search">
    <input
      class="help-search-input"
      type="search"
      :value="modelValue"
      placeholder="Search help…"
      aria-label="Search help topics"
      @input="onInput"
    />
    <template v-if="modelValue.trim()">
      <ul v-if="results.length" class="help-results" role="listbox" aria-label="Search results">
        <li v-for="t in results" :key="t.id">
          <button class="help-result" type="button" @click="emit('select', t.id)">
            <span class="help-result-title">{{ t.title }}</span>
            <span class="help-result-cat">{{ t.category }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="help-results-empty">No matching topics.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { searchTopics } from '@/help'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'select', id: string): void
}>()

const results = computed(() => searchTopics(props.modelValue))

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<style scoped>
.help-search-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--fg);
  font: inherit;
}
.help-results {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.help-result {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  padding: 6px 8px;
  border-radius: 6px;
}
.help-result:hover {
  background: var(--bg);
}
.help-result-title {
  font-size: 0.92rem;
}
.help-result-cat {
  font-size: 0.72rem;
  color: var(--muted);
}
.help-results-empty {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 8px 0 0;
}
</style>
