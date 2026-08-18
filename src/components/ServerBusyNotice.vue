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
  "The server is busy" — shown while a service is shedding load (HTTP 503).

  The wording is doing real work here. This is a *temporary* condition by
  construction: the services shed load precisely so they stay up and drain the
  backlog, so the honest message is "this will pass", not "something is broken".
  A user who reads an error and stops trying has been told the wrong thing.

  It clears itself and has no dismiss button on purpose. There is nothing to
  acknowledge, and by the time anyone reached for a close button the condition
  has usually already passed.
-->

<template>
  <Transition name="sb-fade">
    <div v-if="isServerBusy" class="sb-notice" role="status" aria-live="polite">
      <span class="sb-spinner" aria-hidden="true"></span>
      <span>
        <strong>The server is busy.</strong>
        It should free up in a few moments — anything that didn't go through is worth trying again.
      </span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { isServerBusy } from '@/services/serverBusy'
</script>

<style scoped>
.sb-notice {
  /* A standard toast: fixed, top centre, floating over the page without
     displacing anything. */
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3000;

  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(38rem, calc(100vw - 2rem));
  padding: 0.6rem 1rem;

  font-size: 0.9rem;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
  border-radius: 8px;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.22);
}

/* Busy, not broken: a spinner says "working on it" where a warning triangle
   would say "something is wrong", which is not what a shed request means. */
.sb-spinner {
  flex: 0 0 auto;
  width: 0.9em;
  height: 0.9em;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: sb-spin 0.8s linear infinite;
}

@keyframes sb-spin {
  to { transform: rotate(360deg); }
}

.sb-fade-enter-active,
.sb-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

/* Slides down from above, the usual direction for a top toast. */
.sb-fade-enter-from,
.sb-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.75rem);
}

@media (prefers-reduced-motion: reduce) {
  .sb-spinner { animation: none; }
  .sb-fade-enter-active,
  .sb-fade-leave-active { transition: none; }
}
</style>
