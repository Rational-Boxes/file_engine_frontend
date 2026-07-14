<template>
  <div class="mfa">
    <h1>Two-factor authentication</h1>
    <p class="subtitle">Confirm it's you to finish signing in.</p>

    <!-- Mandate with no enrollment yet: guide the user through TOTP setup right
         here (grace enrollment), rather than dead-ending on "contact your admin". -->
    <template v-if="challenge.mustEnroll">
      <div v-if="recoveryCodes.length" class="enroll-codes">
        <p class="ok">2FA is on. Save these recovery codes somewhere safe — each works once if you lose your device, and they won't be shown again.</p>
        <ul class="codes"><li v-for="c in recoveryCodes" :key="c"><code>{{ c }}</code></li></ul>
        <button class="btn btn-primary" @click="emit('done')">Continue</button>
      </div>
      <template v-else>
        <div class="notice">Your organization requires two-factor authentication. Set it up now to finish signing in.</div>
        <div v-if="setup" class="enroll">
          <QrCode :value="setup.otpauth_uri" :size="180" />
          <div class="manual">
            <div class="muted small">Scan with an authenticator app, or enter this key:</div>
            <code class="secret">{{ groupedSecret }}</code>
          </div>
        </div>
        <p v-else class="hint">Preparing your setup code…</p>
        <form @submit.prevent="submitEnroll">
          <input v-model="enrollCode" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="123456" :disabled="!setup" autofocus />
          <p v-if="auth.error" class="error">{{ auth.error }}</p>
          <button class="btn btn-primary" type="submit" :disabled="auth.loading || !setup || enrollCode.length < 6">
            {{ auth.loading ? 'Verifying…' : 'Enable & continue' }}
          </button>
        </form>
      </template>
    </template>

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
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import QrCode from '@/components/QrCode.vue'

const emit = defineEmits<{ (e: 'done'): void }>()
const auth = useAuthStore()

// mfaChallenge is guaranteed present while this component is mounted (LoginView
// gates on it), but keep a safe default for the type.
const challenge = computed(
  () => auth.mfaChallenge ?? { mfaToken: '', methods: [], mustEnroll: false },
)

// --- grace enrollment (mustEnroll): set up TOTP inline, then finish signing in ---
const setup = ref<{ secret: string; otpauth_uri: string } | null>(null)
const enrollCode = ref('')
const recoveryCodes = ref<string[]>([])
const groupedSecret = computed(() =>
  (setup.value?.secret.match(/.{1,4}/g) || []).join(' '),
)

onMounted(async () => {
  if (challenge.value.mustEnroll) {
    setup.value = await auth.begin2faEnrollment()
  }
})

async function submitEnroll() {
  if (enrollCode.value.length < 6) return
  const codes = await auth.complete2faEnrollment(enrollCode.value.trim())
  if (codes) recoveryCodes.value = codes   // shows the recovery-codes step, then Continue
}

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
.enroll { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin: 4px 0; }
.manual { display: flex; flex-direction: column; gap: 6px; }
.small { font-size: 12px; }
.muted { color: var(--muted); }
.secret { font-size: 15px; letter-spacing: 1px; background: var(--bg); padding: 6px 8px; border-radius: 6px; user-select: all; }
.enroll-codes { display: flex; flex-direction: column; gap: 10px; }
.ok { color: #15803d; font-size: 13px; margin: 0; }
.codes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; list-style: none; padding: 0; margin: 0; }
.codes code { font-size: 14px; letter-spacing: 1px; }
</style>
