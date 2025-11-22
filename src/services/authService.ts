import apiService from './apiService'
import { tokenStorage } from '@/utils/tokenStorage'

export const authService = {
  // OAuth2 provider configuration
  async getAvailableProviders() {
    try {
      const response = await apiService.client.get('/auth/providers')
      return response.data.providers || ['google', 'github', 'ldap']
    } catch (error) {
      // Default providers if API call fails
      return ['google', 'github', 'ldap']
    }
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
    
    const authUrl = `${apiService.client.defaults.baseURL}/auth/oauth/${provider}?` +
      `client_id=${import.meta.env.VUE_APP_OAUTH_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${import.meta.env.VUE_APP_OAUTH_SCOPE}&` +
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
      // Exchange authorization code for JWT token
      const response = await apiService.client.post('/auth/oauth/token', {
        code,
        code_verifier: codeVerifier,
        redirect_uri: `${window.location.origin}/oauth/callback`
      })
      
      // Store tokens
      const { access_token, refresh_token, expires_in } = response.data
      
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
  
  // Local authentication (if needed)
  async login(credentials: { username: string, password: string }) {
    try {
      const response = await apiService.client.post('/auth/login', credentials)
      const { access_token, refresh_token, expires_in } = response.data
      
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
      const response = await apiService.client.post('/auth/refresh', {
        refresh_token: refreshToken
      })
      
      return response.data
    } catch (error) {
      throw error
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