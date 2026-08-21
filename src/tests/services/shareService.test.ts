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

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), del: vi.fn(),
}))

vi.mock('@/services/shareClient', () => ({
  default: { get, post, delete: del },
  SHARE_BASE: '/share',
}))

import { shareService, ShareKind } from '@/services/shareService'

beforeEach(() => {
  get.mockReset(); post.mockReset(); del.mockReset()
})

describe('shareService', () => {
  it('mints a link on the node and returns the once-only URL', async () => {
    post.mockResolvedValue({ data: { link_uid: 'l1', url: 'https://x/s/l1.secret',
                                     secret_shown_once: true } })
    const out = await shareService.create('uid-1', {
      kind: ShareKind.FOLDER, recipients: ['a@example.com'], ttl_days: 7, max_uses: 5,
    })
    expect(post).toHaveBeenCalledWith('/v1/nodes/uid-1/links', expect.objectContaining({
      kind: ShareKind.FOLDER, recipients: ['a@example.com'],
    }))
    expect(out.url).toBe('https://x/s/l1.secret')
  })

  it('never sends a send_invite flag — v1 mails no invite', async () => {
    post.mockResolvedValue({ data: {} })
    await shareService.create('uid-1', { kind: ShareKind.FILE, recipients: ['a@b.c'] })
    const body = post.mock.calls[0][1]
    expect(body).not.toHaveProperty('send_invite')
  })

  it('lists a node’s links and tolerates an empty body', async () => {
    get.mockResolvedValue({ data: {} })
    expect(await shareService.listForNode('uid-1')).toEqual([])
    get.mockResolvedValue({ data: { links: [{ link_uid: 'l1' }] } })
    expect(await shareService.listForNode('uid-1')).toHaveLength(1)
  })

  it('asks for live links by default and can include dead ones', async () => {
    get.mockResolvedValue({ data: { links: [] } })
    await shareService.listMine()
    expect(get).toHaveBeenCalledWith('/v1/links', { params: { live: true } })
    await shareService.listMine(false)
    expect(get).toHaveBeenLastCalledWith('/v1/links', { params: { live: false } })
  })

  it('encodes the address when removing a recipient', async () => {
    // A '+' or '@' in an address must not be read as path structure.
    del.mockResolvedValue({ data: {} })
    await shareService.removeRecipient('l1', 'a+tag@example.com')
    expect(del).toHaveBeenCalledWith('/v1/links/l1/recipients/a%2Btag%40example.com')
  })

  it('revokes by uid', async () => {
    del.mockResolvedValue({ data: {} })
    await shareService.revoke('l1')
    expect(del).toHaveBeenCalledWith('/v1/links/l1')
  })

  it('fetches one link’s live status, which carries not_working', async () => {
    // The server re-runs the authority pre-flight on this route; that is the
    // only way the SPA can learn a link stopped working when nothing about the
    // link changed.
    get.mockResolvedValue({ data: {
      link_uid: 'l1', status: 'not_working',
      not_working_message: 'You no longer have access to this item.',
    } })
    const l = await shareService.get('l1')
    expect(l.status).toBe('not_working')
    expect(l.not_working_message).toMatch(/no longer have access/)
  })
})


describe('shareService — drop provenance', () => {
  it('makes no request for an empty page', async () => {
    // The common case is a folder with no drops in it at all; that must cost
    // nothing, since this runs on every listing change.
    expect(await shareService.provenance([])).toEqual({})
    expect(post).not.toHaveBeenCalled()
  })

  it('asks once for the whole page, not once per row', async () => {
    post.mockResolvedValue({ data: { provenance: {} } })
    await shareService.provenance(['a', 'b', 'c'])
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/v1/files/provenance',
                                      { file_uids: ['a', 'b', 'c'] })
  })

  it('returns the verified address keyed by file uid', async () => {
    // Keyed on the uid, which is what makes the marker survive a move — a
    // path-keyed marker would lose exactly the file someone tidied away.
    post.mockResolvedValue({
      data: { provenance: { f1: { email: 'bob@contractor.example',
                                  at: '2026-08-20T00:00:00Z', shared_by: 'alice',
                                  stored_name: 'report (1).pdf' } } },
    })
    const got = await shareService.provenance(['f1', 'f2'])
    expect(got.f1.email).toBe('bob@contractor.example')
    // The name it ARRIVED as — a collision renamed it on the way in, and the
    // sender was told that name, so it is what they will refer to.
    expect(got.f1.stored_name).toBe('report (1).pdf')
    expect(got.f2).toBeUndefined()
  })

  it('tolerates a response with no provenance key', async () => {
    post.mockResolvedValue({ data: {} })
    expect(await shareService.provenance(['f1'])).toEqual({})
  })
})
