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

const { storageUsage, triggerSync } = vi.hoisted(() => ({
  storageUsage: vi.fn(),
  triggerSync: vi.fn(),
}))
vi.mock('@/services/adminService', () => ({ adminService: { storageUsage, triggerSync } }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (e: unknown) => String(e) }))

// Who is looking, what the deployment offers, and the address bar.
const who = vi.hoisted(() => ({ admin: true, roles: [] as string[] }))
const caps = vi.hoisted(() => ({ chat: true }))
const route = vi.hoisted(() => ({ query: {} as Record<string, string> }))
const replace = vi.hoisted(() => vi.fn())
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    hasAccessLevel: (lvl: string) => lvl === 'admin' && who.admin,
    hasRole: (r: string) => who.roles.includes(r),
  }),
}))
vi.mock('@/composables/useCapabilities', () => ({ useCapabilities: () => ({ features: caps }) }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace }) }))

import AdminOpsView from '@/views/AdminOpsView.vue'

const mountView = () =>
  mount(AdminOpsView, { global: { stubs: { AppNav: true, PromptSetsPanel: { template: '<div class="psp" />' } } } })

const tabLabels = (w: ReturnType<typeof mountView>) => w.findAll('.tabs button').map((b) => b.text())

describe('AdminOpsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    who.admin = true
    who.roles = []
    caps.chat = true
    route.query = {}
    storageUsage.mockResolvedValue({
      totalSpace: 1024 * 1024,
      usedSpace: 512 * 1024,
      availableSpace: 512 * 1024,
      usagePercentage: 50,
    })
    triggerSync.mockResolvedValue(undefined)
  })

  it('loads and renders storage usage', async () => {
    const w = mountView()
    await flushPromises()
    expect(storageUsage).toHaveBeenCalled()
    expect(w.text()).toContain('50%')
    expect(w.find('.bar-fill').attributes('style')).toContain('width: 50%')
  })

  it('triggers a sync and shows confirmation', async () => {
    const w = mountView()
    await flushPromises()
    const syncBtn = w.findAll('button').find((b) => b.text().includes('Trigger sync'))!
    await syncBtn.trigger('click')
    await flushPromises()
    expect(triggerSync).toHaveBeenCalled()
    expect(w.text()).toContain('Sync triggered.')
  })

  it('surfaces an error when storage fails to load', async () => {
    storageUsage.mockRejectedValue(new Error('nope'))
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('nope')
  })

  // --- Prompt sets lives here -----------------------------------------------

  it('an administrator sees every tab, Prompt sets included', async () => {
    const w = mountView()
    await flushPromises()
    expect(tabLabels(w)).toEqual(['Storage & sync', 'Integrations', 'Embedding',
      'Classifier sets', 'Prompt sets', 'Email templates'])
    expect(storageUsage).toHaveBeenCalled()
  })

  it('an extraction editor who is not an admin sees only Prompt sets, and no admin data is requested', async () => {
    who.admin = false
    who.roles = ['extraction_editors']
    const w = mountView()
    await flushPromises()
    expect(tabLabels(w)).toEqual(['Prompt sets'])
    expect(w.find('.psp').exists()).toBe(true)
    expect(storageUsage).not.toHaveBeenCalled()
  })

  it('?tab=prompt-sets opens that tab (the old /prompt-sets address redirects here)', async () => {
    route.query = { tab: 'prompt-sets' }
    const w = mountView()
    await flushPromises()
    expect(w.find('.tabs button.active').text()).toBe('Prompt sets')
    expect(w.find('.psp').exists()).toBe(true)
  })

  it('choosing a tab records it in the address', async () => {
    const w = mountView()
    await flushPromises()
    await w.findAll('.tabs button').find((b) => b.text() === 'Prompt sets')!.trigger('click')
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'prompt-sets' } })
  })

  it('without a chat provider there is no Prompt sets tab', async () => {
    caps.chat = false
    const w = mountView()
    await flushPromises()
    expect(tabLabels(w)).not.toContain('Prompt sets')
  })

  it('an editor on a deployment without chat is told nothing is available', async () => {
    who.admin = false
    who.roles = ['extraction_editors']
    caps.chat = false
    const w = mountView()
    await flushPromises()
    expect(tabLabels(w)).toEqual([])
    expect(w.text()).toContain('Nothing here is available to your account.')
  })
})
