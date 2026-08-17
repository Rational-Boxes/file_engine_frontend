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

  it('offers compare on every version that has a predecessor', async () => {
    // Versions render newest-first, so the OLDEST has nothing to compare against
    // and must not offer an action that could only ever answer "no predecessor".
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt()
    await flushPromises()

    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    const hasCompare = rows.map((r) =>
      r.findAll('button').some((b) => b.text() === 'compare'))
    expect(hasCompare).toEqual([true, true, false])
  })

  it('opens the comparison store for the chosen version', async () => {
    listVersions.mockResolvedValue(['v1', 'v2', 'v3'])
    const w = mountIt({ name: 'plan.pdf' })
    await flushPromises()

    const { useDifferenceStore } = await import('@/stores/difference')
    const store = useDifferenceStore()

    const compare = w.findAll('tbody tr')[0].findAll('button').find((b) => b.text() === 'compare')!
    await compare.trigger('click')

    expect(store.isOpen).toBe(true)
    expect(store.uid).toBe('f1')
    expect(store.name).toBe('plan.pdf')
    expect(store.target).toBe('v3')     // newest row
    expect(store.base).toBe('')         // default: the service picks the predecessor
  })

  it('does not offer compare when there is only one version', async () => {
    listVersions.mockResolvedValue(['v1'])
    const w = mountIt()
    await flushPromises()
    expect(w.findAll('button').some((b) => b.text() === 'compare')).toBe(false)
  })
})
