import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/auditClient', () => ({ default: { get } }))

import { auditService } from '@/services/auditService'

describe('auditService', () => {
  beforeEach(() => get.mockReset())

  it('query sends only non-empty filters', async () => {
    get.mockResolvedValue({ data: { rows: [], page: 0, page_size: 50, count: 0 } })
    await auditService.query({
      tenant: 'acme', actor: 'alice', action: '', category: undefined, page: 2, page_size: 50,
    })
    expect(get).toHaveBeenCalledWith('/v1/audit/query', {
      params: { tenant: 'acme', actor: 'alice', page: 2, page_size: 50 },
    })
  })

  it('query decodes the result', async () => {
    get.mockResolvedValue({
      data: { rows: [{ seq: 1, category: 'access', action: 'read' }], page: 0, page_size: 50, count: 1 },
    })
    const r = await auditService.query({ tenant: 'acme' })
    expect(r.count).toBe(1)
    expect(r.rows[0].category).toBe('access')
  })

  it('exportNdjson requests a blob', async () => {
    const blob = new Blob(['{}'])
    get.mockResolvedValue({ data: blob })
    const out = await auditService.exportNdjson({ tenant: 'acme', outcome: 'denied' })
    expect(get).toHaveBeenCalledWith('/v1/audit/export', {
      params: { tenant: 'acme', outcome: 'denied' }, responseType: 'blob',
    })
    expect(out).toBe(blob)
  })

  it('verify passes the tenant', async () => {
    get.mockResolvedValue({ data: { ok: true, checked: 5, first_broken_seq: null, reason: null } })
    const r = await auditService.verify('acme')
    expect(get).toHaveBeenCalledWith('/v1/audit/verify', { params: { tenant: 'acme' } })
    expect(r.ok).toBe(true)
  })
})
