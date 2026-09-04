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
 */

let servingHere = false

/** The hand-off fell back: this origin is serving the workspace. */
export function markServingFromLoginOrigin(): void {
  servingHere = true
}

/** Has the fallback already been taken in this page lifetime? */
export function servingFromLoginOrigin(): boolean {
  return servingHere
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
  servingHere = false
}
