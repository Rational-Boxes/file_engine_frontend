import axios from 'axios'
import apiClient, { API_BASE } from '@/services/apiClient'
import { tokenStorage } from '@/utils/tokenStorage'

export interface Identity {
  user: string
  tenant: string
  roles: string[]
}

export interface TenantList {
  tenants: string[]
  current: string
}

function storeToken(token: string, expiresInSeconds: number) {
  tokenStorage.storeTokens({
    accessToken: token,
    refreshToken: '', // bridge tokens are opaque and not refreshable
    expiresAt: Date.now() + expiresInSeconds * 1000,
  })
}

export const authService = {
  // LDAP username/password -> opaque bridge bearer token (POST /v1/auth/token,
  // HTTP Basic). Uses a bare axios call so the apiClient's Bearer interceptor
  // does not clobber the Basic header.
  async ldapLogin(username: string, password: string, tenant?: string): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
    }
    if (tenant) headers['X-Tenant'] = tenant
    const { data } = await axios.post(`${API_BASE}/v1/auth/token`, null, { headers })
    storeToken(data.token, data.expires_in)
  },

  // Begin the bridge's server-side OAuth2 flow; the bridge redirects to the IdP
  // and ultimately back to /oauth/callback with the token in the URL fragment.
  oauthRedirect(provider: string): void {
    const returnTo = `${window.location.origin}/oauth/callback`
    window.location.href =
      `${API_BASE}/v1/auth/oauth/${encodeURIComponent(provider)}` +
      `?return_to=${encodeURIComponent(returnTo)}`
  },

  // Read #token=...&expires_in=... left by the OAuth redirect, persist it, and
  // scrub it from the URL/history. Returns true if a token was found.
  consumeOAuthFragment(): boolean {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    if (!hash) return false
    const params = new URLSearchParams(hash)
    const token = params.get('token')
    if (!token) return false
    storeToken(token, Number(params.get('expires_in')) || 3600)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return true
  },

  // Resolved identity for the current token.
  async whoami(): Promise<Identity> {
    const { data } = await apiClient.get<Identity>('/v1/whoami')
    return data
  },

  // Tenants the current user can access, plus the tenant active on the request.
  async listTenants(): Promise<TenantList> {
    const { data } = await apiClient.get<TenantList>('/v1/tenants')
    return data
  },

  // Revoke the token server-side (best effort) and clear it locally.
  async logout(): Promise<void> {
    try {
      await apiClient.delete('/v1/auth/token')
    } catch {
      // ignore — clearing the local token is what matters
    }
    tokenStorage.clearTokens()
  },
}
