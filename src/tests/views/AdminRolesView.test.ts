import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const svc = vi.hoisted(() => ({
  listRoles: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
  usersInRole: vi.fn(),
  assignUser: vi.fn(),
  removeUser: vi.fn(),
}))
vi.mock('@/services/roleService', () => ({ roleService: svc }))
vi.mock('@/services/apiClient', () => ({ errorMessage: (e: unknown) => String(e) }))

import AdminRolesView from '@/views/AdminRolesView.vue'

// Stub AppNav (router/store deps) and PrincipalPicker (emits a chosen user).
const PrincipalPickerStub = {
  name: 'PrincipalPicker',
  props: ['types'],
  template: `<button class="pick" @click="$emit('select', { kind: 'user', value: 'newuser' })">pick</button>`,
}

function mountView() {
  return mount(AdminRolesView, {
    global: { stubs: { AppNav: true, PrincipalPicker: PrincipalPickerStub } },
  })
}

describe('AdminRolesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    svc.listRoles.mockResolvedValue(['editors', 'admins'])
    svc.usersInRole.mockResolvedValue(['alice'])
    svc.createRole.mockResolvedValue(undefined)
    svc.deleteRole.mockResolvedValue(undefined)
    svc.assignUser.mockResolvedValue(undefined)
    svc.removeUser.mockResolvedValue(undefined)
  })

  it('lists roles and shows a selected role’s members', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.findAll('.role-list li').length).toBeGreaterThanOrEqual(2)
    await w.findAll('.role-list li')[0].trigger('click') // editors
    await flushPromises()
    expect(svc.usersInRole).toHaveBeenCalledWith('editors')
    expect(w.text()).toContain('alice')
  })

  it('creates a role then reloads', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('.add-role input').setValue('writers')
    await w.find('.add-role').trigger('submit')
    await flushPromises()
    expect(svc.createRole).toHaveBeenCalledWith('writers')
    expect(svc.listRoles).toHaveBeenCalledTimes(2)
  })

  it('adds a member via the user picker and reloads members', async () => {
    const w = mountView()
    await flushPromises()
    await w.findAll('.role-list li')[0].trigger('click') // select editors
    await flushPromises()
    svc.usersInRole.mockClear()
    await w.find('.pick').trigger('click') // PrincipalPicker -> user "newuser"
    await flushPromises()
    expect(svc.assignUser).toHaveBeenCalledWith('editors', 'newuser')
    expect(svc.usersInRole).toHaveBeenCalledWith('editors') // refreshed
  })

  it('passes a user-only type filter to the picker', async () => {
    const w = mountView()
    await flushPromises()
    await w.findAll('.role-list li')[0].trigger('click')
    await flushPromises()
    const picker = w.findComponent(PrincipalPickerStub)
    expect(picker.props('types')).toEqual(['user'])
  })
})
