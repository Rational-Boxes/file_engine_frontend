import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/services/csaiClient', () => ({
  default: { get },
  errorMessage: (e: unknown) => String((e as { message?: string })?.message ?? e),
}))

import { onlyofficeService } from '@/services/onlyofficeService'

describe('onlyofficeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches + maps the signed editor config', async () => {
    get.mockResolvedValue({
      data: {
        config: {
          documentType: 'word',
          document: { fileType: 'docx', key: 'k', title: 'Report.docx', url: 'https://csai/dl?token=x' },
          editorConfig: { mode: 'edit', callbackUrl: 'https://csai/cb?token=y', user: { id: 'a', name: 'A' } },
          token: 'signed.jwt.here',
        },
        docserver_url: 'https://docs.example/',
      },
    })
    const bundle = await onlyofficeService.getEditorConfig('file uid/1')
    // uid is URL-encoded in the path
    expect(get).toHaveBeenCalledWith('/v1/onlyoffice/config/file%20uid%2F1')
    expect(bundle.docserverUrl).toBe('https://docs.example/')
    expect(bundle.config.documentType).toBe('word')
    expect(bundle.config.document.key).toBe('k')
    expect(bundle.config.token).toBe('signed.jwt.here')
  })

  it('propagates errors (e.g. 404 when editing is disabled)', async () => {
    get.mockRejectedValue(new Error('Request failed with status code 404'))
    await expect(onlyofficeService.getEditorConfig('f1')).rejects.toThrow(/404/)
  })
})
