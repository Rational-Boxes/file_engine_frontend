<template>
  <section class="panel">
    <h2>Two-factor authentication policy</h2>
    <p class="muted">
      Choose which second-factor methods members of this tenant may use, and
      whether two-factor is required. You can only narrow what the deployment
      permits.
    </p>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>

    <template v-if="policy && !loading">
      <div class="group">
        <div class="label">Allowed methods</div>
        <label v-for="m in policy.deployment_methods" :key="m" class="check">
          <input type="checkbox" :value="m" v-model="selected" />
          <span>{{ methodLabel(m) }}</span>
        </label>
        <p v-if="!policy.deployment_methods.length" class="muted">
          This deployment has no 2FA methods enabled.
        </p>
      </div>

      <label class="check require">
        <input type="checkbox" v-model="requireMfa" :disabled="policy.required_by_deployment" />
        <span>
          Require two-factor for all members
          <em v-if="policy.required_by_deployment" class="muted"> — enforced deployment-wide</em>
        </span>
      </label>

      <p v-if="requireMfa && !selected.length" class="err">
        Requiring 2FA needs at least one allowed method.
      </p>
      <p class="muted small">
        Members who haven't enrolled yet will be prompted to set up an
        authenticator on their next sign-in.
      </p>

      <div class="actions">
        <button class="btn" :disabled="saving || !dirty || (requireMfa && !selected.length)" @click="save">
          {{ saving ? 'Saving…' : 'Save policy' }}
        </button>
        <button class="btn ghost" :disabled="saving || !dirty" @click="reset">Reset</button>
        <span v-if="saved" class="ok">Saved ✓</span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ldapAdminService, type TwoFactorPolicy } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const policy = ref<TwoFactorPolicy | null>(null)
const selected = ref<string[]>([])
// NB: do NOT name this `require` — Vue's template compiler treats `require` as a
// global identifier and won't bind it to setup scope, throwing ReferenceError at
// render time.
const requireMfa = ref(false)
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref('')

// Dirty when the current selection differs from the loaded policy.
const dirty = computed(() => {
  if (!policy.value) return false
  const a = [...selected.value].sort().join(',')
  const b = [...policy.value.allowed_methods].sort().join(',')
  return a !== b || requireMfa.value !== policy.value.require
})

onMounted(load)
async function load() {
  loading.value = true
  error.value = ''
  try {
    apply(await ldapAdminService.get2faPolicy())
  } catch (e) {
    error.value = errorMessage(e, 'Could not load the 2FA policy')
  } finally {
    loading.value = false
  }
}

function apply(p: TwoFactorPolicy) {
  policy.value = p
  selected.value = [...p.allowed_methods]
  requireMfa.value = p.require || p.required_by_deployment
}

function reset() {
  if (policy.value) apply(policy.value)
  saved.value = false
}

function methodLabel(m: string): string {
  return m === 'totp' ? 'Authenticator app (TOTP)'
    : m === 'email' ? 'Email one-time code'
    : m
}

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    // Send the full cap as null (inherit) so it tracks future deployment changes.
    const full = policy.value && selected.value.length === policy.value.deployment_methods.length
    apply(await ldapAdminService.save2faPolicy(full ? null : selected.value, requireMfa.value))
    saved.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Could not save the 2FA policy')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.panel { border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-top: 16px; }
h2 { margin: 0 0 4px; font-size: 16px; }
.muted { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted.small { font-size: 12px; margin: 6px 0 0; }
.group { margin: 10px 0; }
.label { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.check { display: flex; align-items: center; gap: 8px; font-size: 14px; padding: 4px 0; }
.check input { width: 16px; height: 16px; }
.require { margin-top: 8px; }
.actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.btn { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--primary); color: #fff; font-size: 14px; cursor: pointer; }
.btn.ghost { background: var(--card); color: inherit; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ok { color: #15803d; font-size: 13px; }
.err { color: #b00020; font-size: 13px; }
</style>
