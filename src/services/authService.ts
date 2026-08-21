// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import axios from 'axios'
import apiClient, { API_BASE } from '@/services/apiClient'
import { tokenStorage } from '@/utils/tokenStorage'

export interface Identity {
  user: string
  tenant: string
  roles: string[]
}

// Result of a password login: either a full session was issued, or the bridge
// demands a second factor (PROPOSAL §4.6) and returned a short-lived, IP-bound
// challenge token the caller completes via verify2fa().
export type LoginResult =
  | { kind: 'session' }
  | { kind: 'mfa'; mfaToken: string; methods: string[]; mustEnroll: boolean }

export interface TenantList {
  tenants: string[]
  current: string
}

function storeToken(token: string, expiresInSeconds: number) {
  tokenStorage.storeTokens({
    accessToken: token,
    refreshToken: '', // bridge JWTs are re-minted via /v1/auth/refresh, not an OAuth refresh token
    expiresAt: Date.now() + expiresInSeconds * 1000,
  })
}

export const authService = {
  // LDAP username/password -> opaque bridge bearer token (POST /v1/auth/token,
  // HTTP Basic). Uses a bare axios call so the apiClient's Bearer interceptor
  // does not clobber the Basic header.
  async ldapLogin(username: string, password: string, tenant?: string): Promise<LoginResult> {
    const headers: Record<string, string> = {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
    }
    if (tenant) headers['X-Tenant'] = tenant
    const { data } = await axios.post(`${API_BASE}/v1/auth/token`, null, { headers })
    if (data.mfa_required) {
      return {
        kind: 'mfa',
        mfaToken: data.mfa_token,
        methods: data.methods || [],
        mustEnroll: !!data.must_enroll,
      }
    }
    storeToken(data.token, data.expires_in)
    return { kind: 'session' }
  },

  // Deep-link SSO (§5.5): redeem a one-time hand-off code minted by another system
  // for a fresh session (POST /v1/auth/sso/redeem). A bare axios call — no bearer yet.
  async ssoRedeem(code: string): Promise<void> {
    const { data } = await axios.post(`${API_BASE}/v1/auth/sso/redeem`, { code })
    storeToken(data.access_token, data.expires_in)
  },

  // Complete a second-factor challenge (POST /v1/auth/2fa). On success the bridge
  // returns a full session, which we persist. Uses a bare axios call: the caller
  // holds only the challenge token, not yet a session bearer token.
  async verify2fa(mfaToken: string, method: string, code: string): Promise<void> {
    const { data } = await axios.post(`${API_BASE}/v1/auth/2fa`, {
      mfa_token: mfaToken,
      action: 'verify',
      method,
      code,
    })
    storeToken(data.token, data.expires_in)
  },

  // Ask the bridge to email a one-time code for the "email" method (action=send).
  async send2faCode(mfaToken: string, method: string): Promise<boolean> {
    const { data } = await axios.post(`${API_BASE}/v1/auth/2fa`, {
      mfa_token: mfaToken,
      action: 'send',
      method,
    })
    return !!data.sent
  },

  // Grace enrollment during login (a mandated tenant requires 2FA but the user
  // isn't enrolled). begin returns the TOTP setup blob to render as a QR.
  async begin2faEnrollment(
    mfaToken: string,
  ): Promise<{ secret: string; otpauth_uri: string; issuer: string; account: string }> {
    const { data } = await axios.post(`${API_BASE}/v1/auth/2fa`, {
      mfa_token: mfaToken,
      action: 'enroll_begin',
    })
    return data
  },

  // complete verifies the code, enables 2FA, and returns a full session + the
  // one-time recovery codes.
  async complete2faEnrollment(mfaToken: string, code: string): Promise<{ recovery_codes: string[] }> {
    const { data } = await axios.post(`${API_BASE}/v1/auth/2fa`, {
      mfa_token: mfaToken,
      action: 'enroll_complete',
      code,
    })
    storeToken(data.token, data.expires_in)
    return { recovery_codes: data.recovery_codes || [] }
  },

  /**
   * Which identity providers this DEPLOYMENT has configured.
   *
   * Asked of the bridge at load time rather than read from a build-time
   * variable. The packaged SPA is built once and run by many deployments, so a
   * baked-in list offered every one of them the same buttons — and a button for
   * an IdP that was never configured leads only to an error.
   *
   * An unreachable or old bridge yields an empty list, which hides the buttons
   * entirely. Showing nothing is the safe failure: the username/password form
   * is always there underneath.
   */
  async oauthProviders(): Promise<string[]> {
    try {
      const { data } = await apiClient.get<{ providers?: string[] }>('/v1/auth/providers')
      return data.providers ?? []
    } catch {
      return []
    }
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

  // Re-mint the bearer JWT from live LDAP (POST /v1/auth/refresh, authenticated
  // by the current token). Keeps the short-TTL token alive and picks up LDAP role
  // changes within the refresh interval.
  async refresh(): Promise<void> {
    const { data } = await apiClient.post<{ token: string; expires_in: number }>(
      '/v1/auth/refresh',
    )
    storeToken(data.token, data.expires_in)
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
