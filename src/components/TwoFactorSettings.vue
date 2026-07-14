<template>
  <section class="card">
    <div class="head">
      <h2>Two-factor authentication</h2>
      <span v-if="status" class="badge" :class="status.enabled ? 'on' : 'off'">
        {{ status.enabled ? 'On' : 'Off' }}
      </span>
    </div>
    <p class="muted">
      Protect your account with a time-based code from an authenticator app
      (Google Authenticator, 1Password, Authy, …).
      <template v-if="status?.required"> Your organization requires 2FA.</template>
    </p>

    <p v-if="error" class="err">{{ error }}</p>

    <!-- Idle: show current state + entry points -->
    <template v-if="mode === 'idle' && status">
      <div v-if="status.enabled" class="row">
        <span class="ok">Enabled · {{ status.recovery_remaining }} recovery codes left</span>
        <div class="spacer" />
        <button class="btn ghost" @click="startRegen">Regenerate recovery codes</button>
        <button class="btn danger" @click="startDisable">Turn off</button>
      </div>
      <div v-else class="row">
        <button class="btn" :disabled="!totpAllowed" @click="beginSetup">Set up authenticator app</button>
        <span v-if="!totpAllowed" class="muted">Authenticator (TOTP) is not enabled for this tenant.</span>
      </div>
    </template>

    <!-- Enrollment: QR + secret, then confirm with a code -->
    <template v-if="mode === 'setup' && setup">
      <ol class="steps">
        <li>Scan this QR code with your authenticator app, or enter the key manually.</li>
      </ol>
      <div class="enroll">
        <QrCode :value="setup.otpauth_uri" :size="196" />
        <div class="manual">
          <div class="muted">Manual entry key</div>
          <code class="secret">{{ grouped(setup.secret) }}</code>
          <div class="muted small">Issuer: {{ setup.issuer }} · Account: {{ setup.account }}</div>
        </div>
      </div>
      <label class="codein">
        Enter the 6-digit code to confirm
        <input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
               placeholder="123456" @keyup.enter="confirmSetup" />
      </label>
      <div class="row">
        <button class="btn" :disabled="busy || code.length < 6" @click="confirmSetup">Confirm &amp; enable</button>
        <button class="btn ghost" :disabled="busy" @click="reset">Cancel</button>
      </div>
    </template>

    <!-- Disable / regenerate: require a current code -->
    <template v-if="mode === 'disable' || mode === 'regen'">
      <label class="codein">
        {{ mode === 'disable' ? 'Enter a current code or a recovery code to turn off 2FA' : 'Enter a current code to regenerate recovery codes' }}
        <input v-model="code" inputmode="numeric" autocomplete="one-time-code"
               placeholder="123456 or a recovery code" @keyup.enter="confirmAction" />
      </label>
      <div class="row">
        <button class="btn" :class="{ danger: mode === 'disable' }" :disabled="busy || !code" @click="confirmAction">
          {{ mode === 'disable' ? 'Turn off 2FA' : 'Regenerate' }}
        </button>
        <button class="btn ghost" :disabled="busy" @click="reset">Cancel</button>
      </div>
    </template>

    <!-- Recovery codes shown once, after enable or regenerate -->
    <template v-if="mode === 'codes'">
      <p class="ok">Save these recovery codes somewhere safe. Each works once if you lose your device — they won't be shown again.</p>
      <ul class="codes">
        <li v-for="c in recoveryCodes" :key="c"><code>{{ c }}</code></li>
      </ul>
      <div class="row">
        <button class="btn ghost" @click="copyCodes">{{ copied ? 'Copied ✓' : 'Copy codes' }}</button>
        <button class="btn" @click="finishCodes">Done</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import QrCode from '@/components/QrCode.vue'
import { ldapAdminService, type TwoFactorStatus, type TwoFactorSetup } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

type Mode = 'idle' | 'setup' | 'disable' | 'regen' | 'codes'

const status = ref<TwoFactorStatus | null>(null)
const setup = ref<TwoFactorSetup | null>(null)
const mode = ref<Mode>('idle')
const code = ref('')
const recoveryCodes = ref<string[]>([])
const error = ref('')
const busy = ref(false)
const copied = ref(false)

const totpAllowed = computed(() => status.value?.methods?.includes('totp') ?? true)

onMounted(refresh)
async function refresh() {
  try {
    status.value = await ldapAdminService.twofaStatus()
  } catch (e) {
    error.value = errorMessage(e, 'Could not load 2FA status')
  }
}

// Group the base32 secret in 4-char blocks for readable manual entry.
function grouped(s: string): string {
  return (s.match(/.{1,4}/g) || [s]).join(' ')
}

function reset() {
  mode.value = 'idle'
  code.value = ''
  setup.value = null
  error.value = ''
}

async function beginSetup() {
  error.value = ''
  busy.value = true
  try {
    setup.value = await ldapAdminService.twofaSetup()
    mode.value = 'setup'
    code.value = ''
  } catch (e) {
    error.value = errorMessage(e, 'Could not start enrollment')
  } finally {
    busy.value = false
  }
}

async function confirmSetup() {
  if (code.value.length < 6) return
  busy.value = true
  error.value = ''
  try {
    const res = await ldapAdminService.twofaVerifySetup(code.value.trim())
    recoveryCodes.value = res.recovery_codes
    code.value = ''
    setup.value = null
    mode.value = 'codes'
    await refresh()
  } catch (e) {
    error.value = errorMessage(e, 'That code did not match — try the current one')
  } finally {
    busy.value = false
  }
}

function startDisable() { mode.value = 'disable'; code.value = ''; error.value = '' }
function startRegen() { mode.value = 'regen'; code.value = ''; error.value = '' }

async function confirmAction() {
  if (!code.value) return
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'disable') {
      await ldapAdminService.twofaDisable(code.value.trim())
      reset()
      await refresh()
    } else {
      const res = await ldapAdminService.twofaRegenerateRecovery(code.value.trim())
      recoveryCodes.value = res.recovery_codes
      code.value = ''
      mode.value = 'codes'
      await refresh()
    }
  } catch (e) {
    error.value = errorMessage(e, 'A valid code is required')
  } finally {
    busy.value = false
  }
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* clipboard blocked — the codes are visible to copy manually */
  }
}

function finishCodes() {
  recoveryCodes.value = []
  reset()
}
</script>

<style scoped>
.card { border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; align-items: center; gap: 10px; }
h2 { margin: 0; font-size: 16px; }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.badge.on { background: #dcfce7; color: #15803d; }
.badge.off { background: var(--bg); color: var(--muted); }
.muted { color: var(--muted); font-size: 13px; margin: 0; }
.muted.small { font-size: 11px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.spacer { flex: 1; }
.steps { margin: 4px 0; padding-left: 18px; font-size: 13px; }
.enroll { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.manual { display: flex; flex-direction: column; gap: 4px; }
.secret { font-size: 15px; letter-spacing: 1px; background: var(--bg); padding: 6px 8px; border-radius: 6px; user-select: all; }
.codein { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.codein input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 15px; letter-spacing: 2px; max-width: 260px; }
.codes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; list-style: none; padding: 0; margin: 4px 0; }
.codes code { font-size: 14px; letter-spacing: 1px; }
.btn { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 14px; cursor: pointer; }
.btn.ghost { background: var(--card); color: var(--text, inherit); }
.btn.danger { background: var(--danger, #b00020); border-color: var(--danger, #b00020); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ok { color: #15803d; font-size: 13px; }
.err { color: #b00020; font-size: 13px; }
</style>
