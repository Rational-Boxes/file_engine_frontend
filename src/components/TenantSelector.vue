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
import { subdomainTenancyEnabled, tenantUrl } from '@/utils/tenantHost'

const auth = useAuthStore()

// Switching tenant must reset EVERY interface and data model so nothing from the
// previous tenant lingers — the KeepAlive-cached views (file browser, search,
// chat) hold component-local state, the Pinia stores hold data, and composables
// cache resolved names; an in-app field swap can't reliably clear all of that.
// So we do a clean boot scoped to the new tenant:
//   - subdomain tenancy: navigate to the tenant's own origin (authoritative);
//   - single-domain: persist the active tenant, then hard-reload — the app
//     re-bootstraps from the persisted token + tenant with fresh stores/caches.
const onChange = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value
  if (!value || value === auth.tenant) return
  if (subdomainTenancyEnabled()) {
    const url = tenantUrl(value)
    if (url) {
      window.location.assign(url)
      return
    }
  }
  auth.switchTenant(value) // persist the choice so the reload boots into it
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
