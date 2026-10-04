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

// MS7 — the landing page's media branch (MEDIA_SHARE.md §10).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MediaLanding from '@/components/MediaLanding.vue'

const PEEK = {
  kind: 'video', mode: 'open', title: 'Site walkthrough', duration_ms: 60000,
  poster: '/media/v1/L1/poster', state: 'ready', progress_pct: null, requires: 'none',
  allow_download: false, tracking: true,
  sources: [{ label: '720p', quality: 'hd', default: true, mime: 'video/webm', bytes: 1,
              url: '/media/v1/L1/content?q=hd' }],
}
const SESSION = { session: 'TOK', expires_at: '', title: 'Site walkthrough', duration_ms: 60000,
  tracking: true, beacon: '/media/v1/L1/playback?t=TOK',
  sources: [{ ...PEEK.sources[0], url: '/media/v1/L1/content?q=hd&t=TOK' }] }

let calls: Array<{ url: string; init?: RequestInit }>
let replies: Record<string, () => Response>

function respond(status: number, body: unknown) {
  return () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  calls = []
  replies = { peek: respond(200, PEEK), session: respond(200, SESSION), claim: respond(200, SESSION) }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const key = url.includes('/claim') ? 'claim' : url.includes('/session') ? 'session'
      : url.includes('/identify') ? 'identify' : url.includes('/verify') ? 'verify' : 'peek'
    return (replies[key] ?? respond(404, {}))()
  }))
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably')
})

async function mountIt(base = 'https://acme-media.example.com') {
  const w = mount(MediaLanding, { props: { linkUid: 'L1', secret: 'S', mediaBase: base } })
  await flushPromises()
  return w
}

describe('MediaLanding', () => {
  it('opening the page opens no session — a view starts only on play', async () => {
    const w = await mountIt()
    expect(calls.map((c) => c.url)).toEqual(['https://acme-media.example.com/media/v1/L1?k=S'])
    expect(w.find('[data-test="player"]').exists()).toBe(false)
    await w.get('[data-test="play"]').trigger('click')
    await flushPromises()
    expect(calls[1].url).toBe('https://acme-media.example.com/media/v1/L1/session?k=S')
    const player = w.get('[data-test="media"]')
    expect(player.attributes('src')).toBe('https://acme-media.example.com/media/v1/L1/content?q=hd&t=TOK')
  })

  it('sends no credentials and no bearer to the door', async () => {
    const w = await mountIt()
    await w.get('[data-test="play"]').trigger('click')
    await flushPromises()
    for (const c of calls) {
      expect(c.init?.credentials).toBe('omit')
      expect(JSON.stringify(c.init?.headers ?? {})).not.toMatch(/Authorization/i)
    }
  })

  it('claimed: asks for an address, states the consent above Watch, and records which wording', async () => {
    replies.peek = respond(200, { ...PEEK, mode: 'claimed', requires: 'email' })
    const w = await mountIt()
    expect(w.find('[data-test="play"]').exists()).toBe(false)
    const form = w.get('[data-test="claim"]')
    // A notice, not a box: a pre-ticked checkbox is not consent, and an unticked
    // one was an extra click the owner did not want. The click on Watch is it.
    expect(form.get('[data-test="consent"]').text())
      .toMatch(/^By clicking Watch, you agree that the sender can see whether and how much of this you watch\.$/)
    expect(form.find('input[type="checkbox"]').exists()).toBe(false)
    expect(form.get('button').attributes('disabled')).toBeDefined()     // an address first
    await form.get('input[type="email"]').setValue('viewer@example.com')
    expect(form.get('button').attributes('disabled')).toBeUndefined()   // and nothing else
    await form.trigger('submit')
    await flushPromises()
    const body = JSON.parse(String(calls[1].init?.body))
    expect(body).toEqual({ email: 'viewer@example.com', consent: true, consent_text_id: 'media-v2' })
    expect(w.find('[data-test="player"]').exists()).toBe(true)
  })

  it('verified: code first, then the session with the recipient token', async () => {
    replies.peek = respond(200, { ...PEEK, mode: 'verified', requires: 'code' })
    replies.identify = respond(200, { expires_in_seconds: 600 })
    replies.verify = respond(200, { ok: true, recipient_token: 'RT' })
    const w = await mountIt()
    await w.get('[data-test="identify"] input').setValue('v@example.com')
    await w.get('[data-test="identify"]').trigger('submit')
    await flushPromises()
    await w.get('[data-test="code"] input').setValue('123456')
    await w.get('[data-test="code"]').trigger('submit')
    await flushPromises()
    const s = calls.find((c) => c.url.includes('/session'))!
    expect((s.init?.headers as Record<string, string>)['X-Recipient-Token']).toBe('RT')
    expect(w.find('[data-test="player"]').exists()).toBe(true)
  })

  it('a wrong code says so and plays nothing', async () => {
    replies.peek = respond(200, { ...PEEK, mode: 'verified', requires: 'code' })
    replies.identify = respond(200, { expires_in_seconds: 600 })
    replies.verify = respond(401, { ok: false, locked: false })
    const w = await mountIt()
    await w.get('[data-test="identify"] input').setValue('v@example.com')
    await w.get('[data-test="identify"]').trigger('submit')
    await flushPromises()
    await w.get('[data-test="code"] input').setValue('000000')
    await w.get('[data-test="code"]').trigger('submit')
    await flushPromises()
    expect(w.text()).toMatch(/That code was not right/)
    expect(w.find('[data-test="player"]').exists()).toBe(false)
  })

  it('says it is still being prepared rather than showing a broken player', async () => {
    replies.peek = respond(200, { ...PEEK, state: 'preparing', sources: [] })
    const w = await mountIt()
    expect(w.get('[data-test="preparing"]').text()).toMatch(/still being prepared/)
    expect(w.find('[data-test="play"]').exists()).toBe(false)
    w.unmount()
  })

  it('a popular open link explains itself', async () => {
    replies.peek = respond(503, { message: 'This video is temporarily unavailable because it has been very popular.' })
    const w = await mountIt()
    expect(w.get('[data-test="popular"]').text()).toMatch(/very popular/)
  })

  it('a dead link is the uniform "not available"', async () => {
    replies.peek = respond(404, { error: 'not_found' })
    expect((await mountIt()).text()).toMatch(/isn't available/)
  })

  it('offers the download only where the creator allowed it', async () => {
    let w = await mountIt()
    await w.get('[data-test="play"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="download"]').exists()).toBe(false)
    replies.peek = respond(200, { ...PEEK, allow_download: true })
    w = await mountIt()
    await w.get('[data-test="play"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-test="download"]').attributes('href'))
      .toBe('https://acme-media.example.com/media/v1/L1/download?t=TOK')
  })

  it('wires the beacon only when tracking is on', async () => {
    replies.session = respond(200, { ...SESSION, tracking: false, beacon: undefined })
    replies.peek = respond(200, { ...PEEK, tracking: false })
    const w = await mountIt()
    expect(w.text()).toMatch(/does not see how much of this you watch/)
  })

  it('falls back to the same origin when no media host is configured (dev)', async () => {
    await mountIt('')
    expect(calls[0].url).toBe('/media/v1/L1?k=S')
  })
})
