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
  <button
    class="help-icon"
    type="button"
    :aria-label="label"
    :title="label"
    @click.stop="open"
  >?</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useHelpStore } from '@/stores/help'

// Inline contextual help trigger placed beside a complex feature. Opening a topic
// is a navigation into the shared help overlay (see stores/help.ts) — it pushes
// onto the existing history, so the user can page Back to whatever they were
// reading before.
const props = defineProps<{ topic: string; label?: string }>()
const help = useHelpStore()

const label = computed(() => props.label || 'Open help for this feature')

function open() {
  help.openTopic(props.topic)
}
</script>

<style scoped>
/* A filled circular badge so contextual help reads clearly as an affordance,
   not incidental text. Sits inline; vertical-align keeps it centered on a line. */
.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  width: 18px;
  height: 18px;
  margin: 0 2px;
  border: none;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: background 0.12s ease, transform 0.12s ease;
}
.help-icon:hover,
.help-icon:focus-visible {
  background: var(--primary-hover);
  transform: scale(1.12);
  outline: none;
}
</style>
