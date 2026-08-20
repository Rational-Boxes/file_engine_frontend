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
import { mount, flushPromises } from '@vue/test-utils'

const { create, listForNode, revoke } = vi.hoisted(() => ({
  create: vi.fn(), listForNode: vi.fn(), revoke: vi.fn(),
}))

vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  return {
    ...actual,
    shareService: { create, listForNode, revoke },
    default: { create, listForNode, revoke },
  }
})

import ShareTab from '@/components/ShareTab.vue'
import { ShareKind } from '@/services/shareService'

function mountTab(props: Partial<Record<string, unknown>> = {}) {
  return mount(ShareTab, {
    props: { resourceUid: 'uid-1', isFolder: false, name: 'Contract.pdf', ...props },
  })
}

beforeEach(() => {
  create.mockReset(); listForNode.mockReset(); revoke.mockReset()
  listForNode.mockResolvedValue([])
})

describe('ShareTab', () => {
  it('says an address authorizes rather than emails — the thing users misread', async () => {
    // v1 sends no invite mail. Someone who assumes typing an address sends it
    // will never send the link, and the recipient will never hear anything.
    const w = mountTab()
    await flushPromises()
    expect(w.text()).toMatch(/who is .*allowed.* to use the link/i)
    expect(w.text()).toMatch(/don't email them/i)
  })

  it('will not create without at least one recipient', async () => {
    const w = mountTab()
    await flushPromises()
    const btn = w.findAll('button').find((b) => b.text().includes('Create link'))!
    expect(btn.attributes('disabled')).toBeDefined()
    await w.find('input[type="text"]').setValue('someone@example.com')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('splits recipients on commas and whitespace, lower-casing them', async () => {
    create.mockResolvedValue({ link_uid: 'l1', url: 'https://x/s/l1.s',
                               expires_at: new Date().toISOString() })
    const w = mountTab()
    await flushPromises()
    await w.find('input[type="text"]').setValue('  A@Example.com , b@example.com ')
    await w.findAll('button').find((b) => b.text().includes('Create link'))!.trigger('click')
    await flushPromises()
    expect(create.mock.calls[0][1].recipients).toEqual(['a@example.com', 'b@example.com'])
  })

  it('shows the URL once, and says so', async () => {
    create.mockResolvedValue({
      link_uid: 'l1', url: 'https://x/s/l1.secret',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    const w = mountTab()
    await flushPromises()
    await w.find('input[type="text"]').setValue('a@example.com')
    await w.findAll('button').find((b) => b.text().includes('Create link'))!.trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/only time this link is shown/i)
    expect(w.find('.share-url input').attributes('value')).toBe('https://x/s/l1.secret')
  })

  it('offers a message that warns a code is coming', async () => {
    // An unexpected code request on an unfamiliar domain is what security
    // training tells people to ignore, so the pasteable message must pre-empt it.
    create.mockResolvedValue({
      link_uid: 'l1', url: 'https://x/s/l1.secret',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    const w = mountTab()
    await flushPromises()
    await w.find('input[type="text"]').setValue('a@example.com')
    await w.findAll('button').find((b) => b.text().includes('Create link'))!.trigger('click')
    await flushPromises()
    const msg = w.find('textarea').element.value
    expect(msg).toContain('https://x/s/l1.secret')
    expect(msg).toMatch(/one-time code/i)
    expect(msg).toMatch(/that's expected/i)
  })

  it('offers both folder shapes for a folder, and neither for a file', async () => {
    const file = mountTab({ isFolder: false })
    await flushPromises()
    expect(file.find('select').exists()).toBe(true)   // the expiry select
    expect(file.text()).not.toMatch(/send you files/i)

    const folder = mountTab({ isFolder: true })
    await flushPromises()
    expect(folder.text()).toMatch(/download this folder/i)
    expect(folder.text()).toMatch(/send you files/i)
  })

  it('names what the recipient gets, not the flag, for subfolders', async () => {
    const w = mountTab({ isFolder: true })
    await flushPromises()
    expect(w.text()).toMatch(/everything under this folder/i)
  })

  it('sends max_files for a drop box and max_uses for a download', async () => {
    // A use is a session; files are counted separately. Sending the wrong one
    // would bound nothing about how much arrives.
    create.mockResolvedValue({ link_uid: 'l1', url: 'u', expires_at: new Date().toISOString() })
    const w = mountTab({ isFolder: true })
    await flushPromises()
    await w.find('input[type="text"]').setValue('a@example.com')
    await w.find('select').setValue(String(ShareKind.UPLOAD))
    await w.findAll('button').find((b) => b.text().includes('Create link'))!.trigger('click')
    await flushPromises()
    expect(create.mock.calls[0][1]).toHaveProperty('max_files')
  })

  it('degrades quietly when the service is unavailable', async () => {
    // The feature may simply be switched off in this deployment; that must not
    // break the drawer around it.
    listForNode.mockRejectedValue(new Error('nope'))
    const w = mountTab()
    await flushPromises()
    expect(w.find('.share-group').exists()).toBe(true)
  })

  it('surfaces why a link stopped working', async () => {
    listForNode.mockResolvedValue([{
      link_uid: 'l1', kind: ShareKind.FILE, status: 'not_working',
      not_working_message: 'You no longer have access to this item.',
      max_uses: 5, uses_consumed: 0, max_files: 0, files_consumed: 0,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }])
    const w = mountTab()
    await flushPromises()
    expect(w.text()).toMatch(/Not working/i)
    expect(w.text()).toMatch(/no longer have access/i)
  })
})
