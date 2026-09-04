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

// The run log's File column names the file.
//
// It recorded — and showed — a raw uid, which is right for the RECORD (a name
// captured at run time goes stale on the first rename) and useless in the
// column: the whole question a run log answers is "what happened to what", and
// half of that was a truncated uuid. Same fix the binding editor needed for its
// stored destination folders.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { listBindings, folderRuns, stat } = vi.hoisted(() => ({
  listBindings: vi.fn(), folderRuns: vi.fn(), stat: vi.fn(),
}))

vi.mock('@/services/folderActionsService', () => ({
  folderActionsService: { listBindings, folderRuns, replayFolder: vi.fn() },
}))
vi.mock('@/services/fileService', () => ({ fileService: { stat } }))

import FolderActionsPanel from '@/components/FolderActionsPanel.vue'

const UID = '2ac82cd0-d4f8-472c-868c-fee99f1d7aad'
const OTHER = 'c74b9508-bf20-4019-a783-9931dff7cd00'

function run(file_uid: string, extra: Record<string, unknown> = {}) {
  return {
    event_id: `e-${file_uid}-${JSON.stringify(extra)}`,
    binding_id: 'b1',
    action_type: 'sort',
    file_uid,
    version: 'v1',
    status: 'done',
    detail: {},
    ...extra,
  }
}

async function openRuns() {
  const w = mount(FolderActionsPanel, {
    props: { uid: 'folder-1', canWrite: true, canManage: true },
    global: { stubs: { BindingEditor: true, HelpIcon: true, FolderFieldPath: true } },
  })
  const tab = w.findAll('button').find((b) => /run log/i.test(b.text()))
  await tab!.trigger('click')
  await flushPromises()
  return w
}

const fileCells = (w: Awaited<ReturnType<typeof openRuns>>) =>
  w.findAll('table.fap-runtable tbody tr').map((r) => r.findAll('td')[2])

beforeEach(() => {
  listBindings.mockReset().mockResolvedValue([])
  folderRuns.mockReset().mockResolvedValue([])
  stat.mockReset().mockImplementation(async (uid: string) =>
    ({ name: uid === UID ? 'LEED_Reference_Guide.pdf' : 'Strategy.pptx' }))
})

describe('the run log names the file it ran on', () => {
  it('shows the filename, not the uid', async () => {
    folderRuns.mockResolvedValue([run(UID)])
    const w = await openRuns()

    expect(fileCells(w)[0].text()).toBe('LEED_Reference_Guide.pdf')
    expect(fileCells(w)[0].text()).not.toContain('2ac82cd0')
  })

  it('keeps the uid in the title, so a row can still be traced', async () => {
    folderRuns.mockResolvedValue([run(UID)])
    const w = await openRuns()

    expect(fileCells(w)[0].attributes('title')).toBe(UID)
  })

  it('asks once per file, however many times it ran', async () => {
    // A log is mostly the same few files handled repeatedly, and every lookup is
    // a stat against the core.
    folderRuns.mockResolvedValue([run(UID), run(UID, { status: 'skipped' }), run(OTHER)])
    await openRuns()

    expect(stat).toHaveBeenCalledTimes(2)
    expect(stat.mock.calls.map((c) => c[0]).sort()).toEqual([UID, OTHER].sort())
  })

  it('falls back to the uid when the file cannot be named', async () => {
    // Deleted since the run, or not reachable by this viewer. Showing the uid is
    // poor but honest — and far better than an empty cell.
    stat.mockRejectedValue(new Error('not found'))
    folderRuns.mockResolvedValue([run(UID)])
    const w = await openRuns()

    const cell = fileCells(w)[0]
    expect(cell.text()).toContain('2ac82cd0')
    expect(cell.classes()).toContain('mono')   // uid styling, not a name
    expect(cell.attributes('title')).toBe(UID)
  })

  it('shows no name once the file is erased — the name is never held here', async () => {
    // The reason this is a lookup rather than a stored column. A filename can
    // carry personal information; held only by the file, it is destroyed when
    // the file is. A name denormalised into the run record would still be
    // legible here after the platform certified the file destroyed.
    folderRuns.mockResolvedValue([run(UID)])
    expect((await openRuns()).findAll('table.fap-runtable tbody tr')[0]
      .findAll('td')[2].text()).toBe('LEED_Reference_Guide.pdf')

    // ...the file is erased; the core no longer answers for it.
    stat.mockRejectedValue(new Error('erased'))
    const after = await openRuns()   // a fresh session: nothing was cached to disk

    const cell = after.findAll('table.fap-runtable tbody tr')[0].findAll('td')[2]
    expect(cell.text()).not.toContain('LEED')
    expect(cell.text()).toContain('2ac82cd0')
  })
})
