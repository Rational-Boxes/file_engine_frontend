// Headless runs in the research view (convert_search_ai
// HEADLESS_RESEARCH_API.md §3.5): desktop applications' runs are listed per
// application, collapsed by default, out of the chat history, and open
// read-only. These pin what the user sees:
//   - nothing at all when there are no applications (no empty chrome);
//   - one fold per key, labelled as the user named it, with a usage warning;
//   - an extraction run as a table: value, unit and the quote it came from;
//     a dropped value as "no evidence"; erased and skipped documents as notes;
//   - the service maps the wire shape and survives an older csai (404 = none).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import HeadlessApplications from '@/components/HeadlessApplications.vue'
import HeadlessRunView from '@/components/HeadlessRunView.vue'
import type { HeadlessApplication, HeadlessRun } from '@/services/headlessService'

const get = vi.fn()
vi.mock('@/services/csaiClient', () => ({ default: { get: (...a: unknown[]) => get(...a) } }))

const usageWarn = {
  state: 'warning' as const,
  message: "This key has used 85% of today's token budget.",
  limits: {
    tokens: { used: 850, limit: 1000, resets_at: '', state: 'warning' as const },
    requests: { used: 1, limit: 60, resets_at: '', state: 'ok' as const },
  },
  cache: { hits: 2, tokens_saved_estimate: 400 },
}

const apps: HeadlessApplication[] = [
  { clientKeyId: 'fesk_a', label: 'Reviera laptop', runCount: 2, lastRun: '',
    runs: [{ id: 'r1', title: 'Extract fire_rating from folder' }, { id: 'r2', title: 'Second' }],
    usage: usageWarn },
  { clientKeyId: 'fesk_b', label: '', runCount: 1, lastRun: '',
    runs: [{ id: 'r3', title: 'Third' }], usage: null },
]

describe('HeadlessApplications', () => {
  it('renders nothing without applications', () => {
    const w = mount(HeadlessApplications, { props: { applications: [] } })
    expect(w.find('.apps').exists()).toBe(false)
  })

  it('folds per application, collapsed, with labels and the usage warning', async () => {
    const w = mount(HeadlessApplications, { props: { applications: apps, activeRunId: 'r2' } })
    const outer = w.find('details.apps')
    expect(outer.attributes('open')).toBeUndefined()            // collapsed by default
    expect(outer.find('summary').text()).toBe('Applications (2)')
    const folds = w.findAll('details.app')
    expect(folds[0].find('.app-name').text()).toBe('Reviera laptop')
    expect(folds[0].find('.usage-badge').text()).toBe('high usage')
    expect(folds[0].find('.usage-msg').text()).toContain('85%')
    expect(folds[1].find('.app-name').text()).toBe('Unnamed key')
    expect(folds[1].find('.usage-badge').exists()).toBe(false)
    expect(w.find('.run-open.active').text()).toBe('Second')
    await folds[0].findAll('.run-open')[0].trigger('click')
    expect(w.emitted('open')?.[0]).toEqual(['r1'])
  })
})

const extractRun: HeadlessRun = {
  id: 'r1', title: 'Extract from folder', clientLabel: 'Reviera laptop',
  createdAt: '2026-10-29T12:00:00Z',
  request: { kind: 'extract', schema: { type: 'object', properties: { fire_rating: {}, width_mm: {}, epd_number: {} } } },
  summary: { extracted: 1, cached: 0, skipped: 1, failed: 0 },
  answer: '',
  results: [
    { file_uid: 'd1', name: 'door.pdf', version: 'v1', valid: true, data: {
      fire_rating: { found: true, value: 'EI 60', unit: null, evidence: { quote: 'Fire resistance | EI 60', offset: 40 } },
      width_mm: { found: true, value: 926, unit: 'mm', evidence: { quote: 'Width | 926 mm', offset: 70 } },
      epd_number: { found: false, value: null, unit: null, evidence: null, dropped: 'no_evidence' } } },
    { file_uid: 'd2', name: 'scan.pdf', version: 'v3', skipped: 'no text' },
    { file_uid: 'd3', name: 'old.pdf', version: 'v1', erased: true },
  ],
}

describe('HeadlessRunView', () => {
  it('shows an extraction as values, units and quotes per document', async () => {
    const w = mount(HeadlessRunView, { props: { run: extractRun } })
    expect(w.find('.readonly').exists()).toBe(true)
    expect(w.findAll('th').map((t) => t.text())).toEqual(['Document', 'fire_rating', 'width_mm', 'epd_number'])
    const rows = w.findAll('tbody tr')
    const cells = rows[0].findAll('td')
    expect(cells[1].find('.value').text()).toBe('EI 60')
    expect(cells[1].find('.quote').text()).toBe('Fire resistance | EI 60')
    expect(cells[2].text()).toContain('926')
    expect(cells[2].find('.unit').text()).toBe('mm')
    expect(cells[3].find('.dropped').text()).toBe('no evidence')
    expect(rows[1].find('.note').text()).toBe('Skipped: no text')
    expect(rows[2].find('.note').text()).toBe('Erased — values removed')
    await rows[0].find('.link').trigger('click')
    expect(w.emitted('open-file')?.[0]).toEqual(['d1', 'door.pdf'])
    await w.find('.back').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('shows a question run as the question and the answer', () => {
    const run: HeadlessRun = { ...extractRun, request: { kind: 'research', message: 'Fire rating?' },
      summary: null, answer: 'EI 60 per the datasheet.', results: [] }
    const w = mount(HeadlessRunView, { props: { run } })
    expect(w.find('.question').text()).toBe('Fire rating?')
    expect(w.find('.answer').text()).toBe('EI 60 per the datasheet.')
    expect(w.find('table').exists()).toBe(false)
  })
})

describe('headlessService', () => {
  beforeEach(() => get.mockReset())

  it('maps applications and treats an older csai (404) as none', async () => {
    const { headlessService } = await import('@/services/headlessService')
    get.mockResolvedValueOnce({ data: { applications: [
      { client_key_id: 'fesk_a', label: 'L', run_count: 3, last_run: 'x', runs: [], usage: null }] } })
    expect(await headlessService.listApplications()).toEqual([
      { clientKeyId: 'fesk_a', label: 'L', runCount: 3, lastRun: 'x', runs: [], usage: null }])
    get.mockRejectedValueOnce(Object.assign(new Error('404'), { response: { status: 404 } }))
    expect(await headlessService.listApplications()).toEqual([])
  })

  it('reads a run: request from the first message, summary or answer from the last', async () => {
    const { headlessService } = await import('@/services/headlessService')
    get.mockResolvedValueOnce({ data: {
      id: 'r1', title: 'T', client_label: 'L', created_at: 'c',
      messages: [{ role: 'user', content: '{"kind":"extract","schema":{}}' },
                 { role: 'assistant', content: '{"extracted":2}' }],
      results: [] } })
    const run = await headlessService.getRun('r1')
    expect(run.request.kind).toBe('extract')
    expect(run.summary).toEqual({ extracted: 2 })
    expect(get).toHaveBeenCalledWith('/v1/runs/r1')
    get.mockResolvedValueOnce({ data: {
      id: 'r2', title: 'Q', client_label: 'L', created_at: 'c',
      messages: [{ role: 'user', content: '{"kind":"research","message":"Q?"}' },
                 { role: 'assistant', content: 'The answer.' }], results: [] } })
    const q = await headlessService.getRun('r2')
    expect(q.summary).toBeNull()
    expect(q.answer).toBe('The answer.')
  })
})
