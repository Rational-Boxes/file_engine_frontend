import apiClient from '@/services/apiClient'

// Role management over the bridge's /v1/roles* + /v1/users/{user}/roles
// endpoints. Mutations require system_admin (the core 403s otherwise).
export const roleService = {
  async listRoles(): Promise<string[]> {
    const { data } = await apiClient.get<{ roles: string[] }>('/v1/roles')
    return data?.roles ?? []
  },

  async createRole(role: string): Promise<void> {
    await apiClient.post('/v1/roles', { role })
  },

  async deleteRole(role: string): Promise<void> {
    await apiClient.delete(`/v1/roles/${encodeURIComponent(role)}`)
  },

  async usersInRole(role: string): Promise<string[]> {
    const { data } = await apiClient.get<{ users: string[] }>(
      `/v1/roles/${encodeURIComponent(role)}/users`,
    )
    return data?.users ?? []
  },

  async assignUser(role: string, user: string): Promise<void> {
    await apiClient.put(
      `/v1/roles/${encodeURIComponent(role)}/users/${encodeURIComponent(user)}`,
    )
  },

  async removeUser(role: string, user: string): Promise<void> {
    await apiClient.delete(
      `/v1/roles/${encodeURIComponent(role)}/users/${encodeURIComponent(user)}`,
    )
  },

  async rolesForUser(user: string): Promise<string[]> {
    const { data } = await apiClient.get<{ roles: string[] }>(
      `/v1/users/${encodeURIComponent(user)}/roles`,
    )
    return data?.roles ?? []
  },
}
