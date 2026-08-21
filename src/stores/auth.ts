// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { defineStore } from 'pinia'
import axios from 'axios'
import { authService, type Identity } from '@/services/authService'
import { tokenStorage } from '@/utils/tokenStorage'
import { errorMessage } from '@/services/apiClient'
import { clearLastTenant, setLastTenant } from '@/utils/lastTenant'
import { activeTenantFromHost } from '@/utils/tenantHost'

type AccessLevel = 'user' | 'editor' | 'admin'

const LEVELS: Record<AccessLevel, number> = { user: 1, editor: 2, admin: 3 }

function levelFromRoles(roles: string[]): AccessLevel {
  if (roles.includes('administrators') || roles.includes('system_admin')) return 'admin'
  if (roles.includes('editor')) return 'editor'
  return 'user'
}

// Pending token-refresh timer (module-scoped; not reactive state).
let refreshTimer: ReturnType<typeof setTimeout> | undefined

interface AuthState {
  // Reactive mirror of the stored bearer token. isAuthenticated derives from
  // this so login/logout update the UI and router guards immediately (reading
  // the non-reactive tokenStorage from a getter would cache a stale value).
  token: string | null
  user: string | null
  tenant: string | null
  // Tenants this user may operate in; populated by loadTenants(), drives the
  // tenant selector.
  tenants: string[]
  roles: string[]
  accessLevel: AccessLevel
  loading: boolean
  error: string | null
  // Set when a password login needs a second factor (PROPOSAL §4.6): holds the
  // short-lived challenge token + the methods the user may use. Cleared on
  // successful verification or a fresh login attempt. Its presence drives the
  // LoginView to show the 2FA challenge step.
  mfaChallenge: { mfaToken: string; methods: string[]; mustEnroll: boolean } | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: tokenStorage.getAccessToken(),
    user: null,
    tenant: null,
    tenants: [],
    roles: [],
    accessLevel: 'user',
    loading: false,
    error: null,
    mfaChallenge: null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    hasAccessLevel: (state) => (level: AccessLevel) =>
      LEVELS[state.accessLevel] >= (LEVELS[level] ?? 1),

    /**
     * Does the user hold a named LDAP role in the active tenant?
     *
     * `hasAccessLevel` answers the coarse viewer/editor/admin ladder; this
     * answers membership of a specific group, which is how capabilities that
     * are not a rung on that ladder are gated — `share_external` being the
     * first. Case-insensitive: LDAP `cn` values are not normalised.
     */
    hasRole: (state) => (role: string) =>
      state.roles.some((r) => r.toLowerCase() === role.toLowerCase()),
  },

  actions: {
    // Pull the current (unexpired) token from storage into reactive state.
    syncToken() {
      this.token = tokenStorage.getAccessToken()
    },

    // Schedule the next token re-mint at ~60% of the current token's remaining
    // lifetime (min 20s), so the short-TTL JWT is refreshed from live LDAP well
    // before it expires and role changes propagate within the interval.
    scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer)
      const expiresAt = tokenStorage.getTokens()?.expiresAt
      if (!expiresAt) return
      const delay = Math.max(20_000, Math.floor((expiresAt - Date.now()) * 0.6))
      refreshTimer = setTimeout(() => {
        void this.doRefresh()
      }, delay)
    },

    // Re-mint the token; re-apply identity (roles may have changed in LDAP), then
    // reschedule. On failure the session is over — log out.
    async doRefresh() {
      try {
        await authService.refresh()
        this.syncToken()
        this.applyIdentity(await authService.whoami())
        this.scheduleRefresh()
      } catch {
        await this.logout()
      }
    },

    applyIdentity(id: Identity) {
      this.user = id.user
      this.tenant = id.tenant
      this.roles = id.roles || []
      this.accessLevel = levelFromRoles(this.roles)
    },

    // Adopt the tenant implied by the SPA's subdomain (someco.host.com → someco)
    // as the active tenant, before any request goes out. The subdomain is
    // authoritative for which tenant site we're on, so it overrides a previously
    // persisted selection; on the apex / a non-tenant host we keep whatever was
    // persisted. Call this first in app bootstrap so whoami() is scoped right.
    initTenantFromHost() {
      const fromHost = activeTenantFromHost()
      if (fromHost) {
        tokenStorage.setActiveTenant(fromHost)
        this.tenant = fromHost
        // Remember it for the shared login origin. Recorded HERE rather than at
        // sign-in so that arriving by any route counts — following a link,
        // switching workspace in-app, or typing the URL — which is the whole
        // reason this is a parent-domain cookie and not login-origin storage.
        setLastTenant(fromHost)
      } else {
        this.tenant = tokenStorage.getActiveTenant()
      }
    },

    // On app start: if a valid token is present, hydrate the identity.
    async initialize() {
      this.syncToken()
      if (!this.token) return
      // Show the switcher immediately from the remembered set; loadTenants refreshes.
      this.tenants = tokenStorage.getTenants()
      try {
        this.applyIdentity(await authService.whoami())
        await this.loadTenants()
        this.scheduleRefresh()
      } catch {
        tokenStorage.clearTokens()
        this.token = null
      }
    },

    // Fetch the tenants the user can access, and remember them. The server list
    // is authoritative and tenant-agnostic (all the user's tenants, regardless of
    // the active one), so on success we replace + persist. On a transient/failed
    // fetch (e.g. right after navigating into a tenant) we DON'T collapse to the
    // single active tenant — that would wrongly hide the switcher from a
    // multi-tenant user; we keep the last-known persisted set instead.
    async loadTenants() {
      const known = tokenStorage.getTenants()
      let list: string[]
      try {
        const fetched = (await authService.listTenants()).tenants || []
        // /v1/tenants returns the full set at login but can come back scoped to
        // just the active tenant once you've switched into it — which would drop
        // the others and hide the switcher. So trust a multi-entry response as
        // authoritative, but never SHRINK the known set: if it came back as a
        // single tenant, union it with what we already knew.
        list = fetched.length > 1 ? fetched : Array.from(new Set([...known, ...fetched]))
        tokenStorage.setTenants(list)
      } catch {
        // Transient/failed: keep the last-known set rather than collapsing to one.
        list = known
      }
      // When the URL (subdomain / ?tenant) and any prior selection didn't pin down
      // an active tenant, default sensibly: the sole tenant the user belongs to,
      // otherwise 'default'.
      if (!this.tenant) {
        this.tenant = list.length === 1 ? list[0] : 'default'
        tokenStorage.setActiveTenant(this.tenant)
      }
      // Always include the active tenant — e.g. the one selected by the URL
      // subdomain — so the switcher can show it selected even if the list is
      // stale/empty. The switcher itself is only shown when there's more than one.
      this.tenants = Array.from(new Set([...list, this.tenant].filter((t): t is string => !!t)))
    },

    // Switch the active tenant for all subsequent requests. Persists the choice
    // (sent as X-Tenant by the API client) and updates the reactive identity so
    // watchers (e.g. the file browser) can react. Returns false if unchanged.
    switchTenant(tenant: string): boolean {
      if (!tenant || tenant === this.tenant) return false
      tokenStorage.setActiveTenant(tenant)
      this.tenant = tenant
      return true
    },

    // After a full session token has been stored (password-only login, 2FA
    // completion, or OAuth), hydrate the reactive identity and start the refresh
    // timer. Shared by every path that ends in a session.
    async hydrateSession() {
      this.syncToken()
      this.applyIdentity(await authService.whoami())
      await this.loadTenants()
      this.scheduleRefresh()
    },

    // Returns true when a full session is established, false on error. When the
    // bridge demands a second factor, it returns false but sets `mfaChallenge`
    // (and no error) — the LoginView switches to the challenge step in that case.
    async ldapLogin(username: string, password: string, tenant?: string) {
      this.loading = true
      this.error = null
      this.mfaChallenge = null
      try {
        // The subdomain is authoritative for which tenant we're logging into, so
        // carry it explicitly (X-Tenant) — don't rely on the bridge parsing the
        // Host, which isn't the tenant subdomain behind the dev proxy. Priority:
        // explicit arg > current subdomain > persisted/selected tenant.
        const activeTenant = tenant || activeTenantFromHost() || this.tenant || undefined
        if (activeTenant) {
          tokenStorage.setActiveTenant(activeTenant)
          this.tenant = activeTenant
        }
        const result = await authService.ldapLogin(username, password, activeTenant || undefined)
        if (result.kind === 'mfa') {
          this.mfaChallenge = {
            mfaToken: result.mfaToken,
            methods: result.methods,
            mustEnroll: result.mustEnroll,
          }
          return false
        }
        await this.hydrateSession()
        return true
      } catch (e) {
        // A 401 here is a rejected username/password — show a clear, in-app message
        // (the bridge no longer sends WWW-Authenticate: Basic to the browser, so
        // there's no native credentials dialog to fall back on).
        this.error = axios.isAxiosError(e) && e.response?.status === 401
          ? 'Incorrect username or password.'
          : errorMessage(e, 'Login failed')
        return false
      } finally {
        this.loading = false
      }
    },

    // Complete an in-progress 2FA challenge with a code (TOTP / email / recovery).
    // On success a full session is established and the challenge is cleared.
    async verify2fa(method: string, code: string) {
      if (!this.mfaChallenge) return false
      this.loading = true
      this.error = null
      try {
        // Only THIS call decides success/failure of the code. Once it resolves,
        // the bridge has issued a full session (stored by authService) — the login
        // is done and must not be undone by a later hiccup.
        await authService.verify2fa(this.mfaChallenge.mfaToken, method, code)
      } catch (e) {
        // A bad/expired code (or IP-binding failure) — keep the challenge so the
        // user can retry; do NOT clear the session state.
        this.error = errorMessage(e, 'Verification failed')
        this.loading = false
        return false
      }
      // Verified: the session token is stored. Hydrate the identity best-effort — a
      // transient whoami/tenants error here must not throw the user back to the
      // password form with a valid session in hand.
      //
      // NB: do NOT clear mfaChallenge here. Clearing it makes LoginView's
      // `v-if="mfaChallenge"` unmount <TwoFactorChallenge> during the await below,
      // so the component's subsequent emit('done') fires from a destroyed instance
      // and navigation never runs. The successful navigation (goAfterLogin) unmounts
      // LoginView and clears the challenge instead.
      this.syncToken()
      try {
        await this.hydrateSession()
      } catch {
        /* identity will be (re)loaded by initialize()/router guards */
      }
      this.loading = false
      return true
    },

    // Grace enrollment during a mandated login: fetch the TOTP setup blob (QR).
    async begin2faEnrollment() {
      if (!this.mfaChallenge) return null
      this.error = null
      try {
        return await authService.begin2faEnrollment(this.mfaChallenge.mfaToken)
      } catch (e) {
        this.error = errorMessage(e, 'Could not start 2FA setup')
        return null
      }
    },

    // Confirm grace enrollment with a code: enables 2FA and establishes the
    // session. Returns the one-time recovery codes on success, or null.
    async complete2faEnrollment(code: string) {
      if (!this.mfaChallenge) return null
      this.loading = true
      this.error = null
      try {
        const res = await authService.complete2faEnrollment(this.mfaChallenge.mfaToken, code)
        // Keep mfaChallenge set so <TwoFactorChallenge> stays mounted to show the
        // recovery codes; it's cleared by goAfterLogin once the user continues
        // (clearing it here would unmount the component and drop the codes).
        this.syncToken()
        try {
          await this.hydrateSession()
        } catch {
          /* best-effort; identity reloads via guards */
        }
        return res.recovery_codes
      } catch (e) {
        this.error = errorMessage(e, 'That code did not match — try the current one')
        return null
      } finally {
        this.loading = false
      }
    },

    // Trigger delivery of an email one-time code for the current challenge.
    async send2faCode(method: string) {
      if (!this.mfaChallenge) return false
      try {
        return await authService.send2faCode(this.mfaChallenge.mfaToken, method)
      } catch (e) {
        this.error = errorMessage(e, 'Could not send code')
        return false
      }
    },

    // Abandon an in-progress challenge (e.g. "back to login").
    cancelMfa() {
      this.mfaChallenge = null
      this.error = null
    },

    // Finish an OAuth login: read the token from the URL fragment, then whoami.
    async completeOAuth() {
      if (!authService.consumeOAuthFragment()) {
        this.error = 'No authentication token in callback'
        return false
      }
      this.syncToken()
      try {
        this.applyIdentity(await authService.whoami())
        await this.loadTenants()
        this.scheduleRefresh()
        return true
      } catch (e) {
        this.error = errorMessage(e, 'Login failed')
        tokenStorage.clearTokens()
        this.token = null
        return false
      }
    },

    // Deep-link SSO (§5.5): redeem a one-time hand-off code from another system for a
    // session, then hydrate identity. Returns true on success.
    async redeemSso(code: string) {
      this.error = null
      try {
        await authService.ssoRedeem(code)
        await this.hydrateSession()
        return true
      } catch (e) {
        this.error = errorMessage(e, 'This sign-in link is invalid or has expired.')
        tokenStorage.clearTokens()
        this.token = null
        return false
      }
    },

    async logout() {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = undefined
      await authService.logout()
      // Forget the remembered workspace on an EXPLICIT sign-out: on a shared
      // machine the next person should meet a clean login, not be told which
      // workspace the last one used.
      clearLastTenant()
      this.token = null
      this.user = null
      this.tenant = null
      this.tenants = []
      this.roles = []
      this.accessLevel = 'user'
      this.mfaChallenge = null
    },
  },
})
