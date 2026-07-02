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
