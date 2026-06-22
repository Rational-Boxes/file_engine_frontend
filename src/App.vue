<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(() => {
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
