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

<!--
  Invite a user into this workspace. A modal rather than a panel under the roster:
  inviting is an occasional act, and the roster is what the tab is for.

  One flow by email, whether or not the person already has a platform account —
  and the UI never says which. If they are new, the server creates a pending
  account and emails a set-password link; if they already exist, it adds them and
  emails an informational notice. That difference is deliberately invisible here,
  because whether an email already has an account is someone else's personal
  information (SPECIFICATION §6.2). So the copy stays neutral and the result is
  the same either way — there is nothing to type differently and nothing to learn.

  At least one role is required: membership of a workspace IS holding one of its
  roles. The server enforces this (422); the button below mirrors it.
-->

<template>
  <Teleport to="body">
    <div v-if="open" class="iv-root" role="dialog" aria-modal="true" aria-label="Invite a user">
      <div class="iv-backdrop" @click="close"></div>

      <form ref="panelEl" class="iv-panel" @submit.prevent="submit" @keydown="onKeydown">
        <button class="iv-x" type="button" title="Close" @click="close">✕</button>

        <h2 class="iv-title">Invite a user</h2>
        <p class="iv-sub">
          They'll get an email inviting them to this workspace — with a link to set a
          password if they don't already have an account.
        </p>

        <label class="iv-field">
          <span>Email address</span>
          <input
            ref="emailEl"
            v-model="email"
            type="email"
            required
            placeholder="email@company.com"
            autocomplete="off"
          />
        </label>

        <label class="iv-field">
          <span>Display name</span>
          <input v-model="displayName" required placeholder="Ann Adams" autocomplete="off" />
        </label>

        <fieldset class="iv-field iv-roles">
          <legend>Roles in this workspace</legend>
          <label v-for="r in roles" :key="r.name" class="iv-chk">
            <input type="checkbox" :value="r.name" v-model="chosenRoles" /> {{ r.name }}
          </label>
          <p v-if="!roles.length" class="iv-warn">
            This workspace has no roles yet — create one on the Roles tab before
            inviting anyone, since a member must hold at least one role.
          </p>
          <p v-else-if="!chosenRoles.length" class="iv-note">
            Pick at least one — a member of this workspace holds at least one role.
          </p>
        </fieldset>

        <p v-if="error" class="iv-err" role="alert">{{ error }}</p>

        <div class="iv-actions">
          <button class="iv-btn" type="button" :disabled="busy" @click="close">Cancel</button>
          <button class="iv-btn iv-primary" type="submit" :disabled="!canSubmit">
            {{ busy ? 'Sending…' : 'Send invitation' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ldapAdminService, type Role } from '@/services/ldapAdminService'
import { errorMessage } from '@/services/apiClient'

const props = defineProps<{
  open: boolean
  roles: Role[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  // The invite went out — the parent reports it and reloads the roster.
  (e: 'invited', email: string): void
}>()

const email = ref('')
const displayName = ref('')
const chosenRoles = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const panelEl = ref<HTMLElement | null>(null)
const emailEl = ref<HTMLInputElement | null>(null)

// >=1 role is part of what makes a valid invite (membership is holding a role),
// so it gates the button exactly as the server gates the request.
const canSubmit = computed(
  () => !!email.value && !!displayName.value && chosenRoles.value.length > 0 && !busy.value,
)

// A fresh form every time it opens: a half-typed invite left over from last time
// is more likely to be sent by accident than to be wanted.
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    email.value = ''
    displayName.value = ''
    chosenRoles.value = []
    error.value = ''
    await nextTick()
    emailEl.value?.focus()
  },
)

function close() {
  if (busy.value) return   // never abandon a request that is already in flight
  emit('close')
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    const user = await ldapAdminService.createUser(
      email.value,
      displayName.value,
      chosenRoles.value,
    )
    emit('invited', user.email)
    emit('close')
  } catch (e) {
    // Stay open on failure with the fields intact — "already exists" and a
    // rejected address are both worth correcting in place.
    error.value = errorMessage(e, 'Could not send the invite')
  } finally {
    busy.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (e.key !== 'Tab') return
  const focusable = panelEl.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
  )
  if (!focusable || focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<style scoped>
/* Below ConfirmModal's 1000, in line with the profile modal. */
.iv-root { position: fixed; inset: 0; z-index: 900; display: flex; align-items: center; justify-content: center; }
.iv-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.iv-panel {
  position: relative; width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
  overflow: auto; background: var(--card); color: var(--fg); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); padding: 20px;
}
.iv-x { position: absolute; top: 10px; right: 10px; border: none; background: none; color: var(--muted); font-size: 15px; cursor: pointer; line-height: 1; padding: 4px; }
.iv-x:hover { color: var(--fg); }
.iv-title { margin: 0 24px 2px 0; font-size: 1.1rem; }
.iv-sub { margin: 0 0 4px; color: var(--muted); font-size: 12px; line-height: 1.45; }

.iv-field { display: flex; flex-direction: column; gap: 4px; margin-top: 14px; font-size: 13px; }
.iv-field > span, .iv-roles legend { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 0; }
.iv-field input[type='email'], .iv-field input:not([type]) { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; background: var(--bg); color: var(--fg); width: 100%; }
.iv-roles { border: none; padding: 0; margin-top: 16px; }
.iv-chk { display: inline-flex; align-items: center; gap: 6px; margin: 6px 12px 0 0; font-size: 13px; }
.iv-note { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.iv-warn { margin: 8px 0 0; color: var(--danger); font-size: 12px; line-height: 1.45; }
.iv-muted { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
.iv-err { color: var(--danger); font-size: 13px; margin: 12px 0 0; }
.iv-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
.iv-btn { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); cursor: pointer; font-size: 13px; }
.iv-btn:hover:not(:disabled) { border-color: var(--primary); }
.iv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.iv-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.iv-primary:hover:not(:disabled) { filter: brightness(1.08); }
</style>
