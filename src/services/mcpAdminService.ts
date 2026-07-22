import csaiClient, { errorMessage } from '@/services/csaiClient'

// Typed wrapper over convert_search_ai's tenant-admin MCP integrations API
// (MCP_INTEGRATIONS §5), served by CSAI at /v1/admin/mcp-integrations and gated on
// the tenant-admin role. Secrets are write-only: `secret` is sent on create/update
// and NEVER returned (responses carry only `has_secret`).

export type McpTransport = 'streamable-http' | 'sse'
export type McpAuthType = 'none' | 'bearer' | 'header' | 'oauth'

export interface McpIntegration {
  id: string
  name: string
  slug: string
  description: string
  transport: McpTransport
  endpoint_url: string
  auth_type: McpAuthType
  auth_header: string
  has_secret: boolean
  headers: Record<string, string>
  enabled: boolean
  allowed_tools: string[] | null // null = expose all discovered tools
  allowed_roles: string[] | null // null/empty = all users; else only these roles may use it
  forward_identity: boolean
  token_url: string // oauth: token endpoint (client-credentials)
  oauth_client_id: string // oauth: client id
  oauth_scope: string // oauth: requested scope(s)
  created_by: string
  created_at: string
  updated_at: string
}

// Create/update payload. `secret` present ⇒ set/rotate ("" clears it); absent ⇒
// leave as-is. `allowed_tools` null ⇒ all discovered tools.
export interface McpIntegrationWrite {
  name?: string
  description?: string
  transport?: McpTransport
  endpoint_url?: string
  auth_type?: McpAuthType
  auth_header?: string
  secret?: string
  headers?: Record<string, string>
  allowed_tools?: string[] | null
  allowed_roles?: string[] | null
  enabled?: boolean
  forward_identity?: boolean
  token_url?: string
  oauth_client_id?: string
  oauth_scope?: string
}

export interface McpToolInfo {
  name: string
  description: string
  input_schema: Record<string, unknown>
}
export interface McpTestResult {
  ok: boolean
  error?: string
  tools: McpToolInfo[]
}

const BASE = '/v1/admin/mcp-integrations'

export const mcpAdminService = {
  async list(): Promise<McpIntegration[]> {
    return (await csaiClient.get(BASE)).data.integrations
  },
  async get(id: string): Promise<McpIntegration> {
    return (await csaiClient.get(`${BASE}/${encodeURIComponent(id)}`)).data
  },
  async create(body: McpIntegrationWrite): Promise<McpIntegration> {
    return (await csaiClient.post(BASE, body)).data
  },
  async update(id: string, body: McpIntegrationWrite): Promise<McpIntegration> {
    return (await csaiClient.put(`${BASE}/${encodeURIComponent(id)}`, body)).data
  },
  async remove(id: string): Promise<void> {
    await csaiClient.delete(`${BASE}/${encodeURIComponent(id)}`)
  },
  // Connect to a saved integration and list its tools (powers "Test connection"
  // and the allowlist picker).
  async test(id: string): Promise<McpTestResult> {
    return (await csaiClient.post(`${BASE}/${encodeURIComponent(id)}/test`)).data
  },
  // Dry-run a not-yet-saved config (used before the first create).
  async testConfig(body: McpIntegrationWrite): Promise<McpTestResult> {
    return (await csaiClient.post(`${BASE}/test`, body)).data
  },
}

export { errorMessage }
