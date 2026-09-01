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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  brandingService,
  normalise,
  safeColour,
  safeIconUrl,
  DEFAULT_BRANDING,
} from '@/services/brandingService'

const json = (body: unknown) =>
  ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  }) as unknown as Response

describe('safeColour', () => {
  it('accepts the notations a palette is actually written in', () => {
    for (const c of ['#fff', '#8b1d3f', '#8b1d3fcc', 'rebeccapurple', 'rgb(1, 2, 3)',
                     'rgba(1,2,3,.5)', 'hsl(210 40% 12%)']) {
      expect(safeColour(c), c).toBe(c)
    }
  })

  it('rejects anything that could close the rule and open another', () => {
    // These values are interpolated into a stylesheet. A branding file is
    // deployment-controlled, but "mostly trusted" is not a reason to let a
    // string end the declaration and write its own rules.
    expect(safeColour('red; } html { display: none')).toBe('')
    expect(safeColour('url(https://evil.example/x)')).toBe('')
    expect(safeColour('#fff }')).toBe('')
    expect(safeColour('expression(alert(1))')).toBe('')
    expect(safeColour('a'.repeat(200))).toBe('')
    expect(safeColour(undefined)).toBe('')
  })
})

describe('safeIconUrl', () => {
  it('takes same-origin paths and inline images', () => {
    expect(safeIconUrl('/brand/logo.svg')).toBe('/brand/logo.svg')
    expect(safeIconUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
  })

  it('refuses to fetch the mark from somebody else', () => {
    // An off-site logo is a request to a third party on every page load — a
    // privacy leak a white-label customer did not ask for.
    expect(safeIconUrl('https://cdn.example.com/logo.png')).toBe('')
    expect(safeIconUrl('//cdn.example.com/logo.png')).toBe('')
    expect(safeIconUrl('javascript:alert(1)')).toBe('')
    expect(safeIconUrl('data:text/html,<script>')).toBe('')
  })
})

describe('normalise', () => {
  it('keeps only the palette keys it knows, and only valid colours', () => {
    const b = normalise({
      appName: 'Acme Docs',
      light: { primary: '#8b1d3f', danger: 'nonsense; }', bogusKey: '#fff' },
      dark: { bg: '#120c10' },
    })
    expect(b.light).toEqual({ primary: '#8b1d3f' })
    expect(b.dark).toEqual({ bg: '#120c10' })
  })

  it('lets the tab title follow the app name unless it is set separately', () => {
    expect(normalise({ appName: 'Acme Docs' }).title).toBe('Acme Docs')
    expect(normalise({ appName: 'Acme Docs', title: 'Acme — Documents' }).title)
      .toBe('Acme — Documents')
  })

  it('falls back to the product name rather than rendering an empty header', () => {
    expect(normalise({ appName: '   ' }).appName).toBe('FileEngine')
    expect(normalise(null).appName).toBe('FileEngine')
    // The literal payload an unconfigured Ansible deployment serves: the role
    // writes `{}` rather than omitting the file, because a bind-mount with no
    // source makes podman create a DIRECTORY at the target.
    expect(normalise({})).toEqual(DEFAULT_BRANDING)
  })
})

describe('brandingService.load', () => {
  beforeEach(() => {
    brandingService.reset()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the deployment file when there is one', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ appName: 'Acme Docs' }))
    expect((await brandingService.load()).appName).toBe('Acme Docs')
  })

  it('treats the SPA fallback page as no branding, not as branding', async () => {
    // nginx answers an unknown path with index.html and HTTP 200, so a
    // deployment with no branding file gets a 200 whose body is markup.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      json: () => Promise.resolve({ appName: 'nope' }),
    } as unknown as Response)
    expect(await brandingService.load()).toEqual(DEFAULT_BRANDING)
  })

  it('ships the stock product when the file is absent or the fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, headers: { get: () => null } } as unknown as Response)
    expect(await brandingService.load()).toEqual(DEFAULT_BRANDING)

    brandingService.reset()
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    expect(await brandingService.load()).toEqual(DEFAULT_BRANDING)
  })

  it('fetches once however many components ask', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ appName: 'Acme Docs' }))
    await Promise.all([brandingService.load(), brandingService.load(), brandingService.load()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
