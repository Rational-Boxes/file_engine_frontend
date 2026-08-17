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
import { createPinia, setActivePinia } from 'pinia'

const { listVersions, getVersion, restoreVersion, purgeVersions } = vi.hoisted(() => ({
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  restoreVersion: vi.fn(),
  purgeVersions: vi.fn(),
}))

vi.mock('@/services/fileService', () => ({
  fileService: { listVersions, getVersion, restoreVersion, purgeVersions },
}))
vi.mock('@/services/apiClient', () => ({ errorMessage: (e: unknown) => String(e) }))

import FileVersions from '@/components/FileVersions.vue'

function mountIt(props: Record<string, unknown> = {}) {
  return mount(FileVersions, { props: { uid: 'f1', current: 'v3', canManage: true, ...props } })
}

describe('FileVersions', () => {
  beforeEach(() => {
    // FileVersions now opens the comparison store from its `compare` action.
    setActivePinia(createPinia())
    vi.clearAllMocks()
    listVersions.mockResolvedValue(['v1', 'v3', 'v2'])
    restoreVersion.mockResolvedValue('v3')
    purgeVersions.mockResolvedValue(undefined)
  })

  it('lists versions newest-first and marks the current one', async () => {
    const w = mountIt()
    await flushPromises()
    const rows = w.findAll('tbody tr')
    expect(rows.map((r) => r.find('.v-ts').text().replace('current', '').trim())).toEqual(['v3', 'v2', 'v1'])
    expect(rows[0].classes()).toContain('current')
    // current version has no "restore" action; the others do.
    expect(rows[0].text()).not.toContain('restore')
    expect(rows[1].text()).toContain('restore')
  })

  it('restores a non-current version and re-emits changed', async () => {
    const w = mountIt()
    await flushPromises()
    listVersions.mockClear()
    const restoreBtn = w.findAll('tbody tr')[2].findAll('button').find((b) => b.text() === 'restore')! // v1
    await restoreBtn.trigger('click')
    await flushPromises()
    expect(restoreVersion).toHaveBeenCalledWith('f1', 'v1')
    expect(listVersions).toHaveBeenCalled() // reloaded
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('purges keeping the chosen newest count', async () => {
    const w = mountIt()
    await flushPromises()
    await w.find('input.v-keep').setValue('2')
    await w.find('form.v-purge').trigger('submit')
    await flushPromises()
    expect(purgeVersions).toHaveBeenCalledWith('f1', 2)
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('downloads a version via getVersion', async () => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:v')
    globalThis.URL.revokeObjectURL = vi.fn()
    getVersion.mockResolvedValue(new Blob(['data']))
    const w = mountIt()
    await flushPromises()
    const dlBtn = w.findAll('tbody tr')[0].findAll('button').find((b) => b.text() === 'download')!
    await dlBtn.trigger('click')
    await flushPromises()
    expect(getVersion).toHaveBeenCalledWith('f1', 'v3')
  })

  it('hides restore/purge controls when canManage is false', async () => {
    const w = mountIt({ canManage: false })
    await flushPromises()
    expect(w.text()).not.toContain('restore')
    expect(w.find('form.v-purge').exists()).toBe(false)
    expect(w.text()).toContain('download') // still downloadable
  })
})

describe('FileVersions — compare', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const boxes = (w: ReturnType<typeof mountIt>) =>
    w.findAll('tbody input[type="checkbox"]')
  const compareBtn = (w: ReturnType<typeof mountIt>) =>
    w.findAll('button').find((b) => b.text().includes('Compare selected'))!

  it('offers a checkbox per version and a disabled compare button', async () => {
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    expect(boxes(w)).toHaveLength(3)
    expect(compareBtn(w).attributes('disabled')).toBeDefined()
  })

  it('enables compare only when exactly two are selected', async () => {
    // A diff is defined between a PAIR: one has nothing to compare against and
    // three has no single answer.
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    await boxes(w)[0].trigger('change')
    expect(compareBtn(w).attributes('disabled')).toBeDefined()

    await boxes(w)[1].trigger('change')
    expect(compareBtn(w).attributes('disabled')).toBeUndefined()
  })

  it('makes a third selection unreachable rather than rejecting it later', async () => {
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    await boxes(w)[0].trigger('change')
    await boxes(w)[1].trigger('change')
    expect(boxes(w)[2].attributes('disabled')).toBeDefined()
  })

  it('deselecting frees the third checkbox again', async () => {
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    await boxes(w)[0].trigger('change')
    await boxes(w)[1].trigger('change')
    await boxes(w)[0].trigger('change')          // untick
    expect(boxes(w)[2].attributes('disabled')).toBeUndefined()
  })

  it('opens the pair the right way round however it was ticked', async () => {
    // versions render newest-first, so list POSITION decides old/new — ticking
    // bottom-up must not invert the comparison.
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt({ name: 'plan.pdf' })
    await flushPromises()

    const { useDifferenceStore } = await import('@/stores/difference')
    const store = useDifferenceStore()

    await boxes(w)[2].trigger('change')          // oldest first
    await boxes(w)[0].trigger('change')          // then newest
    await compareBtn(w).trigger('click')

    expect(store.isOpen).toBe(true)
    expect(store.uid).toBe('f1')
    expect(store.name).toBe('plan.pdf')
    expect(store.target).toBe('v3')              // newer side
    expect(store.base).toBe('v1')                // older side
  })

  it('compares two adjacent versions as an explicit pair', async () => {
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()
    const { useDifferenceStore } = await import('@/stores/difference')
    const store = useDifferenceStore()

    await boxes(w)[0].trigger('change')
    await boxes(w)[1].trigger('change')
    await compareBtn(w).trigger('click')

    expect(store.target).toBe('v3')
    expect(store.base).toBe('v2')
  })

  it('clears the selection', async () => {
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    await boxes(w)[0].trigger('change')
    await w.findAll('button').find((b) => b.text() === 'clear')!.trigger('click')
    expect(compareBtn(w).attributes('disabled')).toBeDefined()
  })

  it('hides the compare bar when there is only one version', async () => {
    listVersions.mockResolvedValue(['v1'])
    const w = mountIt()
    await flushPromises()
    expect(w.findAll('button').some((b) => b.text().includes('Compare selected'))).toBe(false)
  })

  it('drops a selection when the file changes', async () => {
    // A version id from another file would silently produce a nonsense pair.
    // The second file has THREE versions on purpose: a two-version file
    // preselects its own pair, which would mask whether the old selection was
    // actually cleared.
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()
    await boxes(w)[0].trigger('change')

    listVersions.mockResolvedValue(['x1', 'x2', 'x3'])
    await w.setProps({ uid: 'f2' })
    await flushPromises()
    expect(compareBtn(w).attributes('disabled')).toBeDefined()
    expect(boxes(w).some((b) => (b.element as HTMLInputElement).checked)).toBe(false)
  })
})

describe('FileVersions — two-version convenience', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('preselects both when there are exactly two versions', async () => {
    // Only one pair is possible, so making the reviewer tick both is busywork.
    listVersions.mockResolvedValue(['v1', 'v2'])
    const w = mountIt()
    await flushPromises()

    const boxes = w.findAll('tbody input[type="checkbox"]')
    expect(boxes.every((b) => (b.element as HTMLInputElement).checked)).toBe(true)

    const btn = w.findAll('button').find((b) => b.text().includes('Compare selected'))!
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('compares that pair the right way round without any clicks', async () => {
    listVersions.mockResolvedValue(['v1', 'v2'])
    const w = mountIt({ name: 'plan.pdf' })
    await flushPromises()

    const { useDifferenceStore } = await import('@/stores/difference')
    const store = useDifferenceStore()
    await w.findAll('button').find((b) => b.text().includes('Compare selected'))!.trigger('click')

    expect(store.target).toBe('v2')     // newer
    expect(store.base).toBe('v1')       // older
  })

  it('does NOT preselect when the choice is real', async () => {
    // Three or more versions means a genuine decision; guessing one would be
    // worse than asking, because a wrong default is invisible.
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    const boxes = w.findAll('tbody input[type="checkbox"]')
    expect(boxes.some((b) => (b.element as HTMLInputElement).checked)).toBe(false)
    expect(
      w.findAll('button').find((b) => b.text().includes('Compare selected'))!
        .attributes('disabled'),
    ).toBeDefined()
  })

  it('re-preselects when switching to another two-version file', async () => {
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    listVersions.mockResolvedValue(['x1', 'x2'])
    await w.setProps({ uid: 'f2' })
    await flushPromises()

    const boxes = w.findAll('tbody input[type="checkbox"]')
    expect(boxes.every((b) => (b.element as HTMLInputElement).checked)).toBe(true)
  })
})
