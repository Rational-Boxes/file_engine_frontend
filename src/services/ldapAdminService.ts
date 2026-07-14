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
