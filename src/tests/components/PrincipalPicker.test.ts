import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { searchPrincipals } = vi.hoisted(() => ({ searchPrincipals: vi.fn() }))

// Keep the real suggestionsToPrincipals; only stub the network call.
vi.mock('@/services/aclService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/aclService')>()
  return { ...actual, aclService: { searchPrincipals } }
})

import PrincipalPicker from '@/components/PrincipalPicker.vue'

// The suggestions menu is wrapped in <Teleport to="body">; stub teleport so it
// renders inline and the wrapper queries below resolve against it.
const mountPicker = (props: Record<string, unknown>) =>
  mount(PrincipalPicker, { props, global: { stubs: { teleport: true } } })

describe('PrincipalPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces, searches, renders typed results, and emits the chosen principal', async () => {
    searchPrincipals.mockResolvedValue({ users: ['alice'], roles: ['editors'], claims: ['dept=eng'] })
    const wrapper = mountPicker({ debounceMs: 50 })

    await wrapper.find('input').setValue('e')
    expect(searchPrincipals).not.toHaveBeenCalled() // debounced

    vi.advanceTimersByTime(50)
    await flushPromises()

    expect(searchPrincipals).toHaveBeenCalledWith('e', { types: undefined, limit: 8 })
    const items = wrapper.findAll('.pp-item')
    expect(items).toHaveLength(3)
    expect(items[0].text()).toContain('alice')

    await items[1].trigger('mousedown') // the role "editors"
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual({ kind: 'role', value: 'editors' })
    // selection clears the query
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('forwards a restricted type filter and limit', async () => {
    searchPrincipals.mockResolvedValue({ users: [], roles: [], claims: ['k=v'] })
    const wrapper = mountPicker({ types: ['claim'], limit: 3, debounceMs: 0 })
    await wrapper.find('input').setValue('k')
    vi.advanceTimersByTime(0)
    await flushPromises()
    expect(searchPrincipals).toHaveBeenCalledWith('k', { types: ['claim'], limit: 3 })
  })

  it('offers the synthetic "Everyone" option when the query matches an alias', async () => {
    searchPrincipals.mockResolvedValue({ users: [], roles: [], claims: [] })
    const wrapper = mountPicker({ debounceMs: 0 })

    await wrapper.find('input').setValue('every')
    vi.advanceTimersByTime(0)
    await flushPromises()

    const items = wrapper.findAll('.pp-item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('Everyone')

    await items[0].trigger('mousedown')
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual({ kind: 'everyone', value: 'everyone' })
  })

  it('does not inject Everyone for a single-letter query', async () => {
    searchPrincipals.mockResolvedValue({ users: ['ed'], roles: [], claims: [] })
    const wrapper = mountPicker({ debounceMs: 0 })
    await wrapper.find('input').setValue('e')
    vi.advanceTimersByTime(0)
    await flushPromises()
    const items = wrapper.findAll('.pp-item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('ed')
    expect(items[0].text()).not.toContain('Everyone')
  })

  it('clearing the query cancels the pending search', async () => {
    const wrapper = mountPicker({ debounceMs: 50 })
    await wrapper.find('input').setValue('abc')
    await wrapper.find('input').setValue('')
    vi.advanceTimersByTime(100)
    await flushPromises()
    expect(searchPrincipals).not.toHaveBeenCalled()
  })
})
