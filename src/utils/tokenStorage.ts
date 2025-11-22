// utils/tokenStorage.ts
interface TokenData {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

class SecureTokenStorage {
  private storageKey = 'fileengine_auth'
  private currentTokens: TokenData | null = null

  // Store tokens securely
  storeTokens(tokens: TokenData) {
    const tokenData: TokenData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt
    }
    
    // Store in both localStorage and memory for redundancy
    localStorage.setItem(this.storageKey, JSON.stringify(tokenData))
    
    // Also store in memory for faster access
    this.currentTokens = tokenData
  }

  // Get stored tokens
  getTokens(): TokenData | null {
    if (this.currentTokens) {
      return this.currentTokens
    }
    
    const stored = localStorage.getItem(this.storageKey)
    if (stored) {
      this.currentTokens = JSON.parse(stored)
      return this.currentTokens
    }
    
    return null
  }

  // Clear stored tokens
  clearTokens() {
    localStorage.removeItem(this.storageKey)
    sessionStorage.removeItem('oauth_code_verifier')
    sessionStorage.removeItem('oauth_state')
    this.currentTokens = null
  }

  // Get access token
  getAccessToken(): string | null {
    const tokens = this.getTokens()
    if (!tokens) return null
    
    // Check if token is expired
    if (Date.now() >= tokens.expiresAt) {
      return null
    }
    
    return tokens.accessToken
  }

  // Get refresh token
  getRefreshToken(): string | null {
    const tokens = this.getTokens()
    return tokens ? tokens.refreshToken : null
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getAccessToken()
  }
}

export const tokenStorage = new SecureTokenStorage()