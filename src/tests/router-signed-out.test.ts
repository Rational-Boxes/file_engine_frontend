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

/**
 * Signing out must REACH the sign-in view.
 *
 * Reported from production a second time, after LoginView had already been
 * taught to end the sign-in origin's own session on `?signedout=1`: sign out of
 * a tenant and you still land on the dashboard, signed in.
 *
 * The view was never the problem — the ROUTER GUARD is. It runs before any view
 * mounts, and it treated `/login` with a live token as "nothing to log into
 * here" and redirected to the dashboard, so LoginView's sign-out handling never
 * got to run. LoginSignedOut.test.ts could not catch it: it mocks vue-router
 * away entirely and mounts the view directly, which is the one arrangement in
 * which the guard does not exist.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import router, { authGuard } from '@/router'
import { useAuthStore } from '@/stores/auth'
import {
  markServingFromLoginOrigin,
  resetServingFromLoginOrigin,
} from '@/utils/loginOriginServe'
import { isLoginOrigin } from '@/utils/tenantHost'

vi.mock('@/utils/tenantHost', async () => {
  const actual = await vi.importActual<object>('@/utils/tenantHost')
  return { ...actual, isLoginOrigin: vi.fn(() => false) }
})
const onLoginOrigin = (yes: boolean) =>
  vi.mocked(isLoginOrigin).mockReturnValue(yes)

// resolve() matches without navigating, so no lazy view is loaded and the
// policy is examined on its own — the same trick as router-public-routes.
// Its `name` is nullable where a guard's is not, and that lone field is the only
// difference; path, query and meta — all the policy reads — come through as-is.
const at = (path: string) => {
  const r = router.resolve(path)
  return authGuard({ ...r, name: r.name ?? undefined })
}

function signedIn() {
  const auth = useAuthStore()
  // The sign-in origin's OWN token, minted when the user signed in here. The
  // tenant origin cannot clear it: localStorage is origin-scoped.
  auth.token = 'the-sign-in-origins-own-token'
  return auth
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetServingFromLoginOrigin()
  onLoginOrigin(false)
})

describe('arriving at /login after an explicit sign-out', () => {
  it('lets the navigation through so the sign-in view can end the session', () => {
    signedIn()
    // undefined = "no opinion, carry on" — LoginView mounts and logs out.
    expect(at('/login?signedout=1')).toBeUndefined()
  })

  it('does not hand the user back to the dashboard', () => {
    signedIn()
    expect(at('/login?signedout=1')).not.toMatchObject({ path: '/dashboard' })
  })

  it('holds even when a stale redirect is riding along', () => {
    // ?redirect= survives in a bookmark or a bounce; sign-out still wins.
    signedIn()
    expect(at('/login?signedout=1&redirect=/files')).toBeUndefined()
  })
})

describe('arriving at /login any other way', () => {
  it('still forwards a live session on, rather than showing a pointless form', () => {
    // The second-tab case. Unchanged behaviour, and the reason the guard exists.
    signedIn()
    expect(at('/login')).toMatchObject({ path: '/dashboard' })
  })

  it('still honours a redirect the guard itself stashed', () => {
    signedIn()
    expect(at('/login?redirect=/files')).toMatchObject({ path: '/files' })
  })

  it('shows the form when there is no session at all', () => {
    expect(at('/login')).toBeUndefined()
  })
})

/**
 * The sign-in origin is not a tenant. Arriving there already signed in has to
 * end in a workspace, and the only code that knows how to reach one — probe the
 * subdomain, hand off, or fall back to X-Tenant here — lives in LoginView. The
 * guard's job is to route to it rather than serve a dashboard from an origin
 * that belongs to no tenant.
 */
describe('an authenticated visitor to the sign-in origin', () => {
  beforeEach(() => {
    onLoginOrigin(true)
    signedIn()
  })

  it('is sent to the login view to be handed off, not served a dashboard', () => {
    expect(at('/dashboard')).toMatchObject({ path: '/login' })
  })

  it('keeps the deep link, so the hand-off can land on it', () => {
    // handOffToWorkspace reads route.query.next and carries it to the tenant.
    expect(at('/files?file=abc')).toMatchObject({
      path: '/login',
      query: { next: '/files?file=abc' },
    })
  })

  it('stops once the hand-off has fallen back to serving from here', () => {
    // Otherwise the fallback's own navigation is bounced straight back and the
    // two spin: guard -> /login -> fallback -> /dashboard -> guard.
    markServingFromLoginOrigin()
    expect(at('/dashboard')).toBeUndefined()
  })

  it('leaves public routes alone', () => {
    // A share link or an invitation must open where it was opened; forwarding
    // one to a workspace answers a question the visitor did not ask.
    expect(at('/s/some-token')).toBeUndefined()
    expect(at('/sso?code=abc')).toBeUndefined()
    expect(at('/oauth/callback')).toBeUndefined()
  })
})

/**
 * The fallback that serves a workspace FROM the sign-in origin is a decision
 * about one session — that user, that probe, that moment. Carried into the next
 * one it silently skips the hand-off, and the next person to sign in is left on
 * `login.<domain>/dashboard`: an origin that is no tenant's, reached without the
 * subdomain ever being probed for them.
 */
describe('serving from the sign-in origin does not outlive the session', () => {
  it('puts the next session back through the login view, not straight to a dashboard', async () => {
    onLoginOrigin(true)
    const auth = signedIn()
    markServingFromLoginOrigin()
    expect(at('/dashboard')).toBeUndefined() // this session is served from here

    await auth.logout()
    auth.token = 'a-new-session' // whoever signs in next, on the same page

    expect(at('/dashboard')).toMatchObject({ path: '/login' })
  })
})

describe('a tenant origin', () => {
  it('serves its own workspace rather than routing to a sign-in page', () => {
    // The forward is specific to the origin that has no tenant. Everywhere else
    // the dashboard is exactly the right answer.
    onLoginOrigin(false)
    signedIn()
    expect(at('/dashboard')).toBeUndefined()
  })
})

/**
 * A guard that redirects must SETTLE.
 *
 * The tests above each evaluate the guard once, which is why they all passed
 * while the sign-in origin span: two rules pointed at each other. Authenticated
 * on that origin, /dashboard was sent to /login to be handed off, and /login was
 * sent back to /dashboard as "already signed in" — a cycle the browser walks
 * until it locks up. Nothing that checks a single hop can see that; only
 * following the chain can.
 */
function settle(start: string, max = 12) {
    const seen: string[] = []
    let path = start
    for (let i = 0; i < max; i++) {
        seen.push(path)
        const r = at(path)
        // undefined/false = the guard is done; the navigation proceeds.
        if (r === undefined || r === false) return { path, hops: seen }
        const next = r as { path: string; query?: Record<string, string> }
        const q = next.query
            ? '?' + Object.entries(next.query).map(([k, v]) => `${k}=${v}`).join('&')
            : ''
        path = next.path + q
    }
    return { path: 'DID_NOT_SETTLE', hops: seen }
}

describe('the guard settles instead of cycling', () => {
    it('lands somewhere when an authenticated visitor asks the sign-in origin for a workspace', () => {
        onLoginOrigin(true)
        signedIn()
        const { path, hops } = settle('/dashboard')
        expect({ path, hops }).toMatchObject({ path: expect.not.stringContaining('DID_NOT_SETTLE') })
    })

    it('settles on the login view, which is what owns the hand-off', () => {
        onLoginOrigin(true)
        signedIn()
        expect(settle('/dashboard').path).toContain('/login')
    })

    it('settles from a deep link too', () => {
        onLoginOrigin(true)
        signedIn()
        expect(settle('/files?file=abc').path).not.toBe('DID_NOT_SETTLE')
    })

    it('still settles on a tenant origin', () => {
        onLoginOrigin(false)
        signedIn()
        expect(settle('/login').path).toBe('/dashboard')
    })
})
