import { tokenStorage } from '@/utils/tokenStorage'

export const authService = {
  // OAuth2 provider configuration
  async getAvailableProviders() {
    // For now, return default providers
    // In a real implementation, this might come from a gRPC call
    return ['google', 'github', 'ldap']
  },

  // Initiate OAuth2 flow
  async initiateOAuth(provider: string) {
    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier()
    const codeChallenge = await this.generateCodeChallenge(codeVerifier)

    // Store verifier in sessionStorage for use after redirect
    sessionStorage.setItem('oauth_code_verifier', codeVerifier)

    // Build OAuth2 authorization URL
    const redirectUri = `${window.location.origin}/oauth/callback`
    const state = this.generateState()

    // Store state in session for validation
    sessionStorage.setItem('oauth_state', state)

    // For gRPC implementation, we might need to redirect to an external auth service
    // This is a simplified approach - in a real implementation, you'd have an auth service
    const authUrl = `${import.meta.env.VITE_FILEENGINE_GRPC_URL || 'http://localhost:8080'}/auth/oauth/${provider}?` +
      `client_id=${import.meta.env.VITE_OAUTH_CLIENT_ID || 'default-client-id'}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${import.meta.env.VITE_OAUTH_SCOPE || 'openid profile email'}&` +
      `state=${state}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256`

    // Redirect to OAuth provider
    window.location.href = authUrl
  },

  // Handle OAuth callback
  async handleOAuthCallback(code: string, state: string) {
    // Validate state parameter
    const storedState = sessionStorage.getItem('oauth_state')
    if (!storedState || storedState !== state) {
      throw new Error('Invalid state parameter')
    }

    // Retrieve code verifier
    const codeVerifier = sessionStorage.getItem('oauth_code_verifier')
    if (!codeVerifier) {
      throw new Error('Code verifier not found')
    }

    try {
      // In a gRPC implementation, you might have a separate auth service
      // For now, we'll simulate the token exchange
      // This would typically be handled by a separate authentication service
      const response = await fetch(`${import.meta.env.VITE_FILEENGINE_GRPC_URL || 'http://localhost:8080'}/auth/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: `${window.location.origin}/oauth/callback`
        })
      })

      if (!response.ok) {
        throw new Error('Failed to exchange code for token')
      }

      const data = await response.json()
      const { access_token, refresh_token, expires_in } = data

      tokenStorage.storeTokens({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + (expires_in * 1000)
      })

      // Clear OAuth session data
      sessionStorage.removeItem('oauth_code_verifier')
      sessionStorage.removeItem('oauth_state')

      return { success: true, user: this.decodeToken(access_token) }
    } catch (error) {
      // Clear OAuth session data on error
      sessionStorage.removeItem('oauth_code_verifier')
      sessionStorage.removeItem('oauth_state')
      throw error
    }
  },

  // LDAP authentication
  async ldapLogin(credentials: { username: string, password: string, tenant?: string }) {
    try {
      // In a real implementation, this would call a gRPC authentication method
      // For now, we'll simulate the authentication process
      const response = await fetch(`${import.meta.env.VITE_FILEENGINE_GRPC_URL || 'http://localhost:8080'}/auth/ldap/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          tenant: credentials.tenant || 'default'
        })
      })

      if (!response.ok) {
        throw new Error('LDAP authentication failed')
      }

      const data = await response.json()
      const { token, user, roles } = data

      // Store the JWT token
      tokenStorage.storeTokens({
        accessToken: token,
        refreshToken: null, // LDAP may not use refresh tokens
        expiresAt: this.getTokenExpiration(token)
      })

      return {
        success: true,
        user: {
          ...user,
          roles: roles // Include roles from LDAP
        }
      }
    } catch (error) {
      throw error
    }
  },

  // Local authentication (if needed)
  async login(credentials: { username: string, password: string }) {
    try {
      // In a gRPC implementation, authentication might be handled differently
      // For now, we'll simulate the authentication process
      const response = await fetch(`${import.meta.env.VITE_FILEENGINE_GRPC_URL || 'http://localhost:8080'}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      })

      if (!response.ok) {
        throw new Error('Authentication failed')
      }

      const data = await response.json()
      const { access_token, refresh_token, expires_in } = data

      tokenStorage.storeTokens({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + (expires_in * 1000)
      })

      return { success: true, user: this.decodeToken(access_token) }
    } catch (error) {
      throw error
    }
  },

  // Refresh token
  async refreshToken(refreshToken: string) {
    try {
      // In a gRPC implementation, token refresh might be handled differently
      const response = await fetch(`${import.meta.env.VITE_FILEENGINE_GRPC_URL || 'http://localhost:8080'}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      })

      if (!response.ok) {
        throw new Error('Token refresh failed')
      }

      return await response.json()
    } catch (error) {
      throw error
    }
  },

  // Get token expiration from JWT
  getTokenExpiration(token: string) {
    try {
      const payload = this.decodeToken(token)
      if (payload && payload.exp) {
        return payload.exp * 1000 // Convert to milliseconds
      }
      return Date.now() + 3600000 // Default to 1 hour if no exp found
    } catch (error) {
      console.error('Error getting token expiration:', error)
      return Date.now() + 3600000 // Default to 1 hour
    }
  },

  // Generate PKCE code verifier (128 characters)
  generateCodeVerifier() {
    const array = new Uint8Array(64)
    crypto.getRandomValues(array)
    return this.base64URLEncode(array)
  },

  // Generate PKCE code challenge
  async generateCodeChallenge(codeVerifier: string) {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return this.base64URLEncode(new Uint8Array(digest))
  },

  // Base64 URL encoding
  base64URLEncode(buffer: Uint8Array) {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  },

  // Generate state parameter for CSRF protection
  generateState() {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return this.base64URLEncode(array)
  },

  // Decode JWT token
  decodeToken(token: string) {
    try {
      const [header, payload, signature] = token.split('.')
      const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      return JSON.parse(decodedPayload)
    } catch (error) {
      console.error('Error decoding token:', error)
      return null
    }
  }
}