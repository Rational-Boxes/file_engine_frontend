import { describe, it, expect, beforeEach, vi } from 'vitest'

const { put } = vi.hoisted(() => ({ put: vi.fn() }))
vi.mock('@/services/apiClient', () => ({ default: { put }, ROOT_UID: '0', errorMessage: (e: unknown) => String(e) }))

const { findChildByName, touch } = vi.hoisted(() => ({ findChildByName: vi.fn(), touch: vi.fn() }))
vi.mock('@/services/fileService', () => ({ fileService: { findChildByName, touch } }))

import { uploadService } from '@/services/uploadService'

describe('uploadService (replace-on-name = new version)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    put.mockResolvedValue({})
  })

  it('adds a new version to an existing same-named file (no touch, no duplicate)', async () => {
    findChildByName.mockResolvedValue('existing-uid')
    const file = new File(['data'], 'report.txt')
    const uid = await uploadService.upload('parent', file)
    expect(findChildByName).toHaveBeenCalledWith('parent', 'report.txt')
    expect(touch).not.toHaveBeenCalled()
    expect(uid).toBe('existing-uid')
    expect(put).toHaveBeenCalledWith('/v1/files/existing-uid/content', file, expect.anything())
  })

  it('creates a new file (touch) when no same-named file exists', async () => {
    findChildByName.mockResolvedValue(null)
    touch.mockResolvedValue('new-uid')
    const file = new File(['data'], 'fresh.txt')
    const uid = await uploadService.upload('parent', file)
    expect(touch).toHaveBeenCalledWith('parent', 'fresh.txt')
    expect(uid).toBe('new-uid')
    expect(put).toHaveBeenCalledWith('/v1/files/new-uid/content', file, expect.anything())
  })
})
