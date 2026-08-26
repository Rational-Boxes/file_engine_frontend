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

// The replay control: re-run a folder's actions when the events did not fire.
//
// It lives in the runs view because that is where someone realises nothing
// happened — they came to read the log and found it empty.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { listBindings, folderRuns, replayFolder } = vi.hoisted(() => ({
  listBindings: vi.fn(), folderRuns: vi.fn(), replayFolder: vi.fn(),
}))

vi.mock('@/services/folderActionsService', () => ({
  folderActionsService: { listBindings, folderRuns, replayFolder },
}))

import FolderActionsPanel from '@/components/FolderActionsPanel.vue'

function mountPanel(canWrite = true) {
  return mount(FolderActionsPanel, {
    props: { uid: 'folder-1', canWrite, canManage: canWrite },
    global: { stubs: { BindingEditor: true, HelpIcon: true, FolderFieldPath: true } },
  })
}

async function openRuns(w: ReturnType<typeof mountPanel>) {
  const tab = w.findAll("button").find((b) => /run log/i.test(b.text()))
  await tab!.trigger('click')
  await flushPromises()
  return w
}

const replayBtn = (w: ReturnType<typeof mountPanel>) =>
  w.findAll('button').find((b) => /replay/i.test(b.text()))

beforeEach(() => {
  listBindings.mockReset(); folderRuns.mockReset(); replayFolder.mockReset()
  listBindings.mockResolvedValue([])
  folderRuns.mockResolvedValue([])
  replayFolder.mockResolvedValue({ folder_uid: 'folder-1', counts: {} })
})

describe('folder actions replay', () => {
  it('offers replay in the runs view', async () => {
    const w = await openRuns(mountPanel())
    expect(replayBtn(w)).toBeTruthy()
  })

  it('replays the folder it is showing', async () => {
    replayFolder.mockResolvedValue({
      folder_uid: 'folder-1', counts: { candidates: 3, dispatched: 2 },
    })
    const w = await openRuns(mountPanel())
    await replayBtn(w)!.trigger('click')
    await flushPromises()
    expect(replayFolder).toHaveBeenCalledWith('folder-1')
  })

  it('reports what it did, not merely that it ran', async () => {
    // "Replayed" with no numbers reads as success even when nothing was found —
    // the same ambiguity that let the missed events go unnoticed.
    replayFolder.mockResolvedValue({
      folder_uid: 'folder-1', counts: { candidates: 3, dispatched: 2 },
    })
    const w = await openRuns(mountPanel())
    await replayBtn(w)!.trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/3 files/)
    expect(w.text()).toMatch(/2 actions dispatched/)
  })

  it('says plainly when the window held nothing', async () => {
    replayFolder.mockResolvedValue({ folder_uid: 'folder-1', counts: { candidates: 0 } })
    const w = await openRuns(mountPanel())
    await replayBtn(w)!.trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/nothing to replay/i)
  })

  it('surfaces a failure instead of looking successful', async () => {
    replayFolder.mockRejectedValue(new Error('boom'))
    const w = await openRuns(mountPanel())
    await replayBtn(w)!.trigger('click')
    await flushPromises()
    expect(w.find('.fap-replay-error').exists()).toBe(true)
  })

  it('refreshes the run log afterwards, so the effect is visible', async () => {
    const w = await openRuns(mountPanel())
    folderRuns.mockClear()
    await replayBtn(w)!.trigger('click')
    await flushPromises()
    expect(folderRuns).toHaveBeenCalled()
  })

  it('is hidden without write access', async () => {
    // It moves files and sends notifications; read access is not enough.
    const w = await openRuns(mountPanel(false))
    expect(replayBtn(w)).toBeFalsy()
  })
})
