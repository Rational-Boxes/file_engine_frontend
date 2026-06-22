<template>
  <div class="login-page">
    <div class="login-card">
      <h1>FileEngine</h1>
      <p class="subtitle">Sign in to continue</p>

      <div v-if="providers.length" class="providers">
        <button
          v-for="p in providers"
          :key="p"
          class="btn btn-provider"
          @click="loginWithProvider(p)"
        >
          Sign in with {{ label(p) }}
        </button>
      </div>

      <div v-if="providers.length" class="divider"><span>or</span></div>

      <form class="ldap-form" @submit.prevent="loginLdap">
        <label>
          Username
          <input v-model="username" type="text" autocomplete="username" required />
        </label>
        <label>
          Password
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="auth.error" class="error">{{ auth.error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="auth.loading">
          {{ auth.loading ? 'Signing in…' : 'Log in' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')

const providers = (import.meta.env.VITE_OAUTH_PROVIDERS || '')
  .split(',')
  .map((p: string) => p.trim())
  .filter(Boolean)

const label = (p: string) => p.charAt(0).toUpperCase() + p.slice(1)

const loginWithProvider = (p: string) => authService.oauthRedirect(p)

const loginLdap = async () => {
  if (await auth.ldapLogin(username.value, password.value)) {
    router.push('/files')
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

h1 {
  margin: 0;
  font-size: 24px;
}

.subtitle {
  margin: 4px 0 24px;
  color: var(--muted);
}

.providers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #fff;
  font-weight: 500;
}

.btn-provider:hover {
  background: var(--bg);
}

.btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.divider {
  text-align: center;
  margin: 20px 0;
  position: relative;
  color: var(--muted);
  font-size: 13px;
}

.divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border);
}

.divider span {
  background: #fff;
  padding: 0 10px;
  position: relative;
}

.ldap-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ldap-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.ldap-form input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.error {
  color: var(--danger);
  font-size: 13px;
  margin: 0;
}
</style>
