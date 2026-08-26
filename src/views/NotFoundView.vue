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
  The catch-all. It exists because its absence is invisible: an SPA whose router
  matches nothing renders nothing, and the server has already answered 200 with
  the shell, so a mistyped or retired URL looks exactly like a broken app and
  leaves no trace in any log. Every unrouted path landed here as a blank page —
  including, for a while, every invitation and password-reset link this
  deployment mailed out.

  It shows the path, because the first useful question is always "what URL did
  they actually open", and offers the one link that is right whichever way the
  visitor got here.
-->
<template>
  <div class="nf">
    <div class="card">
      <h1>Page not found</h1>
      <p class="muted">Nothing here answers to:</p>
      <p class="path"><code>{{ path }}</code></p>

      <!-- A link that has expired or been mistyped is by far the likeliest way
           to arrive, and it is the one case where the visitor is NOT signed in
           and cannot get anywhere from a nav bar they are not being shown. -->
      <p v-if="looksLikeAnEmailLink" class="hint">
        If you followed an invitation or password-reset email, that link may have
        expired. Ask whoever invited you to send a new one.
      </p>

      <router-link class="btn" to="/dashboard">Go to your dashboard</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const path = computed(() => route.fullPath)

// A token in the query is the tell that this was a mailed link rather than a
// typo, and it changes which advice is useful.
const looksLikeAnEmailLink = computed(() => Boolean(route.query.token))
</script>

<style scoped>
.nf { min-height: 60vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.card {
  max-width: 32rem; width: 100%; text-align: center;
  border: 1px solid var(--border); border-radius: 12px; padding: 28px 24px; background: var(--card);
}
h1 { font-size: 20px; margin: 0 0 8px; }
.muted { color: var(--muted); font-size: 14px; margin: 0 0 4px; }
.path { margin: 0 0 16px; overflow-wrap: anywhere; }
.path code { font-size: 13px; color: var(--fg); }
.hint { font-size: 13px; color: var(--muted); margin: 0 0 16px; }
.btn {
  display: inline-block; padding: 8px 16px; border-radius: 8px;
  background: var(--primary); color: #fff; text-decoration: none; font-size: 14px;
}
</style>
