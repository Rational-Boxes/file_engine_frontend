import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import * as authServiceModule from '@/services/authService'
import { tokenStorage } from '@/utils/tokenStorage'

// Mock the auth service
vi.mock('@/services/authService', () => ({
  authService: {
    login: vi.fn(),
    handleOAuthCallback: vi.fn(),
    refreshToken: vi.fn(),
    getAvailableProviders: vi.fn(),
    initiateOAuth: vi.fn(),
  }
}))

// Mock token storage
vi.mock('@/utils/tokenStorage', () => ({
  tokenStorage: {
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    storeTokens: vi.fn(),
    clearTokens: vi.fn(),
    isAuthenticated: vi.fn(),
  }
}))

// Mock jwt utilities
vi.mock('@/utils/jwt', () => ({
  decodeToken: vi.fn(),
  isTokenExpired: vi.fn(),
  shouldRefreshToken: vi.fn(),
  getTimeUntilExpiration: vi.fn(),
}))

describe('Auth Store', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    const pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    // Clear all mocks after each test
    vi.clearAllMocks()
  })

  describe('initializeAuth', () => {
    it('should set user and auth state when token exists and is not expired', async () => {
      // Arrange
      const mockToken = 'mock.jwt.token'
      const mockUser = { sub: 'user123', roles: ['user'] }
      
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue(mockToken)
      vi.mocked(authServiceModule.decodeToken).mockReturnValue(mockUser)
      vi.mocked(authServiceModule.isTokenExpired).mockReturnValue(false)
      
      const authStore = useAuthStore()
      
      // Act
      await authStore.initializeAuth()
      
      // Assert
      expect(authStore.isAuthenticated).toBe(true)
      expect(authStore.user).toEqual(mockUser)
      expect(authStore.accessLevel).toBe('user')
    })

    it('should not set auth state when token is expired', async () => {
      // Arrange
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('expired.token')
      vi.mocked(authServiceModule.isTokenExpired).mockReturnValue(true)
      
      const authStore = useAuthStore()
      
      // Act
      await authStore.initializeAuth()
      
      // Assert
      expect(authStore.isAuthenticated).toBe(false)
      expect(authStore.user).toBeNull()
    })

    it('should not set auth state when no token exists', async () => {
      // Arrange
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue(null)
      
      const authStore = useAuthStore()
      
      // Act
      await authStore.initializeAuth()
      
      // Assert
      expect(authStore.isAuthenticated).toBe(false)
      expect(authStore.user).toBeNull()
    })
  })

  describe('login', () => {
    it('should successfully login with credentials and update store state', async () => {
      // Arrange
      const mockCredentials = { username: 'testuser', password: 'password123' }
      const mockUser = { sub: 'user123', roles: ['admin'] }
      const mockTokens = { access_token: 'access.token', refresh_token: 'refresh.token', expires_in: 3600 }
      
      vi.mocked(authServiceModule.authService.login).mockResolvedValue(mockTokens)
      vi.mocked(authServiceModule.decodeToken).mockReturnValue(mockUser)
      
      const authStore = useAuthStore()
      
      // Act
      const result = await authStore.login(mockCredentials)
      
      // Assert
      expect(result.success).toBe(true)
      expect(authStore.user).toEqual(mockUser)
      expect(authStore.isAuthenticated).toBe(true)
      expect(authStore.accessLevel).toBe('admin')
      expect(authStore.loading).toBe(false)
    })

    it('should handle login failure gracefully', async () => {
      // Arrange
      const mockCredentials = { username: 'testuser', password: 'wrongpassword' }
      
      vi.mocked(authServiceModule.authService.login).mockRejectedValue(new Error('Invalid credentials'))
      
      const authStore = useAuthStore()
      
      // Act
      const result = await authStore.login(mockCredentials)
      
      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid credentials')
      expect(authStore.loading).toBe(false)
    })

    it('should handle OAuth login', async () => {
      // Arrange
      const mockOAuthData = { code: 'auth_code', state: 'state123' }
      const mockUser = { sub: 'user123', roles: ['user'] }
      const mockTokens = { access_token: 'access.token', refresh_token: 'refresh.token', expires_in: 3600 }
      
      vi.mocked(authServiceModule.authService.handleOAuthCallback).mockResolvedValue(mockTokens)
      vi.mocked(authServiceModule.decodeToken).mockReturnValue(mockUser)
      
      const authStore = useAuthStore()
      
      // Act
      const result = await authStore.login(mockOAuthData, true)
      
      // Assert
      expect(result.success).toBe(true)
      expect(authStore.user).toEqual(mockUser)
      expect(authStore.isAuthenticated).toBe(true)
    })
  })

  describe('logout', () => {
    it('should clear tokens and reset auth state', async () => {
      // Arrange
      const authStore = useAuthStore()
      authStore.user = { sub: 'user123', roles: ['user'] }
      authStore.isAuthenticated = true
      authStore.accessLevel = 'user'
      
      // Act
      await authStore.logout()
      
      // Assert
      expect(tokenStorage.clearTokens).toHaveBeenCalled()
      expect(authStore.user).toBeNull()
      expect(authStore.isAuthenticated).toBe(false)
      expect(authStore.accessLevel).toBe('user')
    })
  })

  describe('access level checks', () => {
    it('should correctly determine access level from user roles', () => {
      // Arrange
      const authStore = useAuthStore()
      
      // Act & Assert for admin
      authStore.user = { roles: ['admin'] }
      expect(authStore.determineAccessLevel(authStore.user)).toBe('admin')
      
      // Act & Assert for editor
      authStore.user = { roles: ['editor'] }
      expect(authStore.determineAccessLevel(authStore.user)).toBe('editor')
      
      // Act & Assert for user
      authStore.user = { roles: ['user'] }
      expect(authStore.determineAccessLevel(authStore.user)).toBe('user')
      
      // Act & Assert for no user
      expect(authStore.determineAccessLevel(null)).toBe('user')
    })

    it('should check access level correctly', () => {
      // Arrange
      const authStore = useAuthStore()
      authStore.accessLevel = 'admin'
      
      // Act & Assert
      expect(authStore.hasAccessLevel('user')).toBe(true)
      expect(authStore.hasAccessLevel('editor')).toBe(true)
      expect(authStore.hasAccessLevel('admin')).toBe(true)
      
      // Change access level
      authStore.accessLevel = 'user'
      expect(authStore.hasAccessLevel('admin')).toBe(false)
      expect(authStore.hasAccessLevel('editor')).toBe(false)
      expect(authStore.hasAccessLevel('user')).toBe(true)
    })
  })
})