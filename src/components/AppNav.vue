<template>
  <header class="topbar">
    <div class="brand">FileEngine</div>
    <nav class="mainnav">
      <router-link to="/files">Files</router-link>
      <router-link to="/search">Search</router-link>
      <router-link to="/chat">Chat</router-link>
      <router-link v-if="auth.hasAccessLevel('admin')" to="/admin/roles">Admin</router-link>
    </nav>
    <div class="user">
      <TenantSelector />
      <span v-if="auth.user" class="who">{{ auth.user }} · {{ auth.tenant }} · {{ auth.accessLevel }}</span>
      <button class="link" @click="logout">Sign out</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import TenantSelector from '@/components/TenantSelector.vue'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 18px;
  background: #fff;
  border-bottom: 1px solid var(--border);
}

.brand {
  font-weight: 700;
  color: var(--fg);
}

.mainnav {
  display: flex;
  gap: 6px;
}

.mainnav a {
  padding: 4px 10px;
  border-radius: 8px;
  text-decoration: none;
  font-size: 14px;
  color: var(--muted);
}

.mainnav a.router-link-active {
  background: var(--bg);
  color: var(--fg);
  font-weight: 600;
}

.user {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.who {
  font-size: 12px;
  color: var(--muted);
}

.link {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 13px;
  cursor: pointer;
}
</style>
