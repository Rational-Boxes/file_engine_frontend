import { defineStore } from 'pinia'
import { authService } from '@/services/authService'
import { tokenStorage } from '@/utils/tokenStorage'
import { decodeToken, isTokenExpired, shouldRefreshToken, getTimeUntilExpiration } from '@/utils/jwt'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    accessLevel: 'user', // user, admin, editor
    loading: false,
    error: null,
    // Token refresh timer
    refreshTimer: null
  }),
  
  getters: {
    hasAccessLevel: (state) => (level: string) => {
      const accessLevels = {
        'user': 1,
        'editor': 2,
        'admin': 3
      }
      
      const userLevel = accessLevels[state.accessLevel] || 1
      const requiredLevel = accessLevels[level] || 1
      
      return userLevel >= requiredLevel
    },
    
    userRoles: (state) => {
      return state.user?.roles || []
    }
  },
  
  actions: {
    // Initialize auth state from stored tokens
    async initializeAuth() {
      const accessToken = tokenStorage.getAccessToken()
      if (accessToken && !isTokenExpired(accessToken)) {
        this.user = decodeToken(accessToken)
        this.isAuthenticated = true
        this.accessLevel = this.determineAccessLevel(this.user)
        
        // Set up automatic token refresh
        this.setupTokenRefresh(accessToken)
      }
    },
    
    // Login with credentials or OAuth
    async login(credentials: { username: string, password: string } | { code: string, state: string }, isOAuth = false) {
      this.loading = true
      this.error = null
      
      try {
        let result
        if (isOAuth) {
          result = await authService.handleOAuthCallback(credentials as { code: string, state: string })
        } else {
          result = await authService.login(credentials as { username: string, password: string })
        }
        
        if (result.success) {
          this.user = result.user
          this.isAuthenticated = true
          this.accessLevel = this.determineAccessLevel(this.user)
          
          // Set up automatic token refresh
          const accessToken = tokenStorage.getAccessToken()
          if (accessToken) {
            this.setupTokenRefresh(accessToken)
          }
          
          return { success: true }
        } else {
          throw new Error('Authentication failed')
        }
      } catch (error: any) {
        this.error = error.message || 'Login failed'
        return { success: false, error: this.error }
      } finally {
        this.loading = false
      }
    },
    
    // Logout
    async logout() {
      tokenStorage.clearTokens()
      
      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer)
        this.refreshTimer = null
      }
      
      this.user = null
      this.isAuthenticated = false
      this.accessLevel = 'user'
    },
    
    // Handle OAuth callback
    async handleOAuthCallback(code: string, state: string) {
      return await this.login({ code, state }, true)
    },
    
    // Determine access level from user data
    determineAccessLevel(user: any) {
      if (!user) return 'user'
      
      // Check user roles to determine access level
      if (user.roles?.includes('admin')) return 'admin'
      if (user.roles?.includes('editor')) return 'editor'
      return 'user'
    },
    
    // Set access level (for users with multiple roles)
    setAccessLevel(level: string) {
      if (this.user && this.user.roles?.includes(level)) {
        this.accessLevel = level
      }
    },
    
    // Setup automatic token refresh
    setupTokenRefresh(accessToken: string) {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer)
      }
      
      // Check token expiration 5 minutes before it actually expires
      const timeUntilRefresh = shouldRefreshToken(accessToken, 300) 
        ? 60000 // Refresh in 1 minute if already close to expiration
        : getTimeUntilExpiration(accessToken) - 300000 // 5 minutes before expiration
      
      if (timeUntilRefresh > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshToken()
        }, timeUntilRefresh)
      } else {
        // Token already expired or will expire soon, refresh immediately
        this.refreshToken()
      }
    },
    
    // Refresh token
    async refreshToken() {
      const refreshToken = tokenStorage.getRefreshToken()
      if (!refreshToken) {
        // No refresh token available, user needs to re-authenticate
        await this.logout()
        return
      }
      
      try {
        const response = await authService.refreshToken(refreshToken)
        
        const { access_token, refresh_token: newRefreshToken, expires_in } = response
        
        tokenStorage.storeTokens({
          accessToken: access_token,
          refreshToken: newRefreshToken,
          expiresAt: Date.now() + (expires_in * 1000)
        })
        
        this.user = decodeToken(access_token)
        this.accessLevel = this.determineAccessLevel(this.user)
        
        // Set up new refresh timer
        this.setupTokenRefresh(access_token)
      } catch (error) {
        console.error('Token refresh failed:', error)
        await this.logout()
      }
    }
  }
})