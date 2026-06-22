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

const auth = useAuthStore()

// Switching only mutates the active tenant; the file browser watches
// auth.tenant and reloads the listing from the root of the new tenant.
const onChange = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value
  auth.switchTenant(value)
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
  background: #fff;
  font-size: 13px;
  color: var(--fg);
}
</style>
