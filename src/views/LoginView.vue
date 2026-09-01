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

<template>
  <div class="login-page">
    <div class="login-card">
      <TwoFactorChallenge v-if="auth.mfaChallenge" @done="onMfaDone" />
      <template v-else>
      <img v-if="branding.iconUrl" class="login-icon" :src="branding.iconUrl" alt="" />
      <h1>{{ branding.appName }}</h1>
      <p class="subtitle">Sign in to continue</p>

      <p v-if="route.query.reason === '2fa'" class="notice-2fa">
        This workspace requires two-factor authentication. Please sign in again to continue.
      </p>

      <!--
        Only what this deployment actually has configured — asked of the bridge
        at load time. Nothing renders while the answer is outstanding, so the
        buttons appear once rather than flashing in and out.
      -->
      <div v-if="providers.length" class="providers">
        <button
          v-for="p in providers"
          :key="p"
          class="btn btn-provider"
          @click="loginWithProvider(p)"
        >
          <ProviderIcon :name="p" />
          <span>Sign in with {{ label(p) }}</span>
        </button>
      </div>

      <div v-if="providers.length" class="divider"><span>or</span></div>

      <form class="ldap-form" @submit.prevent="loginLdap">
        <label>
          Username
          <input v-model="username" type="text" autocomplete="username" required />
        </label>
        <label>
          Password
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="auth.error" class="error">{{ auth.error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="auth.loading">
          {{ auth.loading ? 'Signing in…' : 'Log in' }}
        </button>
        <p class="forgot"><RouterLink to="/reset-password">Forgot password?</RouterLink></p>
      </form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '@/services/apiClient'
import ProviderIcon from '@/components/ProviderIcon.vue'
import { isLoginOrigin, tenantOrigin } from '@/utils/tenantHost'
import { chooseTenant, setLastTenant } from '@/utils/lastTenant'
import { forgetReachability, tenantOriginReachable } from '@/utils/tenantReach'
import { nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'
import { stashRedirect, takeRedirect } from '@/utils/redirect'
import TwoFactorChallenge from '@/components/TwoFactorChallenge.vue'
import { useBranding } from '@/composables/useBranding'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { branding } = useBranding()

// Leave the login page once a session exists. Done as a helper (not a bare
// router.push) because the router guard reads auth.isAuthenticated: pushing in the
// same tick the token is stored can have the guard evaluate the *previous* value
// and bounce straight back to /login — leaving the user on the login form with a
// valid session until they reload. Sync + nextTick lets reactivity settle, and we
// re-check in case a guard still redirected us back.
async function goAfterLogin() {
  auth.syncToken()
  await nextTick()
  const target = takeRedirect()

  // On the shared sign-in origin there is nothing to route INTO: this origin is
  // reserved and is not a tenant, so an in-app navigation just leaves the user
  // here. Hand the new session to a workspace instead.
  //
  // This is where sign-in was quietly ending up. handOffToWorkspace was only
  // ever called from onMounted — the "already signed in, second tab" case — so
  // a FRESH sign-in fell through to the in-app replace below and never left the
  // sign-in subdomain. It looked like the reachability fallback, because the
  // symptom is identical: a working app on the wrong origin. It was not; the
  // probe had not been consulted at all.
  if (isLoginOrigin()) {
    auth.mfaChallenge = null
    return void await handOffToWorkspace(target === '/dashboard' ? '' : target)
  }

  await router.replace(target)
  if (router.currentRoute.value.path === '/login' && auth.isAuthenticated) {
    await router.replace(target === '/login' ? '/dashboard' : target)
  }
  // Navigated away — drop any completed challenge state (kept set until now so the
  // challenge/recovery-codes UI stayed mounted through completion).
  auth.mfaChallenge = null
}

// Persist the intended post-login destination (e.g. a shared deep link) so it
// survives both LDAP login and the OAuth round-trip through the IdP.
stashRedirect(route.query.redirect)

const username = ref('')
const password = ref('')

// Populated from the bridge on mount. Empty until then, and empty forever if
// nothing is configured — in which case the block above renders nothing at all
// and the username/password form is the whole login screen.
const providers = ref<string[]>([])

// Names as their owners write them. Everything else falls back to
// capitalisation, which is right for a self-hosted "keycloak" or "okta".
const LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  gitlab: 'GitLab',
  microsoft: 'Microsoft',
  linkedin: 'LinkedIn',
  okta: 'Okta',
  auth0: 'Auth0',
  keycloak: 'Keycloak',
}

const label = (p: string) => LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1)

onMounted(async () => {
  providers.value = await authService.oauthProviders()
  // Already signed in AND standing on the shared sign-in origin: there is
  // nothing to log into here, so go straight on to a workspace. Happens when a
  // second tab is opened, or when a tenant bounced someone here whose session
  // was in fact still good.
  if (isLoginOrigin() && auth.isAuthenticated) await handOffToWorkspace()
})

/**
 * Carry this session to a tenant's own origin.
 *
 * Only runs on the shared sign-in origin, which is not a tenant and has no app
 * to show. The destination is the remembered workspace when the user still has
 * it, else their first — the token's roles map is the authority on what they
 * may reach, never the remembered hint.
 */
async function handOffToWorkspace(nextPath?: string) {
  const available = auth.tenants   // string[] — the tenants this token carries
  // A bounce carries WHICH workspace was being asked for (`?t=`), and honouring
  // it is not optional: without this the router guard's `t` was written and
  // never read, so anyone arriving here for a specific tenant was sent to their
  // REMEMBERED one instead. That silently broke tenant switching — leaving a
  // tenant origin for another one round-trips through here, and landing back on
  // the tenant you just left looks like the switch did nothing at all.
  //
  // It is a hint from the URL, so it is checked against the token's tenant list
  // rather than obeyed — that list is the authority on what the user may reach.
  // An unrecognised or absent name falls through to the normal choice
  // (remembered, else first), so a stale link degrades instead of failing.
  const requested = String(route.query.t || '')
  const target = available.includes(requested) ? requested : chooseTenant(available)
  if (!target) {
    // Authenticated, but a member of nothing. Saying so is far better than an
    // empty app or a redirect loop back to this page.
    auth.error = 'Your account is not a member of any workspace yet. '
      + 'Ask an administrator to add you to one.'
    return
  }
  // Where to land once the session is on the tenant's origin. A caller-supplied
  // path wins (a fresh sign-in carries the stashed redirect); otherwise it is
  // whatever the bounce brought us here with.
  const next = nextPath || String(route.query.next || '')
  setLastTenant(target)

  // Forwarding to the tenant's own origin is the preferred outcome — its own
  // cookie jar and storage, and a URL that says which workspace you are in. But
  // a deployment can have tenants whose subdomain was never set up, and
  // forwarding there strands the user on a browser error page, outside the app,
  // on a host our code cannot reach to explain from. So check first.
  if (await tenantOriginReachable(tenantOrigin(target))) {
    try {
      const code = await authService.ssoHandoff(target)
      // `next` is a PATH, and the tenant comes from our own choice — never a
      // full URL from the query, which would make this an open redirect.
      const url = new URL(tenantOrigin(target) + '/sso')
      url.searchParams.set('code', code)
      if (next) url.searchParams.set('next', next)
      window.location.href = url.toString()
      return
    } catch (e) {
      // The probe said the origin was live, so a failure here is the hand-off
      // itself, not the destination. Fall through and serve the workspace from
      // this origin rather than stopping at an error the user cannot act on.
      console.warn('SSO hand-off failed; serving the workspace from here', e)
      forgetReachability(tenantOrigin(target))
    }
  }

  // Fallback: stay put and run the app as this tenant. Not a degraded mode —
  // the tenant travels as X-Tenant, which the bridge honours regardless of
  // host, so every request is scoped exactly as it would be on the subdomain.
  // We are already authenticated on this origin, so no hand-off is needed at
  // all; the session we just created is the one being used.
  auth.switchTenant(target)
  await router.replace(next || '/dashboard')
}

const loginWithProvider = (p: string) => {
  stashRedirect(route.query.redirect) // ensure it's saved right before leaving the SPA
  authService.oauthRedirect(p)
}

const loginLdap = async () => {
  // Returns false (with auth.mfaChallenge set) when a second factor is needed —
  // the template swaps to <TwoFactorChallenge>, which emits `done` on success.
  if (await auth.ldapLogin(username.value, password.value)) {
    await goAfterLogin()
  }
}

const onMfaDone = () => {
  void goAfterLogin()
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 360px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

h1 {
  margin: 0;
  font-size: 24px;
}

.login-icon {
  display: block;
  height: 48px;
  max-width: 220px;
  margin: 0 0 12px;
  object-fit: contain;
}

.subtitle {
  margin: 4px 0 24px;
  color: var(--muted);
}

.providers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--card);
  font-weight: 500;
}

.btn-provider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.btn-provider:hover {
  background: var(--bg);
}

.btn-primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.divider {
  text-align: center;
  margin: 20px 0;
  position: relative;
  color: var(--muted);
  font-size: 13px;
}

.divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border);
}

.divider span {
  background: var(--card);
  padding: 0 10px;
  position: relative;
}

.ldap-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ldap-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.ldap-form input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.error {
  color: var(--danger);
  font-size: 13px;
  margin: 0;
}
.notice-2fa {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 16px;
}
.forgot {
  text-align: center;
  margin: 4px 0 0;
  font-size: 13px;
}
.forgot a {
  color: var(--primary);
  text-decoration: none;
}
.forgot a:hover {
  text-decoration: underline;
}
</style>
