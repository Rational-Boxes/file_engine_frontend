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
 * "We already tried to forward, and we are serving the workspace from the
 * sign-in origin instead."
 *
 * The sign-in origin is not a tenant and has no workspace of its own, so the
 * router sends an authenticated visitor there back through the login view,
 * which probes the tenant's subdomain and hands the session over. When the
 * probe says the subdomain is not reachable, the login view falls back to
 * running the app right here with the tenant carried in `X-Tenant` — and
 * navigates to the workspace to do it.
 *
 * That navigation is the one the router would otherwise bounce straight back,
 * which is a loop. This flag is how the fallback says "the decision has been
 * made, stop asking".
 *
 * DELIBERATELY NOT PERSISTED. It lives for one page lifetime, so a reload
 * re-probes: a subdomain that was down when the user signed in, and is up
 * again now, starts forwarding without anyone having to clear anything. The
 * cost of forgetting is one extra hop through the login view, which the probe's
 * own short-lived negative cache makes cheap.
 *
 * Reactive, and it records WHICH workspace address could not be used, because
 * the fallback must not be silent: on 2026-10-01 and again on 2026-10-04 a
 * router-level web filter blocked the tenant subdomain, the app quietly ran
 * from here, and the only symptoms were a 1 MB upload limit and the Share tab
 * (and every other optional service) missing — which read as a broken deploy.
 * LoginOriginNotice reads this to say what happened and to offer a retry.
 */

import { reactive, readonly } from 'vue'

const state = reactive({ serving: false, origin: '' })

/** Read-only view for the notice: are we serving here, and instead of where? */
export const loginOriginServing = readonly(state)

/**
 * The hand-off fell back: this origin is serving the workspace.
 *
 * @param origin the tenant origin that could not be used, e.g.
 *               `https://default.example.com` — shown to the user.
 */
export function markServingFromLoginOrigin(origin = ''): void {
  state.serving = true
  state.origin = origin
}

/** Has the fallback already been taken in this page lifetime? */
export function servingFromLoginOrigin(): boolean {
  return state.serving
}

/**
 * Forget the decision.
 *
 * Called on sign-out (and by tests). The fallback was chosen for a SESSION —
 * that user, that probe, that moment — and leaving it set means the next person
 * to sign in on this page is served the workspace from the sign-in origin
 * without the subdomain ever being probed for them: signed in, on
 * `login.<domain>/dashboard`, an origin that is nobody's workspace. Clearing it
 * puts the next session back through the ordinary route — probe, hand off, and
 * only then fall back.
 */
export function resetServingFromLoginOrigin(): void {
  state.serving = false
  state.origin = ''
}
