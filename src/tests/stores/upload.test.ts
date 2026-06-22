import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/apiClient', () => ({
  errorMessage: (e: unknown) => String(e),
  default: {},
}))

vi.mock('@/services/uploadService', () => ({
  uploadService: { upload: vi.fn() },
}))

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/stores/files', () => ({
  useFileStore: () => ({ load }),
}))

import { useUploadStore } from '@/stores/upload'
import { uploadService } from '@/services/uploadService'

describe('upload store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('uploads each file, marks completed, and refreshes the listing', async () => {
    ;(uploadService.upload as any).mockResolvedValue('uid')
    const store = useUploadStore()
    const f = new File(['x'], 'a.txt')
    await store.uploadFiles('parent', [f])
    expect(uploadService.upload).toHaveBeenCalledWith('parent', f, expect.any(Function))
    expect(store.queue[0].status).toBe('completed')
    expect(store.queue[0].progress).toBe(100)
    expect(load).toHaveBeenCalled()
  })

  it('marks an upload failed on error', async () => {
    ;(uploadService.upload as any).mockRejectedValue(new Error('boom'))
    const store = useUploadStore()
    await store.uploadFiles('parent', [new File(['x'], 'b.txt')])
    expect(store.queue[0].status).toBe('failed')
    expect(store.queue[0].error).toBeTruthy()
  })

  it('reports overall progress across the batch', async () => {
    ;(uploadService.upload as any).mockResolvedValue('uid')
    const store = useUploadStore()
    await store.uploadFiles('parent', [new File(['x'], 'a'), new File(['y'], 'b')])
    expect(store.queue).toHaveLength(2)
    expect(store.overallProgress).toBe(100) // both completed
  })

  it('clearFinished keeps only in-progress items', async () => {
    ;(uploadService.upload as any).mockResolvedValue('uid')
    const store = useUploadStore()
    await store.uploadFiles('parent', [new File(['x'], 'c.txt')])
    store.clearFinished()
    expect(store.queue).toHaveLength(0)
  })
})
