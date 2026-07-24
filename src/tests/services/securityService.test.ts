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

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, put, post, del } = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), post: vi.fn(), del: vi.fn(),
}))
vi.mock('@/services/auditClient', () => ({ default: { get, put, post, delete: del } }))

import { securityService, type SecurityRule } from '@/services/securityService'

const RULE = { id: 'bf' } as unknown as SecurityRule

describe('securityService', () => {
  beforeEach(() => {
    get.mockReset(); put.mockReset(); post.mockReset(); del.mockReset()
  })

  it('incidents passes tenant + status', async () => {
    get.mockResolvedValue({ data: { incidents: [{ id: 1 }] } })
    const r = await securityService.incidents('acme', 'open')
    expect(get).toHaveBeenCalledWith('/v1/security/incidents', { params: { tenant: 'acme', status: 'open' } })
    expect(r[0].id).toBe(1)
  })

  it('rules returns the effective/defaults/overrides view', async () => {
    get.mockResolvedValue({ data: { effective: [{ id: 'bf' }], defaults: [], overrides: [] } })
    const r = await securityService.rules('acme')
    expect(get).toHaveBeenCalledWith('/v1/security/rules', { params: { tenant: 'acme' } })
    expect(r.effective[0].id).toBe('bf')
  })

  it('saveRule PUTs the rule', async () => {
    put.mockResolvedValue({ data: { ok: true } })
    await securityService.saveRule(RULE, 'acme')
    expect(put).toHaveBeenCalledWith('/v1/security/rules', RULE, { params: { tenant: 'acme' } })
  })

  it('validate POSTs and returns the count', async () => {
    post.mockResolvedValue({ data: { would_fire: 2, events_examined: 10 } })
    const r = await securityService.validate(RULE, 'acme')
    expect(r.would_fire).toBe(2)
  })

  it('setIncidentStatus + deleteRule hit the right endpoints', async () => {
    post.mockResolvedValue({ data: {} })
    del.mockResolvedValue({ data: {} })
    await securityService.setIncidentStatus(3, 'acknowledged', 'acme')
    expect(post).toHaveBeenCalledWith('/v1/security/incidents/3/status', { status: 'acknowledged' }, { params: { tenant: 'acme' } })
    await securityService.deleteRule('bf', 'acme')
    expect(del).toHaveBeenCalledWith('/v1/security/rules/bf', { params: { tenant: 'acme' } })
  })
})
