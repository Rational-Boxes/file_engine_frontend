import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get, post, put, delete: del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/services/csaiClient', () => ({
  default: { get, post, put, delete: del },
  errorMessage: (e: unknown) => String(e),
}))

import { mcpAdminService } from '@/services/mcpAdminService'

describe('mcpAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists integrations', async () => {
    get.mockResolvedValue({ data: { integrations: [{ id: 'i1', name: 'CRM' }] } })
    const list = await mcpAdminService.list()
    expect(get).toHaveBeenCalledWith('/v1/admin/mcp-integrations')
    expect(list[0].id).toBe('i1')
  })

  it('creates an OAuth integration (client-credentials fields pass through)', async () => {
    post.mockResolvedValue({ data: { id: 'i9', auth_type: 'oauth', has_secret: true } })
    const body = {
      name: 'OAuth MCP',
      endpoint_url: 'https://mcp.example.com/mcp',
      auth_type: 'oauth' as const,
      token_url: 'https://auth.example.com/token',
      oauth_client_id: 'client-1',
      oauth_scope: 'mcp.read',
      secret: 'client-secret',
      enabled: true,
    }
    const created = await mcpAdminService.create(body)
    expect(post).toHaveBeenCalledWith('/v1/admin/mcp-integrations', body)
    expect(created.auth_type).toBe('oauth')
  })

  it('tests a saved integration + a dry-run config', async () => {
    post.mockResolvedValue({ data: { ok: true, tools: [{ name: 'ping', description: '', input_schema: {} }] } })
    await mcpAdminService.test('i1')
    expect(post).toHaveBeenCalledWith('/v1/admin/mcp-integrations/i1/test')
    await mcpAdminService.testConfig({ name: 'x', endpoint_url: 'https://e/mcp', auth_type: 'none' })
    expect(post).toHaveBeenCalledWith('/v1/admin/mcp-integrations/test', {
      name: 'x',
      endpoint_url: 'https://e/mcp',
      auth_type: 'none',
    })
  })

  it('removes an integration', async () => {
    del.mockResolvedValue({ data: {} })
    await mcpAdminService.remove('i1')
    expect(del).toHaveBeenCalledWith('/v1/admin/mcp-integrations/i1')
  })
})
