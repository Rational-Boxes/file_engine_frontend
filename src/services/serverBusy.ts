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
 * Handling for a server that is temporarily out of capacity.
 *
 * The C++ services shed load rather than falling over: past their worker pool
 * and accept queue they answer **503 with `Retry-After`** instead of dropping
 * the connection. That is deliberately a *temporary* condition — the whole point
 * of shedding is that the backlog clears in moments — so the front end should
 * say so and, where it safely can, simply try again rather than showing the user
 * an error for something that is about to fix itself.
 *
 * Two things happen on a 503:
 *
 *   1. A banner appears saying the server is busy and will free up shortly. It
 *      clears itself; nothing has to dismiss it, because by the time a user
 *      reads it the condition has usually passed.
 *
 *   2. **Safe requests are retried automatically**, honouring `Retry-After`.
 *      Only GET/HEAD/OPTIONS: retrying a POST or PUT could create a second file
 *      or write a duplicate version, and a silent duplicate is worse than an
 *      error message. Unsafe requests surface to the caller, which is why the
 *      banner matters — it tells the user the failure was transient and worth
 *      repeating.
 *
 * Deliberately a plain module rather than a Pinia store: this is driven from
 * axios interceptors, which are not components, and a store would mean depending
 * on an active Pinia at whatever moment a request happens to fail.
 */
import { readonly, ref } from 'vue'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'

/** How many times a safe request is retried before giving up. */
const MAX_RETRIES = 2

/** Cap on how long we will honour a `Retry-After` before just failing. */
const MAX_RETRY_DELAY_MS = 5_000

/** How long the banner lingers past the last 503, so it does not flicker. */
const NOTICE_LINGER_MS = 4_000

const busy = ref(false)
let clearTimer: ReturnType<typeof setTimeout> | undefined

/** True while the server is shedding load. Read-only to everything but this file. */
export const isServerBusy = readonly(busy)

/**
 * Record that the server reported itself out of capacity.
 *
 * Exported for tests and for any non-axios caller (a fetch-based download, say)
 * that sees a 503 of its own.
 */
export function markServerBusy(retryAfterSeconds = 1): void {
  busy.value = true
  if (clearTimer) clearTimeout(clearTimer)
  // Hold the notice a little past the retry window: clearing it the instant a
  // retry is scheduled would flicker it on and off during a burst.
  clearTimer = setTimeout(() => {
    busy.value = false
  }, Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS) + NOTICE_LINGER_MS)
}

/** Test seam: forget the busy state immediately. */
export function resetServerBusy(): void {
  if (clearTimer) clearTimeout(clearTimer)
  busy.value = false
}

/**
 * `Retry-After` in seconds. The header may be a delay or an HTTP date; both are
 * legal (RFC 9110 §10.2.3), so both are handled rather than assuming the form
 * our own services happen to send today.
 */
export function parseRetryAfter(header: unknown, fallbackSeconds = 1): number {
  if (typeof header !== 'string' || !header.trim()) return fallbackSeconds
  const asNumber = Number(header)
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber
  const asDate = Date.parse(header)
  if (!Number.isNaN(asDate)) {
    return Math.max(0, (asDate - Date.now()) / 1000)
  }
  return fallbackSeconds
}

/** Retrying these cannot create or change anything, so a repeat is harmless. */
function isSafeMethod(method?: string): boolean {
  const m = (method || 'get').toLowerCase()
  return m === 'get' || m === 'head' || m === 'options'
}

type RetryableConfig = AxiosRequestConfig & { __overloadRetries?: number }

/**
 * Teach one axios client about 503s. Applied to every client in the app, so the
 * behaviour is the same whichever service is shedding.
 */
export function installOverloadHandling(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error?.response?.status
      if (status !== 503) {
        return Promise.reject(error)
      }

      const seconds = parseRetryAfter(error.response?.headers?.['retry-after'])
      markServerBusy(seconds)

      const config = error.config as RetryableConfig | undefined
      const attempts = config?.__overloadRetries ?? 0
      if (!config || !isSafeMethod(config.method) || attempts >= MAX_RETRIES) {
        return Promise.reject(error)
      }

      config.__overloadRetries = attempts + 1
      const waitMs = Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      return client(config)
    },
  )
}
