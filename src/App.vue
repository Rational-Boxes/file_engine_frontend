<template>
  <div id="app">
    <!-- Keep the main tab views alive so their state (file listing, search
         results, chat history) persists when switching between tabs. -->
    <router-view v-slot="{ Component }">
      <KeepAlive :include="['FileBrowserView', 'SearchView', 'ChatView']">
        <component :is="Component" />
      </KeepAlive>
    </router-view>
    <PdfPreviewOverlay />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import PdfPreviewOverlay from '@/components/PdfPreviewOverlay.vue'

const authStore = useAuthStore()

onMounted(() => {
  // Adopt the tenant from the subdomain (someco.host.com → someco) before any
  // request, so whoami() and tenant listing are scoped to the right tenant.
  authStore.initTenantFromHost()
  // Hydrate identity from a stored token, if any.
  authStore.initialize()
})
</script>

<style>
:root {
  --fg: #1f2933;
  --muted: #6b7280;
  --border: #e5e7eb;
  --bg: #f7f8fa;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --danger: #dc2626;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--fg);
  background: var(--bg);
  min-height: 100vh;
}

button {
  font: inherit;
  cursor: pointer;
}
</style>
