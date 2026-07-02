<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Reset password</h1>

      <!-- Confirm step: a token is present (from the emailed link). -->
      <template v-if="token">
        <template v-if="!done">
          <p class="muted">Choose a new password.</p>
          <label>New password<input v-model="pw" type="password" autocomplete="new-password" /></label>
          <PasswordRequirements :password="pw" @valid="valid = $event" />
          <p v-if="error" class="err">{{ error }}</p>
          <button class="btn" :disabled="!valid || busy" @click="confirm">Set new password</button>
        </template>
        <template v-else>
          <p class="ok">Your password has been reset. You can now sign in.</p>
          <router-link class="btn" to="/login">Go to sign in</router-link>
        </template>
      </template>

      <!-- Request step: no token — ask for the email. -->
      <template v-else>
        <template v-if="!requested">
          <p class="muted">Enter your email and we'll send a reset link.</p>
          <label>Email<input v-model="email" type="email" autocomplete="email" /></label>
          <button class="btn" :disabled="!email || busy" @click="request">Send reset link</button>
        </template>
        <template v-else>
          <p class="ok">If an account exists for that address, a reset link is on its way.</p>
          <router-link class="link" to="/login">Back to sign in</router-link>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import PasswordRequirements from '@/components/PasswordRequirements.vue'
import { ldapAdminService } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

const email = ref('')
const pw = ref('')
const valid = ref(false)
const busy = ref(false)
const requested = ref(false)
const done = ref(false)
const error = ref('')

async function request() {
  busy.value = true
  try {
    await ldapAdminService.requestReset(email.value)
  } catch {
    /* never reveal whether the address exists */
  } finally {
    busy.value = false
    requested.value = true // always show the same confirmation
  }
}

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    await ldapAdminService.confirmReset(token.value, pw.value)
    done.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Could not reset your password (the link may have expired)')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.auth-card { width: min(420px, 100%); border: 1px solid var(--border); border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
input { padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; }
.btn { padding: 9px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 14px; cursor: pointer; text-align: center; text-decoration: none; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.link { color: var(--primary); font-size: 13px; }
.muted { color: var(--muted); font-size: 13px; }
.ok { color: #15803d; }
.err { color: #b00020; font-size: 13px; }
</style>
