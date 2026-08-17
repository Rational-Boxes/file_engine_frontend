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

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/services/differenceClient', () => ({
  default: { get, post },
  errorMessage: (e: unknown) => String(e),
}))

import { differenceService } from '@/services/differenceService'

function reply(status: number, data: Record<string, unknown>) {
  return { status, data }
}

const READY = {
  status: 'ready',
  manifest: {
    status: 'ready', mode: 'mixed', file_uid: 'F',
    base_version: 'v1', target_version: 'v2',
    plugin: 'pdf', plugin_version: 1, key: 'abc',
    units: [
      { index: 0, mode: 'vector', kind: 'page' },
      { index: 1, mode: 'raster', kind: 'page' },
    ],
    expected: ['diff.abc.page.000.svg', 'diff.abc.page.001.svg'],
  },
  children: [
    { index: 0, name: 'diff.abc.page.000.svg', uid: 'c0', mode: 'vector', kind: 'page' },
    { index: 1, name: 'diff.abc.page.001.svg', uid: 'c1', mode: 'raster', kind: 'page' },
  ],
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  vi.useRealTimers()
})

describe('the five documented statuses', () => {
  it('maps a ready result with its children', async () => {
    get.mockResolvedValue(reply(200, READY))
    const res = await differenceService.get('F')
    expect(res.status).toBe('ready')
    expect(res.baseVersion).toBe('v1')
    expect(res.targetVersion).toBe('v2')
    expect(res.children).toHaveLength(2)
    expect(res.is3d).toBe(false)
  })

  it('maps pending', async () => {
    get.mockResolvedValue(reply(202, {
      status: 'pending', file_uid: 'F', base_version: 'v1', target_version: 'v2',
    }))
    expect((await differenceService.get('F')).status).toBe('pending')
  })

  it('maps a 422 to failed and keeps the reason', async () => {
    // The FE needs the reason to explain the side-by-side fallback.
    get.mockResolvedValue(reply(422, {
      status: 'failed', file_uid: 'F',
      failure: { stage: 'render', reason: 'no raster backend' },
    }))
    const res = await differenceService.get('F')
    expect(res.status).toBe('failed')
    expect(res.failure?.reason).toBe('no raster backend')
  })

  it('treats unsupported as a normal answer, not an error', async () => {
    // §5.3: images are a local flip. Surfacing an error would be wrong.
    get.mockResolvedValue(reply(200, {
      status: 'unsupported', mime: 'image/png', file_uid: 'F',
    }))
    const res = await differenceService.get('F')
    expect(res.status).toBe('unsupported')
    expect(res.mime).toBe('image/png')
  })

  it('maps none for a first version', async () => {
    get.mockResolvedValue(reply(200, {
      status: 'none', reason: 'no_predecessor', detail: 'first version', file_uid: 'F',
    }))
    const res = await differenceService.get('F')
    expect(res.status).toBe('none')
    expect(res.detail).toContain('first version')
  })
})

describe('request shape', () => {
  it('omits version and base when defaulted', async () => {
    get.mockResolvedValue(reply(202, { status: 'pending' }))
    await differenceService.get('F')
    expect(get).toHaveBeenCalledWith('/files/F/diff', { params: {} })
  })

  it('passes an explicit pair through', async () => {
    get.mockResolvedValue(reply(202, { status: 'pending' }))
    await differenceService.get('F', { version: 'v9', base: 'v3' })
    expect(get).toHaveBeenCalledWith('/files/F/diff', { params: { version: 'v9', base: 'v3' } })
  })
})

describe('polling', () => {
  it('polls while pending and resolves on ready', async () => {
    get
      .mockResolvedValueOnce(reply(202, { status: 'pending' }))
      .mockResolvedValueOnce(reply(202, { status: 'pending' }))
      .mockResolvedValueOnce(reply(200, READY))

    const res = await differenceService.getWhenReady('F', {}, { intervalMs: 1 })
    expect(res.status).toBe('ready')
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('stops immediately on every terminal status', async () => {
    for (const body of [
      { status: 'failed' }, { status: 'unsupported' }, { status: 'none' },
    ]) {
      get.mockReset()
      get.mockResolvedValue(reply(body.status === 'failed' ? 422 : 200, body))
      await differenceService.getWhenReady('F', {}, { intervalMs: 1 })
      expect(get).toHaveBeenCalledTimes(1)
    }
  })

  it('reports progress so the UI can show the wait honestly', async () => {
    get
      .mockResolvedValueOnce(reply(202, { status: 'pending' }))
      .mockResolvedValueOnce(reply(200, READY))
    const seen: number[] = []
    await differenceService.getWhenReady('F', {}, {
      intervalMs: 1, onProgress: (n) => seen.push(n),
    })
    expect(seen).toEqual([1])
  })

  it('returns pending rather than failed when it times out', async () => {
    // The work may still be running server-side; claiming failure would be a lie
    // and would send the FE down the fallback path for no reason.
    get.mockResolvedValue(reply(202, { status: 'pending' }))
    const res = await differenceService.getWhenReady('F', {}, {
      intervalMs: 5, timeoutMs: 1,
    })
    expect(res.status).toBe('pending')
  })

  it('aborts when signalled', async () => {
    get.mockResolvedValue(reply(202, { status: 'pending' }))
    const controller = new AbortController()
    controller.abort()
    await expect(
      differenceService.getWhenReady('F', {}, { signal: controller.signal }),
    ).rejects.toThrow()
  })
})

describe('child selection', () => {
  it('returns page children in unit order', async () => {
    get.mockResolvedValue(reply(200, {
      ...READY,
      children: [READY.children[1], READY.children[0]],   // out of order
    }))
    const res = await differenceService.get('F')
    expect(differenceService.pageChildren(res).map((c) => c.index)).toEqual([0, 1])
  })

  it('recognises a 3D result and finds its model + metamodel', async () => {
    get.mockResolvedValue(reply(200, {
      status: 'ready',
      manifest: { ...READY.manifest, mode: 'xkt' },
      children: [
        { index: 0, name: 'diff.k.model.000.xkt', uid: 'm0', mode: 'xkt', kind: 'model' },
        { index: 1, name: 'diff.k.metamodel.001.json', uid: 'm1', mode: 'xkt', kind: 'metamodel' },
      ],
    }))
    const res = await differenceService.get('F')
    expect(res.is3d).toBe(true)
    expect(differenceService.modelChild(res)?.uid).toBe('m0')
    expect(differenceService.metamodelChild(res)?.uid).toBe('m1')
    expect(differenceService.pageChildren(res)).toEqual([])
  })
})

describe('reconcile', () => {
  it('posts a max_files bound when given one', async () => {
    post.mockResolvedValue({ data: { status: 'started', tenant: 'default' } })
    await differenceService.reconcile(25)
    expect(post).toHaveBeenCalledWith('/diff/reconcile', { max_files: 25 })
  })

  it('posts an empty body otherwise', async () => {
    post.mockResolvedValue({ data: { status: 'started', tenant: 'default' } })
    await differenceService.reconcile()
    expect(post).toHaveBeenCalledWith('/diff/reconcile', {})
  })
})
