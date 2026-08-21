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
  <label v-if="auth.tenants.length > 1" class="tenant-selector">
    <span class="label">Tenant</span>
    <select :value="auth.tenant ?? ''" @change="onChange">
      <option v-for="t in auth.tenants" :key="t" :value="t">{{ t }}</option>
    </select>
  </label>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { subdomainTenancyEnabled, tenantOrigin } from '@/utils/tenantHost'
import { tenantOriginReachable } from '@/utils/tenantReach'
import { setLastTenant } from '@/utils/lastTenant'
import { authService } from '@/services/authService'

const auth = useAuthStore()

// Switching tenant must reset EVERY interface and data model so nothing from the
// previous tenant lingers — the KeepAlive-cached views (file browser, search,
// chat) hold component-local state, the Pinia stores hold data, and composables
// cache resolved names; an in-app field swap can't reliably clear all of that.
// So we do a clean boot scoped to the new tenant:
//   - subdomain tenancy: navigate to the tenant's own origin (authoritative);
//   - single-domain: persist the active tenant, then hard-reload — the app
//     re-bootstraps from the persisted token + tenant with fresh stores/caches.
// Carrying the SESSION is the part that used to be missing. The old code simply
// navigated to the other origin — but the token lives in localStorage, which is
// origin-scoped, so the destination had no session and its router guard bounced
// straight back to the sign-in origin. Combined with the guard's `?t=` being
// written and never read, that bounce then returned the user to the tenant they
// had just left, and switching looked like it did nothing.
//
// So mint a one-time hand-off code for the target tenant and land on its /sso,
// which redeems it into a real session there — the same mechanism the shared
// sign-in origin uses. The reachability probe runs first: if the target's
// subdomain is not actually serving the app, forwarding would strand the user
// on a browser error page, so fall back to the in-app swap instead.
const onChange = async (e: Event) => {
  const select = e.target as HTMLSelectElement
  const value = select.value
  if (!value || value === auth.tenant) return

  if (subdomainTenancyEnabled()) {
    const origin = tenantOrigin(value)
    if (origin && await tenantOriginReachable(origin)) {
      try {
        const code = await authService.ssoHandoff(value)
        setLastTenant(value)
        const url = new URL(origin + '/sso')
        url.searchParams.set('code', code)
        window.location.assign(url.toString())
        return
      } catch (err) {
        // The origin answered, so this is the hand-off failing rather than the
        // destination being absent. Fall through to the in-app swap: a working
        // workspace beats an error the user cannot act on.
        console.warn('tenant hand-off failed; switching in place', err)
      }
    }
  }
  // Single-domain, an unreachable subdomain, or a failed hand-off. Persist the
  // choice and hard-reload: a clean boot is what clears the KeepAlive-cached
  // views, the stores and the name caches, none of which an in-place field swap
  // can reliably reset.
  setLastTenant(value)
  auth.switchTenant(value)
  window.location.reload()
}
</script>

<style scoped>
.tenant-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.tenant-selector .label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
}

.tenant-selector select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  font-size: 13px;
  color: var(--fg);
}
</style>
