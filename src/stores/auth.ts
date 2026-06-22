import { defineStore } from 'pinia'
import { authService, type Identity } from '@/services/authService'
import { tokenStorage } from '@/utils/tokenStorage'
import { errorMessage } from '@/services/apiClient'

type AccessLevel = 'user' | 'editor' | 'admin'

const LEVELS: Record<AccessLevel, number> = { user: 1, editor: 2, admin: 3 }

function levelFromRoles(roles: string[]): AccessLevel {
  if (roles.includes('administrators') || roles.includes('system_admin')) return 'admin'
  if (roles.includes('editor')) return 'editor'
  return 'user'
}

interface AuthState {
  user: string | null
  tenant: string | null
  roles: string[]
  accessLevel: AccessLevel
  loading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    tenant: null,
    roles: [],
    accessLevel: 'user',
    loading: false,
    error: null,
  }),

  getters: {
    isAuthenticated: () => tokenStorage.isAuthenticated(),
    hasAccessLevel: (state) => (level: AccessLevel) =>
      LEVELS[state.accessLevel] >= (LEVELS[level] ?? 1),
  },

  actions: {
    applyIdentity(id: Identity) {
      this.user = id.user
      this.tenant = id.tenant
      this.roles = id.roles || []
      this.accessLevel = levelFromRoles(this.roles)
    },

    // On app start: if a valid token is present, hydrate the identity.
    async initialize() {
      if (!tokenStorage.isAuthenticated()) return
      try {
        this.applyIdentity(await authService.whoami())
      } catch {
        tokenStorage.clearTokens()
      }
    },

    async ldapLogin(username: string, password: string, tenant?: string) {
      this.loading = true
      this.error = null
      try {
        await authService.ldapLogin(username, password, tenant)
        this.applyIdentity(await authService.whoami())
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
      try {
        this.applyIdentity(await authService.whoami())
        return true
      } catch (e) {
        this.error = errorMessage(e, 'Login failed')
        tokenStorage.clearTokens()
        return false
      }
    },

    async logout() {
      await authService.logout()
      this.user = null
      this.tenant = null
      this.roles = []
      this.accessLevel = 'user'
    },
  },
})
