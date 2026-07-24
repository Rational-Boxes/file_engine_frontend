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
  <div class="profile">
    <AppNav />
    <main class="content">
      <h1>My profile <HelpIcon topic="account-security" label="Signing in &amp; account security" /></h1>
      <p v-if="error" class="err">{{ error }}</p>

      <section v-if="profile" class="card">
        <div class="avatar-row">
          <img v-if="form.avatar_url" :src="form.avatar_url" alt="avatar" class="avatar" @error="avatarBroken = true" />
          <div v-else class="avatar placeholder">{{ initials }}</div>
          <div class="idbox">
            <div class="email">{{ profile.email }}</div>
            <div class="muted">{{ profile.tenant }} · {{ profile.roles.join(', ') || 'no roles' }}</div>
          </div>
        </div>

        <label>Display name<input v-model="form.display_name" autocomplete="nickname" /></label>
        <div class="two">
          <label>First name<input v-model="form.given_name" autocomplete="given-name" /></label>
          <label>Last name<input v-model="form.surname" autocomplete="family-name" /></label>
        </div>
        <!-- Chrome ignores autocomplete="off" for fields it guesses are a username,
             and was injecting the user's email here (this text box is the nearest
             field to the password section, so its password heuristic grabbed it).
             readonly-until-focus is the reliable defense: Chrome never autofills a
             readonly field; we drop readonly on focus so the user can still edit. -->
        <label>Avatar image URL<input
          v-model="form.avatar_url" type="url" name="avatar_url" autocomplete="off"
          :readonly="avatarLock" @focus="avatarLock = false"
          placeholder="https://…/me.png" /></label>

        <div class="actions">
          <button class="btn" :disabled="saving" @click="save">Save profile</button>
          <span v-if="saved" class="ok">Saved ✓</span>
        </div>
      </section>

      <section class="card">
        <h2>Change password</h2>
        <p class="muted">Your sign-in password. For WebDAV or MCP access, create a
          scoped credential below instead of using this password.</p>
        <!-- A real (off-screen) username field for the password manager: gives
             Chrome's password heuristic a proper target so it stops designating a
             profile field (the avatar URL) as the username and filling it. -->
        <input class="sr-only" type="text" autocomplete="username" :value="profile?.email"
               tabindex="-1" aria-hidden="true" readonly />
        <label>Current password<input v-model="cur" type="password" autocomplete="current-password" /></label>
        <label>New password<input v-model="next" type="password" autocomplete="new-password" /></label>
        <PasswordRequirements :password="next" :identity="profile?.email" @valid="pwValid = $event" />
        <div class="actions">
          <button class="btn" :disabled="!cur || !pwValid || changing" @click="changePw">Change password</button>
          <span v-if="pwChanged" class="ok">Password changed ✓</span>
          <span v-if="pwError" class="err">{{ pwError }}</span>
        </div>
      </section>

      <TwoFactorSettings />

      <WebDavCredentials />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import PasswordRequirements from '@/components/PasswordRequirements.vue'
import TwoFactorSettings from '@/components/TwoFactorSettings.vue'
import WebDavCredentials from '@/components/WebDavCredentials.vue'
import HelpIcon from '@/components/HelpIcon.vue'
import { ldapAdminService, type Profile } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const profile = ref<Profile | null>(null)
const form = reactive({ display_name: '', given_name: '', surname: '', avatar_url: '' })
const error = ref('')
const saving = ref(false)
const saved = ref(false)
const avatarBroken = ref(false)
// Keep the avatar URL field readonly until the user focuses it, so the browser
// can't autofill it (Chrome ignores autocomplete="off" but never fills readonly).
const avatarLock = ref(true)

const cur = ref('')
const next = ref('')
const pwValid = ref(false)
const changing = ref(false)
const pwChanged = ref(false)
const pwError = ref('')

const initials = computed(() =>
  (form.display_name || profile.value?.email || '?').slice(0, 2).toUpperCase(),
)

onMounted(load)
async function load() {
  try {
    const p = await ldapAdminService.getProfile()
    profile.value = p
    Object.assign(form, { display_name: p.display_name, given_name: p.given_name, surname: p.surname, avatar_url: p.avatar_url })
  } catch (e) {
    error.value = errorMessage(e, 'Could not load your profile')
  }
}

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    profile.value = await ldapAdminService.updateProfile({ ...form })
    saved.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Could not save your profile')
  } finally {
    saving.value = false
  }
}

async function changePw() {
  changing.value = true
  pwChanged.value = false
  pwError.value = ''
  try {
    await ldapAdminService.changePassword(cur.value, next.value)
    pwChanged.value = true
    cur.value = ''
    next.value = ''
  } catch (e) {
    pwError.value = errorMessage(e, 'Could not change your password')
  } finally {
    changing.value = false
  }
}
</script>

<style scoped>
/* Off-screen (NOT display:none — Chrome skips display:none fields for autofill),
   so the hidden username sink still anchors the password manager. */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.content { max-width: 640px; margin: 0 auto; padding: 20px 18px; }
.card { border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; }
.two { display: flex; gap: 10px; }
.two label { flex: 1; }
.avatar-row { display: flex; align-items: center; gap: 12px; }
.avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); }
.avatar.placeholder { display: flex; align-items: center; justify-content: center; background: var(--bg); font-weight: 600; color: var(--muted); }
.idbox .email { font-weight: 600; }
.muted { color: var(--muted); font-size: 12px; }
.actions { display: flex; align-items: center; gap: 10px; }
.btn { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 14px; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ok { color: #15803d; font-size: 13px; }
.err { color: #b00020; font-size: 13px; }
</style>
