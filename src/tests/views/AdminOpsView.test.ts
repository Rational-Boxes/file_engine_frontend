import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { storageUsage, triggerSync } = vi.hoisted(() => ({
  storageUsage: vi.fn(),
  triggerSync: vi.fn(),
}))
vi.mock('@/services/adminService', () => ({ adminService: { storageUsage, triggerSync } }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (e: unknown) => String(e) }))

import AdminOpsView from '@/views/AdminOpsView.vue'

const mountView = () =>
  mount(AdminOpsView, { global: { stubs: { AppNav: true, AdminTabs: true } } })

describe('AdminOpsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
