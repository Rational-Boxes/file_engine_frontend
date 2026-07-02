<template>
  <ul class="pw-req" v-if="policy">
    <li v-for="r in rules" :key="r.key" :class="{ met: r.met }">
      <span class="mark">{{ r.met ? '✓' : '○' }}</span> {{ r.label }}
    </li>
  </ul>
</template>

<script setup lang="ts">
// Live password-policy checklist. Fetches the active rules from the public
// /v1/password-policy endpoint and evaluates the given password against them
// (mirroring the server), so the user sees exactly what's missing. The server
// stays authoritative. Emits `valid` so the parent can gate its submit button.
import { computed, onMounted, ref, watch } from 'vue'
import { ldapAdminService, type PasswordPolicy } from '@/services/ldapAdminService'

const props = defineProps<{ password: string; identity?: string }>()
const emit = defineEmits<{ (e: 'valid', v: boolean): void }>()

const policy = ref<PasswordPolicy | null>(null)

onMounted(async () => {
  try {
    policy.value = await ldapAdminService.passwordPolicy()
  } catch {
    /* policy endpoint unavailable — the server still enforces on submit */
  }
})

const SYMBOLS = /[^A-Za-z0-9]/

const rules = computed(() => {
  const p = policy.value
  const pw = props.password || ''
  if (!p) return []
  const classes = [/[A-Z]/.test(pw), /[a-z]/.test(pw), /\d/.test(pw), SYMBOLS.test(pw)]
  const out: { key: string; label: string; met: boolean }[] = [
    { key: 'min', label: `At least ${p.min_length} characters`, met: pw.length >= p.min_length },
  ]
  if (pw.length > p.max_length) out.push({ key: 'max', label: `No more than ${p.max_length} characters`, met: false })
  if (p.min_classes > 0) {
    out.push({ key: 'classes', label: `At least ${p.min_classes} of: uppercase, lowercase, digit, symbol`, met: classes.filter(Boolean).length >= p.min_classes })
  } else {
    if (p.require_upper) out.push({ key: 'upper', label: 'An uppercase letter', met: classes[0] })
    if (p.require_lower) out.push({ key: 'lower', label: 'A lowercase letter', met: classes[1] })
    if (p.require_digit) out.push({ key: 'digit', label: 'A digit', met: classes[2] })
    if (p.require_symbol) out.push({ key: 'symbol', label: 'A symbol', met: classes[3] })
  }
  if (p.forbid_identity_substring && props.identity) {
    const id = props.identity.split('@')[0].toLowerCase()
    out.push({ key: 'identity', label: 'Does not contain your name or email', met: !(id.length >= 3 && pw.toLowerCase().includes(id)) })
  }
  return out
})

const allMet = computed(() => rules.value.length > 0 && rules.value.every((r) => r.met))
watch(allMet, (v) => emit('valid', v), { immediate: true })
</script>

<style scoped>
.pw-req {
  list-style: none;
  margin: 6px 0;
  padding: 0;
  font-size: 12px;
  color: var(--muted);
}
.pw-req li.met {
  color: #15803d;
}
.pw-req .mark {
  display: inline-block;
  width: 14px;
}
</style>
