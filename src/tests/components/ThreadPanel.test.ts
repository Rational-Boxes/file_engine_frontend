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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// The discussion service is the panel's data source; stub the calls load() makes.
const { listThreads, flags, listFileReviews, listReviews } = vi.hoisted(() => ({
  listThreads: vi.fn(),
  flags: vi.fn(),
  listFileReviews: vi.fn(),
  listReviews: vi.fn(),
}))
vi.mock('@/services/discussionService', () => ({
  discussionService: { listThreads, flags, listFileReviews, listReviews },
  extractMentions: () => [],
}))
// Live updates + BCF export are enhancement-only here; neutralise them.
vi.mock('@/services/discussionLive', () => ({ LiveSession: class {
  close() {}
} }))
vi.mock('@/services/bcfService', () => ({ default: { downloadThreadBcf: vi.fn() } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: 'me' }) }))
// Children are exercised by their own tests; stub them so the panel stays focused.
vi.mock('@/components/CommentEditor.vue', () => ({ default: { name: 'CommentEditor', render: () => null } }))
vi.mock('@/components/HelpIcon.vue', () => ({ default: { name: 'HelpIcon', render: () => null } }))
vi.mock('@/components/CommentNode.vue', () => ({ default: { name: 'CommentNode', render: () => null } }))

import ThreadPanel from '@/components/ThreadPanel.vue'

// scrollToThread / the comment focus defer their DOM lookup to requestAnimationFrame —
// run the callback inline so the lookup happens within the test tick, and record every
// getElementById call so we can assert what was (or wasn't) focused.
function spyFocus() {
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 0
  })
  const getById = vi.spyOn(document, 'getElementById')
  const ids = () => getById.mock.calls.map((c) => c[0])
  return { raf, getById, ids, restore: () => (raf.mockRestore(), getById.mockRestore()) }
}

describe('ThreadPanel deep-link focus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listThreads.mockResolvedValue([{ id: 't1', status: 'open', comments: [] }])
    flags.mockResolvedValue({})
    listFileReviews.mockResolvedValue([])
    listReviews.mockResolvedValue([])
  })

  it('scrolls to the thread for a ?thread= deep-link (focusThread prop is now wired)', async () => {
    const f = spyFocus()
    const w = mount(ThreadPanel, { props: { fileUid: 'f1', focusThread: 't1', embedded: true } })
    await flushPromises()

    // The regression: previously the focusThread prop was declared but never acted on,
    // so this lookup never happened. It must now target the thread's anchor element.
    expect(f.getById).toHaveBeenCalledWith('thread-t1')
    f.restore()
    w.unmount()
  })

  it('scrolls to the comment for a ?comment= deep-link (and not to a thread)', async () => {
    const f = spyFocus()
    const w = mount(ThreadPanel, { props: { fileUid: 'f1', focusComment: 'c9', embedded: true } })
    await flushPromises()

    expect(f.getById).toHaveBeenCalledWith('comment-c9')
    // A comment deep-link takes priority; it must not also try to focus a thread.
    expect(f.ids().some((id) => id?.startsWith('thread-'))).toBe(false)
    f.restore()
    w.unmount()
  })

  it('does not focus anything with no deep-link prop', async () => {
    const f = spyFocus()
    const w = mount(ThreadPanel, { props: { fileUid: 'f1', embedded: true } })
    await flushPromises()

    expect(f.ids().some((id) => id?.startsWith('thread-') || id?.startsWith('comment-'))).toBe(false)
    f.restore()
    w.unmount()
  })
})
