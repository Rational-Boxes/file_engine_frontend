import { defineStore } from 'pinia'
import { authService, type Identity } from '@/services/authService'
import { tokenStorage } from '@/utils/tokenStorage'
import { errorMessage } from '@/services/apiClient'
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
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    hasAccessLevel: (state) => (level: AccessLevel) =>
      LEVELS[state.accessLevel] >= (LEVELS[level] ?? 1),
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
      let list: string[]
      try {
        // Server list is authoritative + tenant-agnostic (all the user's tenants).
        list = (await authService.listTenants()).tenants || []
        tokenStorage.setTenants(list)
      } catch {
        // Transient/failed (e.g. just after navigating into a tenant): keep the
        // last-known set rather than collapsing to one and hiding the switcher.
        list = tokenStorage.getTenants()
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

    async ldapLogin(username: string, password: string, tenant?: string) {
      this.loading = true
      this.error = null
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
        await authService.ldapLogin(username, password, activeTenant || undefined)
        this.syncToken()
        this.applyIdentity(await authService.whoami())
        await this.loadTenants()
        this.scheduleRefresh()
        return true
      } catch (e) {
        this.error = errorMessage(e, 'Login failed')
        return false
      } finally {
        this.loading = false
      }
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

    async logout() {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = undefined
      await authService.logout()
      this.token = null
      this.user = null
      this.tenant = null
      this.tenants = []
      this.roles = []
      this.accessLevel = 'user'
    },
  },
})
