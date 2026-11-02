// The `prompt_sets` option source (convert_search_ai EXTRACTION_PROMPT_SETS.md
// §6.1, §6.3): the extract action and the webhook's extracted-data filter list
// published, active prompt sets, and say which came from an application.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/services/promptSetService', () => ({ promptSetService: { list } }))
vi.mock('@/services/folderActionsService', () => ({ folderActionsService: {} }))

import FieldRenderer from '@/components/FieldRenderer.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  list.mockReset()
})

describe('prompt_sets options', () => {
  it('lists published, active sets once, labelling application sets', async () => {
    list.mockResolvedValue([
      { id: 'ps_a', name: 'Door datasheet', status: 'active', revision: 3, managed: 'builder' },
      { id: 'ps_b', name: 'Window', status: 'active', revision: 1, managed: 'application',
        managed_by: { label: 'Reviera', client_key_id: 'k' } },
      { id: 'ps_c', name: 'Draft only', status: 'active', revision: null, managed: 'builder' },
      { id: 'ps_d', name: 'Old', status: 'retired', revision: 2, managed: 'builder' },
    ])
    const fields = [{ key: 'prompt_sets', label: 'Prompt sets', type: 'multiselect',
      options_source: 'prompt_sets' }]
    const w = mount(FieldRenderer, {
      props: { fields: fields as never, modelValue: { prompt_sets: [] } },
      global: { stubs: { NodeBrowser: true, PrincipalPicker: true, Teleport: true } },
    })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('Door datasheet (r3)')
    expect(text).toContain('Window (r1, from Reviera)')
    expect(text).not.toContain('Draft only')
    expect(text).not.toContain('Old')
    expect(list).toHaveBeenCalledOnce()
  })
})
