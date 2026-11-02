// The extraction prompt builder (convert_search_ai EXTRACTION_PROMPT_SETS.md §4).
// Pinned:
//   - only administrators and extraction editors get the builder;
//   - what is sent: optional parts dropped, units and limits only on numbers,
//     enum values only on enums (cleanDefinition);
//   - a new set is saved as a draft, then published; Publish waits for a save;
//   - Try it sends the CURRENT, unsaved edits with pasted text or a picked file,
//     and shows value, unit, quote and a model fallback;
//   - an application-managed set offers Take over and Lock.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { cleanDefinition, type PromptSetDefinition } from '@/services/promptSetService'

const { svc, roleBox } = vi.hoisted(() => ({
  svc: {
    models: vi.fn(), list: vi.fn(), get: vi.fn(), create: vi.fn(), saveDraft: vi.fn(),
    publish: vi.fn(), retire: vi.fn(), control: vi.fn(), exportYaml: vi.fn(), importYaml: vi.fn(),
    test: vi.fn(), revisions: vi.fn(), testMarkup: vi.fn(),
  },
  roleBox: { roles: [] as string[] },
}))
vi.mock('@/services/promptSetService', async (orig) => ({
  ...(await orig<typeof import('@/services/promptSetService')>()),
  promptSetService: svc,
}))
vi.mock('@/components/NodeBrowser.vue', () => ({ default: { template: '<div class="nb" />' } }))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    hasAccessLevel: (l: string) => l === 'admin' && roleBox.roles.includes('tenant_admin'),
    hasRole: (r: string) => roleBox.roles.includes(r),
  }),
}))

const MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', default: true },
  { id: 'qwen3', label: 'Qwen3', default: false },
]
const DEF: PromptSetDefinition = {
  name: 'Door datasheet', description: '', slug: 'reviera.door', instructions: 'Use the door.',
  model: '', applies_to: { classifier_set: '', labels: [] }, markup: { colours: {} },
  fields: [{ name: 'fire_rating', type: 'string', label: 'Fire rating', description: '', required: true },
    { name: 'width', type: 'number', unit: 'mm', label: '', description: '', required: false }],
}

async function mountPanel() {
  const { default: Panel } = await import('@/components/system/PromptSetsPanel.vue')
  const w = mount(Panel)
  await flushPromises()
  return w
}

beforeEach(() => {
  setActivePinia(createPinia())
  Object.values(svc).forEach((f) => f.mockReset())
  svc.models.mockResolvedValue(MODELS)
  svc.list.mockResolvedValue([])
  roleBox.roles = ['users', 'extraction_editors']
})

describe('cleanDefinition', () => {
  it('drops what does not apply', () => {
    const out = cleanDefinition({
      name: '  Door ', fields: [
        { name: ' fire_rating ', type: 'enum', enum: [' EI 30', '', 'EI 60 '], unit: 'mm', minimum: 1 },
        { name: 'width', type: 'number', unit: ' mm ', minimum: 300, maximum: null, enum: ['x'] },
        { name: 'note', type: 'string', unit: 'kg' },
      ],
      applies_to: { labels: [' door ', ''] },
    })
    expect(out.name).toBe('Door')
    expect(out.fields[0]).toEqual({ name: 'fire_rating', type: 'enum', label: '', description: '',
      required: false, enum: ['EI 30', 'EI 60'] })
    expect(out.fields[1]).toEqual({ name: 'width', type: 'number', label: '', description: '',
      required: false, unit: 'mm', minimum: 300 })
    expect(out.fields[2].unit).toBeUndefined()
    expect(out.applies_to?.labels).toEqual(['door'])
  })
})

describe('PromptSetsPanel', () => {
  it('is only for administrators and extraction editors', async () => {
    roleBox.roles = ['users']
    const w = await mountPanel()
    expect(w.text()).toContain('You need the administrator or extraction editor role')
    expect(svc.list).not.toHaveBeenCalled()
  })

  it('saves a new set as a draft, then publishes it', async () => {
    svc.create.mockResolvedValue({ id: 'ps_1', draft_revision: 1, warnings: [] })
    svc.get.mockResolvedValue({ id: 'ps_1', name: 'Door datasheet', revision: null, draft_revision: 1,
      status: 'active', managed: 'builder', revision_shown: 1, state: 'draft', definition: DEF })
    const w = await mountPanel()
    await w.find('.pset-list-head .btn').trigger('click')            // New set
    await w.find('input[placeholder="Door datasheet"]').setValue('Door datasheet')
    await w.find('input[aria-label="Field name"]').setValue('fire_rating')
    const publish = w.findAll('.actions .btn').find((b) => b.text().includes('Publish'))!
    expect(publish.attributes('disabled')).toBeDefined()           // nothing saved yet
    await w.findAll('.actions .btn').find((b) => b.text().includes('Save'))!.trigger('click')
    await flushPromises()
    expect(svc.create).toHaveBeenCalledOnce()
    expect(svc.create.mock.calls[0][0].fields[0].name).toBe('fire_rating')
    expect(w.text()).toContain('Saved as draft r1')
    svc.publish.mockResolvedValue({ id: 'ps_1', revision: 1, warnings: [] })
    await w.findAll('.actions .btn').find((b) => b.text().includes('Publish'))!.trigger('click')
    await flushPromises()
    expect(svc.publish).toHaveBeenCalledWith('ps_1')
    expect(w.text()).toContain('Published r1')
  })

  it('tests the unsaved edits on pasted text and shows the result and a fallback', async () => {
    svc.list.mockResolvedValue([{ id: 'ps_1', name: 'Door datasheet', status: 'active', managed: 'builder',
      revision: 1, slug: 'reviera.door', description: '' }])
    svc.get.mockResolvedValue({ id: 'ps_1', name: 'Door datasheet', revision: 1, status: 'active',
      managed: 'builder', revision_shown: 1, state: 'published', definition: DEF })
    svc.test.mockResolvedValue({
      plan: { model: { requested: 'claude', used: 'deepseek-v4-flash', fallback: true } },
      items: [{ file_uid: '', name: 'Pasted text', version: '', tokens: 321,
        data: { fire_rating: { found: true, value: 'EI 60', unit: null, evidence: { quote: 'Fire resistance | EI 60', offset: 2 } },
          width: { found: false, value: null, unit: null, evidence: null } },
        counts: { found: 1, not_found: 1, dropped_no_evidence: 1 } }],
      summary: {},
    })
    const w = await mountPanel()
    await w.find('.pset-name').trigger('click')
    await flushPromises()
    await w.find('textarea[placeholder="If several products are listed, use the one named in the file name."]')
      .setValue('Edited, not saved')
    await w.find('textarea[placeholder="Paste document text here…"]').setValue('| Fire resistance | EI 60 |')
    await w.findAll('.pset-test .btn').find((b) => b.text().includes('Run test'))!.trigger('click')
    await flushPromises()
    const sent = svc.test.mock.calls[0][0]
    expect(sent.set.instructions).toBe('Edited, not saved')        // the unsaved edit
    expect(sent.text).toBe('| Fire resistance | EI 60 |')
    expect(sent.file_uid).toBeUndefined()
    const rows = w.findAll('.pset-table tbody tr')
    expect(rows[0].text()).toContain('EI 60')
    expect(rows[0].text()).toContain('Fire resistance | EI 60')
    expect(rows[1].text()).toContain('not found')
    expect(w.text()).toContain('fallback')
    expect(w.text()).toContain('1 value(s) dropped')
  })

  it('offers take over and lock for an application-managed set', async () => {
    svc.list.mockResolvedValue([{ id: 'ps_2', name: 'Window', status: 'active', managed: 'application',
      revision: 3, slug: 'reviera.window', description: '', managed_by: { label: 'Reviera', client_key_id: 'fesk_1' } }])
    svc.get.mockResolvedValue({ id: 'ps_2', name: 'Window', revision: 3, status: 'active',
      managed: 'application', managed_by: { label: 'Reviera', client_key_id: 'fesk_1' }, locked: false,
      revision_shown: 3, state: 'published', definition: { ...DEF, name: 'Window' } })
    svc.control.mockResolvedValue({ id: 'ps_2', managed: 'builder', status: 'active', revision: 3,
      revision_shown: 3, state: 'published', locked: false, name: 'Window' })
    const w = await mountPanel()
    expect(w.find('.badge.app').exists()).toBe(true)
    await w.find('.pset-name').trigger('click')
    await flushPromises()
    expect(w.find('.pset-app-note').text()).toContain('Reviera')
    await w.findAll('.pset-app-note .btn').find((b) => b.text() === 'Take over')!.trigger('click')
    await flushPromises()
    expect(svc.control).toHaveBeenCalledWith('ps_2', { take_over: true })
  })
})

describe('PromptSetsPanel marked-up PDF', () => {
  it('offers the test PDF and shows the page of each value', async () => {
    svc.list.mockResolvedValue([{ id: 'ps_1', name: 'Door datasheet', status: 'active', managed: 'builder',
      revision: 1, slug: null, description: '' }])
    svc.get.mockResolvedValue({ id: 'ps_1', name: 'Door datasheet', revision: 1, status: 'active',
      managed: 'builder', revision_shown: 1, state: 'published', definition: DEF })
    svc.test.mockResolvedValue({ plan: { model: { requested: null, used: 'deepseek-v4-flash', fallback: false } },
      items: [{ file_uid: 'd1', name: 'door.pdf', version: 'v1', tokens: 10,
        data: { fire_rating: { found: true, value: 'EI 60', unit: null, evidence: { quote: 'q', offset: 1 } },
          width: { found: true, value: 926, unit: 'mm', evidence: { quote: 'w', offset: 5 } } },
        markup: { status: 'ready', download: '/v1/prompt-sets/test/markup/tok',
          fields: { fire_rating: { located: true, page: 2, method: 'words' }, width: { located: false, reason: 'not_located' } } } }],
      summary: {} })
    svc.testMarkup.mockResolvedValue(new Blob(['%PDF']))
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const w = await mountPanel()
    await w.find('.pset-name').trigger('click')
    await flushPromises()
    await w.find('textarea[placeholder="Paste document text here…"]').setValue('x')
    await w.findAll('.pset-test .btn').find((b) => b.text().includes('Run test'))!.trigger('click')
    await flushPromises()
    const rows = w.findAll('.pset-table tbody tr')
    expect(rows[0].text()).toContain('page 2')
    expect(rows[1].text()).toContain('not located')
    await w.findAll('.pset-results .btn').find((b) => b.text().includes('marked-up PDF'))!.trigger('click')
    await flushPromises()
    expect(svc.testMarkup).toHaveBeenCalledWith('/v1/prompt-sets/test/markup/tok')
    expect(open).toHaveBeenCalledWith('blob:x', '_blank', 'noopener')
  })
})
