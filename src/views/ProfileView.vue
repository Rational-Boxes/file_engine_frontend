<template>
  <div class="profile">
    <AppNav />
    <main class="content">
      <h1>My profile</h1>
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

        <label>Display name<input v-model="form.display_name" /></label>
        <div class="two">
          <label>First name<input v-model="form.given_name" /></label>
          <label>Last name<input v-model="form.surname" /></label>
        </div>
        <label>Avatar image URL<input v-model="form.avatar_url" placeholder="https://…/me.png" /></label>

        <div class="actions">
          <button class="btn" :disabled="saving" @click="save">Save profile</button>
          <span v-if="saved" class="ok">Saved ✓</span>
        </div>
      </section>

      <section class="card">
        <h2>Change password</h2>
        <p class="muted">You need a directory password for WebDAV even if you sign in with SSO.</p>
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import PasswordRequirements from '@/components/PasswordRequirements.vue'
import TwoFactorSettings from '@/components/TwoFactorSettings.vue'
import { ldapAdminService, type Profile } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const profile = ref<Profile | null>(null)
const form = reactive({ display_name: '', given_name: '', surname: '', avatar_url: '' })
const error = ref('')
const saving = ref(false)
const saved = ref(false)
const avatarBroken = ref(false)

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
