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
  <div class="auth-page">
    <div class="auth-card">
      <h1>Set your password</h1>
      <template v-if="!done">
        <p class="muted">Choose a password to activate your account.</p>
        <label>New password<input v-model="pw" type="password" autocomplete="new-password" /></label>
        <PasswordRequirements :password="pw" @valid="valid = $event" />
        <p v-if="error" class="err">{{ error }}</p>
        <button class="btn" :disabled="!valid || !token || busy" @click="submit">Set password</button>
        <p v-if="!token" class="err">This link is missing its token. Ask for a new invitation.</p>
      </template>
      <template v-else>
        <p class="ok">Your password is set. You can now sign in.</p>
        <router-link class="btn" to="/login">Go to sign in</router-link>
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
const pw = ref('')
const valid = ref(false)
const busy = ref(false)
const done = ref(false)
const error = ref('')

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await ldapAdminService.acceptInvite(token.value, pw.value)
    done.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Could not set your password (the link may have expired)')
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
.muted { color: var(--muted); font-size: 13px; }
.ok { color: #15803d; }
.err { color: #b00020; font-size: 13px; }
</style>
