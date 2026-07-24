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

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))
vi.mock('@/services/fileService', () => ({ fileService: { stat } }))
// DocumentPreview is exercised in its own suite; stub it here.
vi.mock('@/components/DocumentPreview.vue', () => ({
  default: { name: 'DocumentPreview', props: ['uid', 'name', 'fullWidth'], template: '<div class="dp-stub" />' },
}))

import PdfPreviewOverlay from '@/components/PdfPreviewOverlay.vue'
import { usePreviewStore } from '@/stores/preview'

const mountOverlay = () =>
  mount(PdfPreviewOverlay, { global: { stubs: { teleport: true } } })

describe('PdfPreviewOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    stat.mockResolvedValue({ name: 'report.pdf' })
  })

  it('is hidden until the preview store is opened', async () => {
    const w = mountOverlay()
    expect(w.find('.ov-backdrop').exists()).toBe(false)

    usePreviewStore().open('f1', 'report.pdf')
    await flushPromises()
    expect(w.find('.ov-backdrop').exists()).toBe(true)
    expect(w.find('.ov-title').text()).toBe('report.pdf')
    expect(w.find('.dp-stub').exists()).toBe(true)
  })

  it('looks up the name when opened without one', async () => {
    const w = mountOverlay()
    usePreviewStore().open('f1') // no name
    await flushPromises()
    expect(stat).toHaveBeenCalledWith('f1')
    expect(w.find('.ov-title').text()).toBe('report.pdf')
  })

  it('closes via the ✕ button (overlay only — no navigation)', async () => {
    const store = usePreviewStore()
    const w = mountOverlay()
    store.open('f1', 'report.pdf')
    await flushPromises()

    await w.find('.ov-x').trigger('click')
    expect(store.isOpen).toBe(false)
    expect(w.find('.ov-backdrop').exists()).toBe(false)
  })
})
