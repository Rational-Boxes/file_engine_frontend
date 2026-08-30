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

// Typed wrapper over the LDAP Manager REST API (SPECIFICATION.md §7). Public
// endpoints (invite/reset/password-policy) don't need the bearer token, but the
// shared client attaches it harmlessly if present.

export interface Role {
  name: string
  dn: string
  member_count: number
}
export interface UserSummary {
  uid: string
  email: string
  display_name: string
  in_this_tenant?: boolean | null
}
// One row of the tenant roster. Unlike UserSummary (a global-directory hit), a
// roster row is always a member of this tenant, so it carries the roles it holds
// here. `orphaned` is a role member whose global user entry no longer exists —
// shown so it can be cleaned up rather than silently dropped.
export interface RosterUser {
  uid: string
  email: string
  display_name: string
  roles: string[]
  is_admin: boolean
  orphaned: boolean
}
// A member's profile as an admin sees it. `other_tenant_count` is deliberately a
// count and not names: it tells the admin that removing the person from this
// workspace still leaves them access elsewhere, without disclosing where.
export interface AdminUserDetail {
  uid: string
  email: string
  display_name: string
  given_name: string
  surname: string
  avatar_url: string
  tenant: string
  roles: string[]
  is_admin: boolean
  other_tenant_count: number
}
export interface UserRemoval {
  uid: string
  roles_removed: string[]
  credentials_purged: number   // tenant-bound door keys (WebDAV/MCP/…) revoked
}

export interface Profile {
  uid: string
  email: string
  display_name: string
  given_name: string
  surname: string
  avatar_url: string
  tenant: string
  roles: string[]
}
export interface EmailTemplate {
  kind: string
  subject: string
  body: string
  customized: boolean
}
export interface PasswordPolicy {
  min_length: number
  max_length: number
  require_upper: boolean
  require_lower: boolean
  require_digit: boolean
  require_symbol: boolean
  min_classes: number
  forbid_identity_substring: boolean
}
export interface TwoFactorStatus {
  enabled: boolean
  pending: boolean
  recovery_remaining: number
  required: boolean
  methods: string[]
}
export interface TwoFactorSetup {
  secret: string
  otpauth_uri: string
  issuer: string
  account: string
}
export interface TwoFactorPolicy {
  deployment_methods: string[]   // the methods this deployment permits (the ceiling)
  allowed_methods: string[]      // the methods this tenant permits (in force)
  require: boolean               // 2FA required for tenant members (tenant policy)
  required_by_deployment: boolean // env-forced required (locked on, read-only)
}

export interface ServiceCredentialMeta {
  key_id: string
  label: string | null
  scopes: string[]
  allowed_cidrs: string[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}
export interface ServiceCredentialSecret {
  key_id: string
  secret: string          // shown ONCE, at create/rotate
  scopes?: string[]
  label?: string | null
}
export interface WebdavSessionTtl {
  session_ttl_seconds: number | null   // tenant override, null = inherit
  effective_ttl_seconds: number
  default_ttl_seconds: number
  min_ttl_seconds: number
  max_ttl_seconds: number
}

export const ldapAdminService = {
  // --- tenant admin: roles ---
  async listRoles(): Promise<Role[]> {
    return (await ldapAdminClient.get('/v1/admin/roles')).data
  },
  async createRole(name: string): Promise<Role> {
    return (await ldapAdminClient.post('/v1/admin/roles', { name })).data
  },
  async deleteRole(role: string): Promise<void> {
    await ldapAdminClient.delete(`/v1/admin/roles/${encodeURIComponent(role)}`)
  },
  async listMembers(role: string): Promise<string[]> {
    return (await ldapAdminClient.get(`/v1/admin/roles/${encodeURIComponent(role)}/members`)).data.members
  },
  async addMember(role: string, uid: string): Promise<void> {
    await ldapAdminClient.post(`/v1/admin/roles/${encodeURIComponent(role)}/members`, { uid })
  },
  async removeMember(role: string, uid: string): Promise<void> {
    await ldapAdminClient.delete(
      `/v1/admin/roles/${encodeURIComponent(role)}/members/${encodeURIComponent(uid)}`,
    )
  },

  // --- tenant admin: users ---
  async findUsers(query: string): Promise<UserSummary[]> {
    return (await ldapAdminClient.get('/v1/admin/users', { params: { query } })).data
  },
  async createUser(email: string, display_name: string, roles: string[] = []): Promise<UserSummary> {
    return (await ldapAdminClient.post('/v1/admin/users', { email, display_name, roles })).data
  },
  async reinvite(uid: string): Promise<void> {
    await ldapAdminClient.post(`/v1/admin/users/${encodeURIComponent(uid)}/reinvite`)
  },
  // The tenant's own membership — not the global directory, which stays
  // search-only (SPECIFICATION §6.1).
  async listTenantUsers(): Promise<RosterUser[]> {
    return (await ldapAdminClient.get('/v1/admin/users/roster')).data
  },
  async getUserProfile(uid: string): Promise<AdminUserDetail> {
    return (await ldapAdminClient.get(`/v1/admin/users/${encodeURIComponent(uid)}/profile`)).data
  },
  // The complete set of roles the user should hold here; the server diffs it
  // against what they hold now and applies the administrators guards.
  async setUserRoles(uid: string, roles: string[]): Promise<AdminUserDetail> {
    return (await ldapAdminClient.put(`/v1/admin/users/${encodeURIComponent(uid)}/roles`, { roles })).data
  },
  // Remove the user from THIS tenant: drops their roles here and purges their
  // tenant-bound door keys. The global account is not this call's to delete — that
  // is a sysadmin/LDAP operation.
  async removeUser(uid: string): Promise<UserRemoval> {
    return (await ldapAdminClient.delete(`/v1/admin/users/${encodeURIComponent(uid)}`)).data
  },

  // --- tenant admin: two-factor policy (PROPOSAL §4.8) ---
  async get2faPolicy(): Promise<TwoFactorPolicy> {
    return (await ldapAdminClient.get('/v1/admin/2fa-policy')).data
  },
  // allowed_methods null = inherit the full deployment cap.
  async save2faPolicy(allowed_methods: string[] | null, require: boolean): Promise<TwoFactorPolicy> {
    return (await ldapAdminClient.put('/v1/admin/2fa-policy', { allowed_methods, require })).data
  },

  // --- tenant admin: email templates ---
  async listTemplates(): Promise<EmailTemplate[]> {
    return (await ldapAdminClient.get('/v1/admin/email-templates')).data
  },
  async saveTemplate(kind: string, subject: string, body: string): Promise<EmailTemplate> {
    return (await ldapAdminClient.put(`/v1/admin/email-templates/${kind}`, { subject, body })).data
  },
  async revertTemplate(kind: string): Promise<void> {
    await ldapAdminClient.delete(`/v1/admin/email-templates/${kind}`)
  },
  async previewTemplate(
    kind: string,
    draft?: { subject: string; body: string },
  ): Promise<{ subject: string; body: string }> {
    return (await ldapAdminClient.post(`/v1/admin/email-templates/${kind}/preview`, draft ?? {})).data
  },
  async testTemplate(kind: string): Promise<void> {
    await ldapAdminClient.post(`/v1/admin/email-templates/${kind}/test`)
  },

  // --- self-service profile ---
  async getProfile(): Promise<Profile> {
    return (await ldapAdminClient.get('/v1/me')).data
  },
  async updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'given_name' | 'surname' | 'avatar_url'>>): Promise<Profile> {
    return (await ldapAdminClient.patch('/v1/me', patch)).data
  },
  async changePassword(current_password: string, new_password: string): Promise<void> {
    await ldapAdminClient.post('/v1/me/password', { current_password, new_password })
  },

  // --- self-service two-factor auth (PROPOSAL §4) ---
  async twofaStatus(): Promise<TwoFactorStatus> {
    return (await ldapAdminClient.get('/v1/me/2fa/status')).data
  },
  // Begin enrollment: returns a fresh (pending) secret + otpauth URI to show as a
  // QR / manual key. Not active until confirmed via twofaVerifySetup().
  async twofaSetup(): Promise<TwoFactorSetup> {
    return (await ldapAdminClient.post('/v1/me/2fa/setup')).data
  },
  // Confirm enrollment with a code from the authenticator; returns recovery codes
  // (shown once).
  async twofaVerifySetup(code: string): Promise<{ enabled: boolean; recovery_codes: string[] }> {
    return (await ldapAdminClient.post('/v1/me/2fa/verify-setup', { code })).data
  },
  // Turn 2FA off; requires a current TOTP or a recovery code.
  async twofaDisable(code: string): Promise<void> {
    await ldapAdminClient.post('/v1/me/2fa/disable', { code })
  },
  // Regenerate recovery codes (invalidates the old set); requires a current TOTP.
  async twofaRegenerateRecovery(code: string): Promise<{ recovery_codes: string[] }> {
    return (await ldapAdminClient.post('/v1/me/2fa/recovery-codes', { code })).data
  },

  // --- self-service WebDAV/MCP credentials (key:secret, PROPOSAL §15/§16) ---
  async listServiceCredentials(): Promise<ServiceCredentialMeta[]> {
    return (await ldapAdminClient.get('/v1/me/service-credentials')).data.credentials
  },
  // Returns the plaintext secret ONCE — never retrievable again.
  async createServiceCredential(label: string, scopes: string[]): Promise<ServiceCredentialSecret> {
    return (await ldapAdminClient.post('/v1/me/service-credentials', { label, scopes })).data
  },
  // Regenerate: new secret (shown once); the old one stops working immediately.
  async rotateServiceCredential(keyId: string, newKeyId = false): Promise<ServiceCredentialSecret> {
    return (
      await ldapAdminClient.post(
        `/v1/me/service-credentials/${encodeURIComponent(keyId)}/rotate`,
        { new_key_id: newKeyId },
      )
    ).data
  },
  async revokeServiceCredential(keyId: string): Promise<void> {
    await ldapAdminClient.delete(`/v1/me/service-credentials/${encodeURIComponent(keyId)}`)
  },

  // --- tenant admin: WebDAV session TTL (PROPOSAL §14.10) ---
  async getWebdavSessionTtl(): Promise<WebdavSessionTtl> {
    return (await ldapAdminClient.get('/v1/admin/webdav-session-ttl')).data
  },
  // null clears the override (inherit the deployment default); a value is clamped.
  async saveWebdavSessionTtl(session_ttl_seconds: number | null): Promise<WebdavSessionTtl> {
    return (await ldapAdminClient.put('/v1/admin/webdav-session-ttl', { session_ttl_seconds })).data
  },

  // --- public: policy + invite + reset ---
  async passwordPolicy(): Promise<PasswordPolicy> {
    return (await ldapAdminClient.get('/v1/password-policy')).data
  },
  async acceptInvite(token: string, password: string): Promise<void> {
    await ldapAdminClient.post('/v1/invite/accept', { token, password })
  },
  async requestReset(email: string): Promise<void> {
    await ldapAdminClient.post('/v1/reset/request', { email })
  },
  async confirmReset(token: string, password: string): Promise<void> {
    await ldapAdminClient.post('/v1/reset/confirm', { token, password })
  },
}
