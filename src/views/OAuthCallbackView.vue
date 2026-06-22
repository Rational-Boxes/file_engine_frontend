<template>
  <div class="callback">
    <p>{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const message = ref('Completing sign-in…')

onMounted(async () => {
  if (await auth.completeOAuth()) {
    router.replace('/files')
  } else {
    message.value = 'Sign-in failed. Redirecting…'
    router.replace('/login')
  }
})
</script>

<style scoped>
.callback {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
</style>
