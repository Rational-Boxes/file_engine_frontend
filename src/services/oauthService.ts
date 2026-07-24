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

import ldapAdminClient from '@/services/ldapAdminClient'

// SPA-brokered OAuth 2.0 / OIDC authorization + consent (Phase 1.7). An external
// client redirects the browser to the SPA's /oauth/authorize route, which — as the
// logged-in user — calls these endpoints on the authority (ldap_manager): `prepare`
// decides whether consent is needed; `decide` records the user's choice and returns
// the URL to send the browser back to the client with a code (or an error).

export interface AuthorizeParams {
  response_type: string
  client_id: string
  redirect_uri: string
  scope: string
  state: string
  nonce: string
  code_challenge: string
  code_challenge_method: string
}

export type PrepareResult =
  | { action: 'redirect'; url: string } // trusted / already-consented → code issued
  | { action: 'error'; url: string } // redirectable protocol error
  | { action: 'consent'; client_name: string; scopes: string[]; redirect_uri: string }

export interface DecisionResult {
  action: 'redirect' | 'error'
  url: string
}

// Read the OAuth request params from the current URL's query string.
export function authorizeParamsFromQuery(q: URLSearchParams): AuthorizeParams {
  return {
    response_type: q.get('response_type') || 'code',
    client_id: q.get('client_id') || '',
    redirect_uri: q.get('redirect_uri') || '',
    scope: q.get('scope') || '',
    state: q.get('state') || '',
    nonce: q.get('nonce') || '',
    code_challenge: q.get('code_challenge') || '',
    code_challenge_method: q.get('code_challenge_method') || 'S256',
  }
}

export const oauthService = {
  async prepare(p: AuthorizeParams): Promise<PrepareResult> {
    return (await ldapAdminClient.post('/oauth/authorize/prepare', p)).data
  },
  async decide(p: AuthorizeParams, approved: boolean, remember: boolean): Promise<DecisionResult> {
    return (await ldapAdminClient.post('/oauth/authorize/decision', { ...p, approved, remember }))
      .data
  },
}

// Human-readable description of an OIDC scope for the consent screen.
const SCOPE_LABELS: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Your name and profile',
  email: 'Your email address',
  roles: 'Your roles in this tenant',
  offline_access: 'Stay connected when you’re away (offline access)',
}

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] || scope
}
