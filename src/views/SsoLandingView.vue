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
  Deep-link SSO landing (§5.5). An external system deep-links the user here with a
  one-time hand-off code minted from their session in that system:
      /sso?code=<code>&target=<file uid>
  We redeem the code for a FileEngine session and continue to the target (or dashboard).
  The code is single-use + short-lived; it is never persisted.
-->
<template>
  <div class="sso">
    <p>{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const message = ref('Signing you in…')

function targetPath(): string {
  const t = route.query.target
  const uid = Array.isArray(t) ? t[0] : t
  return uid ? `/preview/${encodeURIComponent(String(uid))}` : '/dashboard'
}

onMounted(async () => {
  const c = route.query.code
  const code = Array.isArray(c) ? c[0] : c
  if (!code) {
    message.value = 'Missing sign-in code. Redirecting…'
    return void router.replace('/login')
  }
  // Strip the code from the address bar immediately (avoid it lingering in history).
  const dest = targetPath()
  if (await auth.redeemSso(String(code))) {
    router.replace(dest)
  } else {
    message.value = auth.error || 'This sign-in link is invalid or has expired.'
    setTimeout(() => router.replace('/login'), 1500)
  }
})
</script>

<style scoped>
.sso {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
</style>
