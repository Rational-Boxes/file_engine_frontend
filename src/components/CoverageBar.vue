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
  The video's timeline with what was watched filled in (MEDIA_SHARE.md §7.4).
  Gaps stay visible: "they skipped the middle" is the thing a percentage hides.
  Drawn as run-length segments rather than one element per bucket, so a
  1000-bucket recording is a handful of nodes.
-->
<template>
  <div class="cov" role="img" :aria-label="label" :title="label">
    <span
      v-for="(seg, i) in segments"
      :key="i"
      class="cov-seg"
      :class="{ on: seg.on }"
      :style="{ flexGrow: seg.len }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ bits: string; durationMs?: number | null }>()

const segments = computed(() => {
  const out: { on: boolean; len: number }[] = []
  for (const c of props.bits) {
    const on = c === '1'
    const last = out[out.length - 1]
    if (last && last.on === on) last.len += 1
    else out.push({ on, len: 1 })
  }
  return out
})

const label = computed(() => {
  const n = props.bits.length
  if (!n) return 'no playback data'
  const watched = [...props.bits].filter((c) => c === '1').length
  return `watched ${Math.round((100 * watched) / n)}% of the timeline`
})
</script>

<style scoped>
.cov {
  display: flex; height: .45rem; width: 100%; min-width: 6rem;
  border-radius: 2px; overflow: hidden; background: var(--bg);
  border: 1px solid var(--border);
}
.cov-seg { flex-basis: 0; }
.cov-seg.on { background: var(--primary); }
</style>
