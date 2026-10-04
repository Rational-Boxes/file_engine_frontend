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
  "Your workspace's own address could not be reached, so you are working from
  the sign-in address."

  The fallback used to be silent, and both times it happened in production the
  cause was the user's network — a router-level web filter blocking the tenant
  subdomain — while the symptoms looked like a broken deploy: a 1 MB upload
  limit, then the Share tab and every other optional service gone. The person
  at the keyboard is the one who can fix a network filter, so they are the one
  who has to be told, in words that point at the network rather than at us.

  Unlike the busy toast this one can be dismissed: the condition does not pass
  by itself, and someone who has read it and chosen to carry on should not have
  it covering the page for the rest of the session. A reload re-probes anyway.
-->

<template>
  <div v-if="visible" class="lo-notice" role="status" aria-live="polite" data-test="login-origin-notice">
    <span class="lo-icon" aria-hidden="true">!</span>
    <span class="lo-text">
      <strong>You're working from the sign-in address.</strong>
      <template v-if="host">
        Your workspace's own address, <code>{{ host }}</code>, couldn't be reached from this network
      </template>
      <template v-else>Your workspace's own address couldn't be reached from this network</template>
      — often a firewall, router web filter or DNS problem. Your files and work are unaffected.
      <span v-if="stillBlocked" class="lo-still" data-test="login-origin-still">Still unreachable.</span>
    </span>
    <span class="lo-actions">
      <button type="button" class="lo-btn" :disabled="checking" data-test="login-origin-retry" @click="retry">
        {{ checking ? 'Checking…' : 'Try again' }}
      </button>
      <button type="button" class="lo-close" aria-label="Dismiss" data-test="login-origin-dismiss"
              @click="dismissed = true">×</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isLoginOrigin } from '@/utils/tenantHost'
import { loginOriginServing, resetServingFromLoginOrigin } from '@/utils/loginOriginServe'
import { forgetReachability, tenantOriginReachable } from '@/utils/tenantReach'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const dismissed = ref(false)
const checking = ref(false)
const stillBlocked = ref(false)

const visible = computed(() =>
  !dismissed.value && loginOriginServing.serving && auth.isAuthenticated && isLoginOrigin())

const host = computed(() => {
  try {
    return loginOriginServing.origin ? new URL(loginOriginServing.origin).host : ''
  } catch {
    return ''
  }
})

/**
 * Probe the workspace address afresh and, if it answers now, hand the session
 * over through the login view — the same path a fresh sign-in takes, so the
 * tenant and the current page both survive the move.
 */
async function retry() {
  const origin = loginOriginServing.origin
  if (!origin || checking.value) return
  checking.value = true
  stillBlocked.value = false
  try {
    // The probe caches its answer for the session; a retry that read the
    // cached "no" would be a button that cannot work.
    forgetReachability(origin)
    if (await tenantOriginReachable(origin)) {
      resetServingFromLoginOrigin()
      await router.push({ path: '/login', query: { next: route.fullPath, t: auth.tenant || undefined } })
    } else {
      stillBlocked.value = true
    }
  } finally {
    checking.value = false
  }
}
</script>

<style scoped>
.lo-notice {
  /* Bottom centre: the busy toast owns the top, and this one stays up for a
     while, so it should not sit over the toolbar people are working in. */
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2900;

  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(44rem, calc(100vw - 2rem));
  padding: 0.6rem 0.8rem 0.6rem 1rem;

  font-size: 0.875rem;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--warning, #d97706);
  border-radius: 8px;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.22);
}

.lo-icon {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 1.3em;
  height: 1.3em;
  border-radius: 50%;
  font-weight: 700;
  color: #fff;
  background: var(--warning, #d97706);
}

.lo-text code {
  font-size: 0.85em;
  word-break: break-all;
}

.lo-still {
  font-weight: 600;
  margin-left: 0.25rem;
}

.lo-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.lo-btn {
  padding: 0.3rem 0.7rem;
  font: inherit;
  color: var(--fg);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.lo-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.lo-close {
  padding: 0 0.4rem;
  font-size: 1.2rem;
  line-height: 1;
  color: var(--muted, var(--fg));
  background: transparent;
  border: 0;
  cursor: pointer;
}

@media (max-width: 560px) {
  .lo-notice { flex-wrap: wrap; }
}
</style>
