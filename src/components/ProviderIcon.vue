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
  The mark on a "Sign in with …" button.

  ON BRAND ASSETS — worth reading before changing anything here.

  Microsoft and LinkedIn both publish binding brand guidelines for sign-in
  buttons that require their OFFICIAL artwork, and specify the wording, minimum
  sizes and clear space around it. A deployment that is public-facing should
  drop the supplied assets in rather than rely on what is drawn below.

  So this component is built to be replaced, not to be definitive:

    * `microsoft` is the real mark — four squares in the published brand colours,
      which is exact geometry rather than an approximation of one.
    * `linkedin` is a faithful "in" glyph in the brand blue.
    * `google` and `github` are LETTERMARKS in brand colours, not the multicolour
      G or the Octocat. Both of those are intricate paths, and a hand-drawn
      near-miss of a well-known logo looks worse — and sits less comfortably
      with the trademark — than an obviously plain stand-in.

  To use official artwork: drop the SVG into `src/assets/providers/<name>.svg`
  and add a branch here. Nothing else needs to change.
-->
<template>
  <span class="pi" aria-hidden="true">
    <!-- Microsoft: four squares. Exact geometry, published brand colours. -->
    <svg v-if="name === 'microsoft'" viewBox="0 0 20 20" width="18" height="18">
      <rect x="1" y="1" width="8" height="8" fill="#F25022" />
      <rect x="11" y="1" width="8" height="8" fill="#7FBA00" />
      <rect x="1" y="11" width="8" height="8" fill="#00A4EF" />
      <rect x="11" y="11" width="8" height="8" fill="#FFB900" />
    </svg>

    <!-- LinkedIn: the "in" glyph on the brand blue. -->
    <svg v-else-if="name === 'linkedin'" viewBox="0 0 24 24" width="18" height="18">
      <rect width="24" height="24" rx="3" fill="#0A66C2" />
      <circle cx="6.6" cy="6.3" r="1.9" fill="#fff" />
      <rect x="4.9" y="9.4" width="3.4" height="10" fill="#fff" />
      <path
        d="M11 9.4h3.25v1.4a3.6 3.6 0 0 1 3.2-1.6c2.4 0 3.55 1.5 3.55 4.35v5.85h-3.4v-5.2
           c0-1.35-.5-2.15-1.7-2.15-1 0-1.55.68-1.8 1.34-.1.24-.1.57-.1.9v5.11H11z"
        fill="#fff"
      />
    </svg>

    <!-- Deliberately plain stand-ins; see the note above. -->
    <span v-else class="pi-letter" :style="{ background: colour }">{{ letter }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: string }>()

// Brand colours for the lettermark fallbacks, so a button still reads as
// "that provider" at a glance even without the official artwork.
const COLOURS: Record<string, string> = {
  google: '#4285F4',
  github: '#24292F',
  gitlab: '#FC6D26',
  okta: '#007DC1',
  auth0: '#EB5424',
  keycloak: '#4D4D4D',
}

const colour = computed(() => COLOURS[props.name] ?? 'var(--muted)')
const letter = computed(() => (props.name[0] ?? '?').toUpperCase())
</script>

<style scoped>
.pi {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}
.pi-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
</style>
