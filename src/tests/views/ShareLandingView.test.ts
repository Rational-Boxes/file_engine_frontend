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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const svc = vi.hoisted(() => ({
  peek: vi.fn(), identify: vi.fn(), verify: vi.fn(),
  openSession: vi.fn(), manifest: vi.fn(), contentUrl: vi.fn(), drop: vi.fn(),
}))

vi.mock('@/services/sharePublicService', async () => {
  const actual = await vi.importActual<object>('@/services/sharePublicService')
  return { ...actual, sharePublicService: svc, default: svc }
})

const route = { params: { token: 'link-1.s3cr3t' } }
vi.mock('vue-router', () => ({ useRoute: () => route }))

import ShareLandingView from '@/views/ShareLandingView.vue'

function peekPayload(over: Record<string, unknown> = {}) {
  return {
    kind: 0, expires_at: '2026-09-01T00:00:00Z', uses_remaining: 3,
    verification_required: true, note: 'Q3 drawings', size_bytes: 2_500_000, ...over,
  }
}

function mountLanding() {
  return mount(ShareLandingView)
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.values(svc).forEach((f) => f.mockReset())
  svc.peek.mockResolvedValue(peekPayload())
  svc.identify.mockResolvedValue({ expires_in_seconds: 600 })
  svc.verify.mockResolvedValue({ ok: true, recipient_token: 'rt-1' })
  svc.openSession.mockResolvedValue({ redemption_uid: 'red-1', expires_at: '', kind: 0 })
  svc.manifest.mockResolvedValue([])
  svc.contentUrl.mockReturnValue('/share/v1/public/link-1/content?k=s3cr3t&redemption=red-1')
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => { vi.useRealTimers() })

/** Drive to the code-entry screen. */
async function toCodeScreen(w: ReturnType<typeof mountLanding>) {
  await flushPromises()
  await w.find('input[type="email"]').setValue('priya@example.com')
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('ShareLandingView', () => {
  it('asks for an address before showing anything about the payload', async () => {
    // The note is on the peek response, but a stranger holding the URL must not
    // learn the file name or size before proving they hold the mailbox.
    const w = mountLanding()
    await flushPromises()
    expect(w.find('input[type="email"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Q3 drawings')
    expect(w.text()).not.toContain('2.4 MB')
  })

  it('renders every dead-link cause with byte-identical copy', async () => {
    // The wording lists the possibilities on purpose — naming them all reveals
    // nothing, whereas picking one out ("exhausted") tells someone probing URLs
    // that they hold a real link. So the property is sameness, not silence.
    const texts: string[] = []
    for (const cause of ['404 unknown', '410 revoked', '410 expired', '429 exhausted']) {
      svc.peek.mockRejectedValue(new Error(cause))
      const w = mountLanding()
      await flushPromises()
      texts.push(w.text())
    }
    expect(texts[0]).toMatch(/isn't available/i)
    expect(new Set(texts).size).toBe(1)
  })

  it('says nothing about whether the address was on the list', async () => {
    const w = mountLanding()
    await toCodeScreen(w)
    expect(w.text()).toMatch(/if that address is on this link/i)
  })

  it('shows the same screen when the identify call fails', async () => {
    // A network failure must not become the oracle the uniform response denies:
    // "unlisted" and "server hiccup" have to look identical from here.
    svc.identify.mockRejectedValue(new Error('boom'))
    const w = mountLanding()
    await toCodeScreen(w)
    expect(w.text()).toMatch(/if that address is on this link/i)
    expect(w.find('input[autocomplete="one-time-code"]').exists()).toBe(true)
  })

  it('counts the code down to its expiry', async () => {
    const w = mountLanding()
    await toCodeScreen(w)
    expect(w.text()).toContain('10:00')
    vi.advanceTimersByTime(61_000)
    await flushPromises()
    expect(w.text()).toContain('8:59')
  })

  it('tells them to send another once the code has expired', async () => {
    const w = mountLanding()
    await toCodeScreen(w)
    vi.advanceTimersByTime(600_000)
    await flushPromises()
    expect(w.text()).toMatch(/has expired/i)
  })

  it('holds the resend closed briefly, then opens it', async () => {
    const w = mountLanding()
    await toCodeScreen(w)
    const resend = () => w.findAll('button').find((b) => /send another/i.test(b.text()))!
    expect(resend().attributes('disabled')).toBeDefined()
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(resend().attributes('disabled')).toBeUndefined()
  })

  it('warns to use the newest email after a resend', async () => {
    // A delayed first email is exactly the situation that produces a resend, so
    // the older code is the one they will reach for — and it no longer works.
    const w = mountLanding()
    await toCodeScreen(w)
    expect(w.text()).not.toMatch(/newest email/i)
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    await w.findAll('button').find((b) => /send another/i.test(b.text()))!.trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/newest email/i)
    expect(svc.identify).toHaveBeenCalledTimes(2)
  })

  it('distinguishes a wrong code from a lockout', async () => {
    // "Wait 15 minutes" and "this is broken" must not read the same, or a
    // locked-out recipient simply gives up.
    svc.verify.mockResolvedValue({ ok: false, locked: false })
    const w = mountLanding()
    await toCodeScreen(w)
    await w.find('input[autocomplete="one-time-code"]').setValue('000000')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toMatch(/was not right/i)

    svc.verify.mockResolvedValue({ ok: false, locked: true })
    await w.find('input[autocomplete="one-time-code"]').setValue('000001')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toMatch(/15 minutes/i)
  })

  it('keeps the recipient token in sessionStorage, never localStorage', async () => {
    // It is a bearer credential on the SPA's own origin. Left in localStorage it
    // would outlive the visit on a shared machine.
    const w = mountLanding()
    await toCodeScreen(w)
    await w.find('input[autocomplete="one-time-code"]').setValue('123456')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sessionStorage.getItem('share.recipient.link-1')).toBe('rt-1')
    expect(localStorage.length).toBe(0)
  })

  it('skips the challenge when a live token is already in this tab', async () => {
    // A second download inside the window should not cost another email.
    sessionStorage.setItem('share.recipient.link-1', 'rt-1')
    const w = mountLanding()
    await flushPromises()
    expect(svc.identify).not.toHaveBeenCalled()
    expect(w.text()).toContain('Q3 drawings')
  })

  it('falls back to the challenge when a stored token has gone stale', async () => {
    sessionStorage.setItem('share.recipient.link-1', 'stale')
    svc.openSession.mockRejectedValue(new Error('401'))
    mountLanding()
    await flushPromises()
    expect(sessionStorage.getItem('share.recipient.link-1')).toBeNull()
  })

  it('hands the payload over as a plain navigation, not an XHR blob', async () => {
    // Pulling gigabytes through XHR to hand them back as a blob would defeat the
    // streaming the whole stack was built for.
    const w = mountLanding()
    await toCodeScreen(w)
    await w.find('input[autocomplete="one-time-code"]').setValue('123456')
    await w.find('form').trigger('submit')
    await flushPromises()
    const a = w.find('a[download]')
    expect(a.exists()).toBe(true)
    expect(a.attributes('href')).toContain('redemption=red-1')
  })

  it('describes a folder by its member count and archive size', async () => {
    svc.peek.mockResolvedValue(peekPayload({ kind: 2, member_count: 12, archive_bytes: 5_000_000 }))
    svc.manifest.mockResolvedValue([{ path: 'a/b.pdf', size_bytes: 10 }])
    const w = mountLanding()
    await toCodeScreen(w)
    await w.find('input[autocomplete="one-time-code"]').setValue('123456')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('12 files')
    expect(w.text()).toMatch(/4\.8 MB/)
    expect(w.text()).toContain('a/b.pdf')
  })

  it('reports a dropped file under the name it was actually stored as', async () => {
    // A collision renames it server-side; "did my file arrive?" otherwise has
    // no answer the sender can check.
    svc.peek.mockResolvedValue(peekPayload({ kind: 1, files_remaining: 5 }))
    svc.drop.mockResolvedValue({ stored_name: 'plans (1).pdf', size_bytes: 4 })
    const w = mountLanding()
    await toCodeScreen(w)
    await w.find('input[autocomplete="one-time-code"]').setValue('123456')
    await w.find('form').trigger('submit')
    await flushPromises()

    const input = w.find('input[type="file"]')
    const file = new File(['abcd'], 'plans.pdf')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(svc.drop).toHaveBeenCalled()
    expect(w.text()).toContain('plans (1).pdf')
    // The remaining budget moves as files land, so it is re-read rather than
    // decremented locally.
    expect(svc.peek).toHaveBeenCalledTimes(2)
  })

  it('treats a malformed token as a dead link without calling the service', async () => {
    route.params.token = 'no-dot-here'
    try {
      const w = mountLanding()
      await flushPromises()
      expect(svc.peek).not.toHaveBeenCalled()
      expect(w.text()).toMatch(/isn't available/i)
    } finally {
      route.params.token = 'link-1.s3cr3t'
    }
  })
})
