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
import { safeRedirect } from '@/utils/redirect'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const message = ref('Signing you in…')

function targetPath(): string {
  // `next` is a PATH, used by the shared sign-in origin and the tenant switcher
  // to carry where the user was actually headed. It was previously ignored here
  // — this view only understood `target` — so every hand-off silently landed on
  // the dashboard and any deep link was lost on the way through.
  //
  // Run through safeRedirect, which is the open-redirect guard: only an
  // absolute same-origin path is accepted, never a full or protocol-relative
  // URL. That matters more here than almost anywhere, because this page is
  // reached pre-auth and acts immediately.
  const n = route.query.next
  const next = Array.isArray(n) ? n[0] : n
  if (next) return safeRedirect(String(next))

  const t = route.query.target
  const uid = Array.isArray(t) ? t[0] : t
  // Land on the file LIST with the file revealed + selected (FileBrowserView honors
  // ?file=<uid>: it navigates to the containing folder, selects the row, opens the
  // details drawer) — rather than jumping straight into the preview.
  return uid ? `/files?file=${encodeURIComponent(String(uid))}` : '/dashboard'
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
