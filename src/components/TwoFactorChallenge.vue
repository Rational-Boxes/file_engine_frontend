<template>
  <div class="mfa">
    <h1>Two-factor authentication</h1>
    <p class="subtitle">Confirm it's you to finish signing in.</p>

    <!-- Mandate with no enrollment yet: the user can't complete a challenge until
         they set up an authenticator, which needs a session they don't have.
         Surface this clearly rather than looping on a code that can't succeed. -->
    <div v-if="challenge.mustEnroll" class="notice">
      Your organization requires two-factor authentication, but it isn't set up on
      this account yet. Please contact your administrator to complete enrollment.
    </div>

    <template v-else>
      <div v-if="methods.length > 1" class="tabs">
        <button
          v-for="m in methods"
          :key="m"
          class="tab"
          :class="{ active: method === m }"
          @click="selectMethod(m)"
        >
          {{ methodLabel(m) }}
        </button>
      </div>

      <p class="hint">{{ hint }}</p>

      <div v-if="method === 'email' && !emailSent" class="row">
        <button class="btn" :disabled="sending" @click="sendEmail">
          {{ sending ? 'Sending…' : 'Email me a code' }}
        </button>
      </div>

      <form v-else @submit.prevent="submit">
        <input
          v-model="code"
          :inputmode="method === 'recovery' ? 'text' : 'numeric'"
          autocomplete="one-time-code"
          :placeholder="method === 'recovery' ? 'xxxxx-xxxxx' : '123456'"
          autofocus
        />
        <p v-if="auth.error" class="error">{{ auth.error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="auth.loading || !code">
          {{ auth.loading ? 'Verifying…' : 'Verify' }}
        </button>
        <button
          v-if="method === 'email'"
          type="button"
          class="link"
          :disabled="sending"
          @click="sendEmail"
        >
          Resend code
        </button>
      </form>
    </template>

    <p class="back"><button class="link" @click="cancel">← Back to login</button></p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits<{ (e: 'done'): void }>()
const auth = useAuthStore()

// mfaChallenge is guaranteed present while this component is mounted (LoginView
// gates on it), but keep a safe default for the type.
const challenge = computed(
  () => auth.mfaChallenge ?? { mfaToken: '', methods: [], mustEnroll: false },
)

// Order methods so the strongest (authenticator) comes first; recovery last.
const ORDER = ['totp', 'email', 'recovery']
const methods = computed(() =>
  [...challenge.value.methods, 'recovery'].filter((m, i, a) => a.indexOf(m) === i)
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)),
)

const method = ref<string>(methods.value[0] || 'totp')
const code = ref('')
const emailSent = ref(false)
const sending = ref(false)

const hint = computed(() => {
  switch (method.value) {
    case 'totp': return 'Enter the 6-digit code from your authenticator app.'
    case 'email': return emailSent.value ? 'Enter the code we emailed you.' : 'We can email you a one-time code.'
    case 'recovery': return 'Enter one of your saved recovery codes.'
    default: return ''
  }
})

function methodLabel(m: string): string {
  return m === 'totp' ? 'Authenticator' : m === 'email' ? 'Email' : 'Recovery code'
}

function selectMethod(m: string) {
  method.value = m
  code.value = ''
  auth.error = null
}

async function sendEmail() {
  sending.value = true
  auth.error = null
  try {
    await auth.send2faCode('email')
    emailSent.value = true
  } finally {
    sending.value = false
  }
}

async function submit() {
  if (!code.value) return
  if (await auth.verify2fa(method.value, code.value.trim())) {
    emit('done')
  }
}

function cancel() {
  auth.cancelMfa()
}
</script>

<style scoped>
.mfa { display: flex; flex-direction: column; gap: 10px; }
h1 { margin: 0; font-size: 22px; }
.subtitle { margin: 0 0 8px; color: var(--muted); font-size: 14px; }
.tabs { display: flex; gap: 6px; }
.tab { flex: 1; padding: 7px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); font-size: 13px; cursor: pointer; }
.tab.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.hint { margin: 4px 0; color: var(--muted); font-size: 13px; }
.notice { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 13px; }
form { display: flex; flex-direction: column; gap: 12px; }
input { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 16px; letter-spacing: 3px; text-align: center; }
.row { display: flex; }
.btn { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); font-weight: 500; cursor: pointer; }
.btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.btn-primary:disabled { opacity: 0.6; cursor: default; }
.error { color: var(--danger); font-size: 13px; margin: 0; }
.link { background: none; border: none; color: var(--primary); font-size: 13px; cursor: pointer; padding: 0; }
.back { text-align: center; margin: 6px 0 0; }
</style>
