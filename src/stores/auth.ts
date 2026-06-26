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
      try {
        this.applyIdentity(await authService.whoami())
        await this.loadTenants()
      } catch {
        tokenStorage.clearTokens()
        this.token = null
      }
    },

    // Fetch the tenants the user can access. Best-effort: on failure we keep at
    // least the active tenant so the selector still renders.
    async loadTenants() {
      try {
        const { tenants } = await authService.listTenants()
        this.tenants = tenants
      } catch {
        this.tenants = this.tenant ? [this.tenant] : []
      }
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
        await authService.ldapLogin(username, password, tenant)
        this.syncToken()
        this.applyIdentity(await authService.whoami())
        await this.loadTenants()
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
        return true
      } catch (e) {
        this.error = errorMessage(e, 'Login failed')
        tokenStorage.clearTokens()
        this.token = null
        return false
      }
    },

    async logout() {
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
