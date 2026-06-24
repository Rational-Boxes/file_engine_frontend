import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { getAcls, grantPermission, revokePermission } = vi.hoisted(() => ({
  getAcls: vi.fn(),
  grantPermission: vi.fn(),
  revokePermission: vi.fn(),
}))

vi.mock('@/services/aclService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/aclService')>()
  return { ...actual, aclService: { getAcls } }
})
vi.mock('@/services/fileService', () => ({
  fileService: { grantPermission, revokePermission },
}))

import AclEditor from '@/components/AclEditor.vue'

// Stub the type-ahead with a button that emits a chosen principal.
const PrincipalPickerStub = {
  name: 'PrincipalPicker',
  template: `<button class="pick" @click="$emit('select', { kind: 'role', value: 'editors' })">pick</button>`,
}

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(AclEditor, {
    props: { uid: 'f1', canManage: true, ...props },
    global: { stubs: { PrincipalPicker: PrincipalPickerStub } },
  })
}

describe('AclEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    grantPermission.mockResolvedValue(undefined)
    revokePermission.mockResolvedValue(undefined)
  })

  it('lists entries with decoded permissions, effect, and a DENY note', async () => {
    getAcls.mockResolvedValue([
      { principal: 'editors', type: 1, permissions: 0x400 | 0x200, effect: 'allow' },
      { principal: 'erin', type: 0, permissions: 0x400, effect: 'deny' },
    ])
    const w = mountEditor()
    await flushPromises()
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('editors')
    expect(w.text()).toContain('Read')
    expect(w.text()).toContain('Write')
    expect(w.text()).toContain('DENY overrides ALLOW')
  })

  it('grants the picked principal in wire form with the chosen permission/effect', async () => {
    getAcls.mockResolvedValue([])
    const w = mountEditor()
    await flushPromises()
    await w.find('.pick').trigger('click') // PrincipalPicker -> role:editors
    await w.find('.btn').trigger('click') // Grant (defaults perm=r, effect=allow)
    await flushPromises()
    expect(grantPermission).toHaveBeenCalledWith('f1', {
      principal: 'role:editors',
      permission: 'r',
      effect: 'allow',
    })
    expect(getAcls).toHaveBeenCalledTimes(2) // reload after grant
    expect(w.emitted('changed')).toBeTruthy()
  })

  it('revokes a single permission using the encoded principal + effect', async () => {
    getAcls.mockResolvedValue([
      { principal: 'dept=eng', type: 4, permissions: 0x400, effect: 'allow' },
    ])
    const w = mountEditor()
    await flushPromises()
    await w.find('.acl-x').trigger('click') // revoke the Read chip
    await flushPromises()
    expect(revokePermission).toHaveBeenCalledWith('f1', {
      principal: 'claim:dept=eng',
      permission: 'r',
      effect: 'allow',
    })
  })

  it('hides editing controls when canManage is false', async () => {
    getAcls.mockResolvedValue([{ principal: 'dave', type: 0, permissions: 0x400, effect: 'allow' }])
    const w = mountEditor({ canManage: false })
    await flushPromises()
    expect(w.find('.acl-add').exists()).toBe(false)
    expect(w.find('.acl-x').exists()).toBe(false)
  })
})
