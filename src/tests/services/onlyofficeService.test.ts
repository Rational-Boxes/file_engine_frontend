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
