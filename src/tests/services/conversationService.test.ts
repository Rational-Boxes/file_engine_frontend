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

const { get, del } = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }))

vi.mock('@/services/csaiClient', () => ({
  default: { get, delete: del },
}))

import { conversationService } from '@/services/conversationService'

describe('conversationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists conversations, mapping snake_case + defaulting an empty title', async () => {
    get.mockResolvedValue({
      data: {
        conversations: [
          { id: 'c1', title: 'Revenues', updated_at: '2026-01-02T00:00:00' },
          { id: 'c2', title: '', updated_at: '2026-01-01T00:00:00' },
        ],
      },
    })
    const list = await conversationService.list()
    expect(get).toHaveBeenCalledWith('/conversations')
    expect(list).toEqual([
      { id: 'c1', title: 'Revenues', updatedAt: '2026-01-02T00:00:00' },
      { id: 'c2', title: 'New chat', updatedAt: '2026-01-01T00:00:00' },
    ])
  })

  it('tolerates a missing conversations array', async () => {
    get.mockResolvedValue({ data: {} })
    expect(await conversationService.list()).toEqual([])
  })

  it('gets a conversation and maps doc + web citations', async () => {
    get.mockResolvedValue({
      data: {
        id: 'c1',
        title: 'Chat',
        messages: [
          { role: 'user', content: 'q' },
          {
            role: 'assistant',
            content: 'a',
            citations: [
              { file_uid: 'f1', marker: 1 },
              { kind: 'web', url: 'https://x.test', title: 'X', marker: 2 },
            ],
          },
        ],
      },
    })
    const convo = await conversationService.get('c1')
    expect(get).toHaveBeenCalledWith('/conversations/c1')
    expect(convo).toEqual({
      id: 'c1',
      title: 'Chat',
      scope: [],
      messages: [
        { role: 'user', content: 'q', citations: [] },
        {
          role: 'assistant',
          content: 'a',
          citations: [
            { kind: 'doc', fileUid: 'f1', marker: 1 },
            { kind: 'web', url: 'https://x.test', title: 'X', marker: 2 },
          ],
        },
      ],
    })
  })

  it('maps the saved folder scope (dropping entries without a uid)', async () => {
    get.mockResolvedValue({
      data: {
        id: 'c2',
        title: 'Scoped',
        scope: [
          { uid: 'fa', path: '/A' },
          { uid: 'fb', path: '/B/deep' },
          { path: '/no-uid' }, // dropped
        ],
        messages: [],
      },
    })
    const convo = await conversationService.get('c2')
    expect(convo.scope).toEqual([
      { uid: 'fa', path: '/A' },
      { uid: 'fb', path: '/B/deep' },
    ])
  })

  it('deletes and reports success / failure', async () => {
    del.mockResolvedValue({})
    expect(await conversationService.remove('c1')).toBe(true)
    expect(del).toHaveBeenCalledWith('/conversations/c1')

    del.mockRejectedValue(new Error('404'))
    expect(await conversationService.remove('gone')).toBe(false)
  })
})
