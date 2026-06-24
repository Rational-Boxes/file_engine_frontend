<template>
  <nav class="admin-tabs">
    <router-link to="/admin/roles">Roles</router-link>
    <router-link to="/admin/ops">Storage &amp; sync</router-link>
  </nav>
</template>

<style scoped>
.admin-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.admin-tabs a {
  padding: 4px 12px;
  border-radius: 999px;
  text-decoration: none;
  font-size: 13px;
  color: var(--muted);
  border: 1px solid var(--border);
}

.admin-tabs a.router-link-active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
</style>
