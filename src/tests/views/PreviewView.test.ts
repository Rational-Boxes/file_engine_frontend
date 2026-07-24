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
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uid: 'f1' } }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))

import PreviewView from '@/views/PreviewView.vue'
import { useModel3dStore } from '@/stores/model3d'

const mountView = () =>
  mount(PreviewView, {
    global: { stubs: { AppNav: true, DocumentPreview: true, ThreadPanel: true } },
  })

describe('PreviewView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads the file name for the route uid and renders the preview', async () => {
    stat.mockResolvedValue({ uid: 'f1', name: 'report.pdf' })
    const w = mountView()
    await flushPromises()
    expect(stat).toHaveBeenCalledWith('f1')
    expect(w.text()).toContain('report.pdf')
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(true)
  })

  it('opens the 3D viewer overlay for a model file (not DocumentPreview)', async () => {
    stat.mockResolvedValue({ uid: 'f1', name: 'tower.ifc' })
    const w = mountView()
    await flushPromises()
    expect(useModel3dStore().isOpen).toBe(true)
    expect(w.findComponent({ name: 'DocumentPreview' }).exists()).toBe(false)
  })
})
