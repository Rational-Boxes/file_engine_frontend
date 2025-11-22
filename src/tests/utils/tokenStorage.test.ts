import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tokenStorage } from '@/utils/tokenStorage'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

// Mock the storage APIs
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
})

describe('Token Storage Utility', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks()
    
    // Reset token storage internal state
    tokenStorage['currentTokens'] = null
  })

  afterEach(() => {
    // Clean up any stored tokens after each test
    localStorageMock.clear()
    sessionStorageMock.clear()
  })

  describe('storeTokens', () => {
    it('should store tokens in both localStorage and internal cache', () => {
      // Arrange
      const tokens = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        expiresAt: Date.now() + 3600000, // 1 hour from now
      }

      // Act
      tokenStorage.storeTokens(tokens)

      // Assert
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'fileengine_auth',
        JSON.stringify(tokens)
      )
      expect(tokenStorage['currentTokens']).toEqual(tokens)
    })
  })

  describe('getTokens', () => {
    it('should return tokens from internal cache if available', () => {
      // Arrange
      const tokens = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        expiresAt: Date.now() + 3600000,
      }
      tokenStorage['currentTokens'] = tokens

      // Act
      const result = tokenStorage.getTokens()

      // Assert
      expect(result).toEqual(tokens)
      expect(localStorageMock.getItem).not.toHaveBeenCalled()
    })

    it('should retrieve tokens from localStorage if not in cache', () => {
      // Arrange
      const tokens = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        expiresAt: Date.now() + 3600000,
      }
      localStorageMock.getItem.mockReturnValue(JSON.stringify(tokens))

      // Act
      const result = tokenStorage.getTokens()

      // Assert
      expect(localStorageMock.getItem).toHaveBeenCalledWith('fileengine_auth')
      expect(result).toEqual(tokens)
      expect(tokenStorage['currentTokens']).toEqual(tokens)
    })

    it('should return null if no tokens stored', () => {
      // Arrange
      localStorageMock.getItem.mockReturnValue(null)

      // Act
      const result = tokenStorage.getTokens()

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('getAccessToken', () => {
    it('should return access token if not expired', () => {
      // Arrange
      const tokens = {
        accessToken: 'valid_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() + 3600000, // 1 hour in the future
      }
      tokenStorage['currentTokens'] = tokens

      // Act
      const result = tokenStorage.getAccessToken()

      // Assert
      expect(result).toBe('valid_token')
    })

    it('should return null if token is expired', () => {
      // Arrange
      const tokens = {
        accessToken: 'expired_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() - 3600000, // 1 hour in the past
      }
      tokenStorage['currentTokens'] = tokens

      // Act
      const result = tokenStorage.getAccessToken()

      // Assert
      expect(result).toBeNull()
    })

    it('should return null if no tokens available', () => {
      // Arrange
      tokenStorage['currentTokens'] = null

      // Act
      const result = tokenStorage.getAccessToken()

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('getRefreshToken', () => {
    it('should return refresh token if tokens exist', () => {
      // Arrange
      const tokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() + 3600000,
      }
      tokenStorage['currentTokens'] = tokens

      // Act
      const result = tokenStorage.getRefreshToken()

      // Assert
      expect(result).toBe('refresh_token')
    })

    it('should return null if no tokens available', () => {
      // Arrange
      tokenStorage['currentTokens'] = null

      // Act
      const result = tokenStorage.getRefreshToken()

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('clearTokens', () => {
    it('should clear all stored tokens and session data', () => {
      // Act
      tokenStorage.clearTokens()

      // Assert
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('fileengine_auth')
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('oauth_code_verifier')
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('oauth_state')
      expect(tokenStorage['currentTokens']).toBeNull()
    })
  })

  describe('isAuthenticated', () => {
    it('should return true if access token is valid', () => {
      // Arrange
      const tokens = {
        accessToken: 'valid_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() + 3600000,
      }
      tokenStorage['currentTokens'] = tokens

      // Act
      const result = tokenStorage.isAuthenticated()

      // Assert
      expect(result).toBe(true)
    })

    it('should return false if access token is expired', () => {
      // Arrange
      const tokens = {
        accessToken: 'expired_token',
        refreshToken: 'refresh_token',
        expiresAt: Date.now() - 3600000,
      }
      tokenStorage['currentTokens'] = tokens

      // Act
      const result = tokenStorage.isAuthenticated()

      // Assert
      expect(result).toBe(false)
    })

    it('should return false if no tokens available', () => {
      // Arrange
      tokenStorage['currentTokens'] = null

      // Act
      const result = tokenStorage.isAuthenticated()

      // Assert
      expect(result).toBe(false)
    })
  })
})