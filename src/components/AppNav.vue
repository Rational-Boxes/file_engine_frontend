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
  <header class="topbar">
    <div class="brand">FileEngine</div>
    <nav class="mainnav">
      <router-link to="/dashboard">Dashboard</router-link>
      <router-link to="/files">Files</router-link>
      <router-link to="/search">Search</router-link>
      <router-link to="/chat">AI Research Chat</router-link>
      <router-link v-if="auth.hasAccessLevel('admin')" to="/admin/tenant">Users &amp; roles</router-link>
      <router-link v-if="auth.hasAccessLevel('admin')" to="/admin/integrations">Integrations</router-link>
      <router-link v-if="auth.hasAccessLevel('admin')" to="/admin/classifiers">Classifier sets</router-link>
      <router-link v-if="auth.hasAccessLevel('admin')" to="/admin/ops">System</router-link>
    </nav>
    <div class="user">
      <button
        class="theme-toggle"
        :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >{{ theme === 'dark' ? '☀️' : '🌙' }}</button>
      <button
        class="help-btn"
        title="Help &amp; documentation"
        aria-label="Help and documentation"
        @click="help.openAtLastPosition()"
      >?</button>
      <TenantSelector />
      <router-link v-if="auth.user" class="who" to="/profile" :title="`${auth.tenant} · ${auth.accessLevel}`">{{ auth.user }}</router-link>
      <button class="link" @click="logout">Sign out</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import { useHelpStore } from '@/stores/help'
import TenantSelector from '@/components/TenantSelector.vue'

const auth = useAuthStore()
const router = useRouter()
const { theme, toggleTheme } = useTheme()
const help = useHelpStore()

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.theme-toggle {
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 8px;
  padding: 3px 9px;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
.theme-toggle:hover {
  background: var(--bg);
}
.help-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.help-btn:hover {
  background: var(--bg);
}
.topbar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 18px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  /* Keep the nav pinned to the top as content scrolls beneath it. */
  position: sticky;
  top: 0;
  z-index: 20;
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
