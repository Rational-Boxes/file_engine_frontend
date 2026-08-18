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


// A thread can now be anchored to a comparison as well as to a 3D viewpoint. The
// panel's job is to offer the way back to it and to hand the host the anchor
// verbatim — the host owns rendering, the panel owns the affordance.
describe('comparison-anchored threads', () => {
  const DIFF_ANCHOR = {
    kind: 'diff-view' as const,
    file_uid: 'f1',
    base: '2026-08-16T09:00:00',
    target: '2026-08-17T10:00:00',
    plugin: 'pdf',
    plugin_version: '1',
    page: 2,
    view: 'difference' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    flags.mockResolvedValue({})
    listFileReviews.mockResolvedValue([])
    listReviews.mockResolvedValue([])
  })

  async function panel(anchor: unknown) {
    listThreads.mockResolvedValue([{ id: 't1', status: 'open', anchor, comments: [] }])
    const w = mount(ThreadPanel, { props: { fileUid: 'f1', embedded: true } })
    await flushPromises()
    return w
  }

  it('offers a way back to the comparison a thread was made against', async () => {
    const w = await panel(DIFF_ANCHOR)
    const btn = w.findAll('.tp-viewbtn').find((b) => b.text().includes('comparison'))
    expect(btn).toBeTruthy()

    await btn!.trigger('click')
    // The anchor goes back to the host untouched — including the page and view, so
    // the reader lands where the author was rather than on page 1 of the default.
    expect(w.emitted('show-diff')?.[0]).toEqual([DIFF_ANCHOR, 't1'])
    w.unmount()
  })

  it('does not offer 3D affordances for a comparison thread', async () => {
    const w = await panel(DIFF_ANCHOR)
    const labels = w.findAll('.tp-viewbtn').map((b) => b.text())
    // 🎯 View and ⬇ BCF are meaningless without a viewpoint; offering a BCF export
    // of a PDF comparison would produce a file nothing can open.
    expect(labels.some((t) => t.includes('BCF'))).toBe(false)
    expect(labels.some((t) => t.includes('🎯'))).toBe(false)
    w.unmount()
  })

  it('offers no comparison affordance on a plain thread', async () => {
    const w = await panel(null)
    expect(w.findAll('.tp-viewbtn').some((b) => b.text().includes('comparison'))).toBe(false)
    w.unmount()
  })

  it('records the interface as it stands at post time, not as it stood at capture', async () => {
    // Attaching a view and then looking closer before posting is normal. A
    // comment that restores to the viewport you had BEFORE you zoomed in points
    // at the sheet rather than at the thing you were writing about.
    const openThread = vi.fn().mockResolvedValue({ id: 't9', comments: [] })
    const svc = await import('@/services/discussionService')
    ;(svc.discussionService as unknown as Record<string, unknown>).openThread = openThread

    const moved = { ...DIFF_ANCHOR, page: 5, view: 'before' as const, zoom: 8, pan_x: -400, pan_y: -220 }
    listThreads.mockResolvedValue([])
    const w = mount(ThreadPanel, {
      props: { fileUid: 'f1', embedded: true, anchorProvider: () => moved },
    })
    await flushPromises()

    const vm = w.vm as unknown as { startAnnotation: (a: unknown) => void; newBody: string }
    vm.startAnnotation(DIFF_ANCHOR)
    vm.newBody = 'the callout moved'
    await (w.vm as unknown as { open: () => Promise<void> }).open()

    expect(openThread).toHaveBeenCalledWith('f1', expect.objectContaining({ anchor: moved }))
    w.unmount()
  })

  it('names what is attached when a comparison rides along with the next comment', async () => {
    const w = await panel(null)
    ;(w.vm as unknown as { startAnnotation: (a: unknown) => void }).startAnnotation(DIFF_ANCHOR)
    await flushPromises()
    const chip = w.get('.tp-anchor-chip').text()
    // The chip is the author's only confirmation, so it must say "comparison" —
    // the 3D wording it used to hard-code would be a plain lie here.
    expect(chip).toContain('Comparison attached')
    expect(chip).toContain('difference')
    expect(chip).toContain('page 3') // 0-based capture, 1-based for a human
    w.unmount()
  })
})
