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
    <ModelViewerOverlay />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { initTheme } from '@/composables/useTheme'
import PdfPreviewOverlay from '@/components/PdfPreviewOverlay.vue'
import ModelViewerOverlay from '@/components/ModelViewerOverlay.vue'

const authStore = useAuthStore()

initTheme()

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
  --card: #ffffff; /* surface (panels, inputs, cards) */
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --danger: #dc2626;
  /* Single sans-serif stack used everywhere (no monospace/serif in the UI). */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* Dark theme — flips the surface/ink variables; everything built on them follows.
   Also applied locally to the 3D viewer chrome so its docked panel is always dark. */
:root[data-theme='dark'],
.theme-dark {
  --fg: #e6e8eb;
  --muted: #98a2b3;
  --border: #2b313b;
  --bg: #14171c;
  --card: #1c212a;
  --primary: #3b82f6;
  --primary-hover: #60a5fa;
  --danger: #f87171;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-sans);
}

#app {
  font-family: var(--font-sans);
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
