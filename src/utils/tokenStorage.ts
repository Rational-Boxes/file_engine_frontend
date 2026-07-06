// utils/tokenStorage.ts
interface TokenData {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

class SecureTokenStorage {
  private storageKey = 'fileengine_auth'
  private tenantKey = 'fileengine_tenant'
  private tenantsKey = 'fileengine_tenants'
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
    localStorage.removeItem(this.tenantKey)
    localStorage.removeItem(this.tenantsKey)
    sessionStorage.removeItem('oauth_code_verifier')
    sessionStorage.removeItem('oauth_state')
    this.currentTokens = null
  }

  // The set of tenants the user can operate in, remembered across reloads so the
  // tenant switcher's visibility (shown only for multi-tenant users) survives a
  // transient/failed GET /v1/tenants after navigating into a tenant. Refreshed
  // from the server on each successful load; cleared on logout.
  getTenants(): string[] {
    try {
      const raw = localStorage.getItem(this.tenantsKey)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
    } catch {
      return []
    }
  }

  setTenants(tenants: string[]) {
    if (tenants.length) localStorage.setItem(this.tenantsKey, JSON.stringify(tenants))
    else localStorage.removeItem(this.tenantsKey)
  }

  // Active tenant: the tenant the user has selected for subsequent requests.
  // Sent as the X-Tenant header by the API client; persisted so a reload keeps
  // the chosen tenant. Cleared together with the token on logout.
  getActiveTenant(): string | null {
    return localStorage.getItem(this.tenantKey)
  }

  setActiveTenant(tenant: string | null) {
    if (tenant) localStorage.setItem(this.tenantKey, tenant)
    else localStorage.removeItem(this.tenantKey)
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