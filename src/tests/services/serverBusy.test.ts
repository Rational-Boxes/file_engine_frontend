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
import axios from 'axios'
import {
  installOverloadHandling,
  isServerBusy,
  markServerBusy,
  parseRetryAfter,
  resetServerBusy,
} from '@/services/serverBusy'

beforeEach(() => {
  resetServerBusy()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  resetServerBusy()
})

/** An axios instance whose adapter we control, so no network is involved. */
function clientThatReturns(statuses: number[], headers: Record<string, string> = {}) {
  const calls: string[] = []
  const client = axios.create()
  let i = 0
  client.defaults.adapter = async (config) => {
    calls.push(`${(config.method || 'get').toUpperCase()} ${config.url}`)
    const status = statuses[Math.min(i++, statuses.length - 1)]
    const response = { data: {}, status, statusText: '', headers, config } as never
    if (status >= 400) {
      const err = new axios.AxiosError('boom', undefined, config as never, null, response)
      throw err
    }
    return response
  }
  installOverloadHandling(client)
  return { client, calls }
}

describe('Retry-After parsing', () => {
  it('reads a delay in seconds', () => {
    expect(parseRetryAfter('3')).toBe(3)
  })

  it('reads an HTTP date, which is equally legal (RFC 9110 §10.2.3)', () => {
    const twoSecondsOut = new Date(Date.now() + 2000).toUTCString()
    expect(parseRetryAfter(twoSecondsOut)).toBeGreaterThan(0.5)
    expect(parseRetryAfter(twoSecondsOut)).toBeLessThanOrEqual(2)
  })

  it('falls back when the header is missing or nonsense', () => {
    expect(parseRetryAfter(undefined)).toBe(1)
    expect(parseRetryAfter('soon')).toBe(1)
    expect(parseRetryAfter('')).toBe(1)
  })
})

describe('the busy notice', () => {
  it('is not showing to begin with', () => {
    expect(isServerBusy.value).toBe(false)
  })

  it('shows on a 503 and clears itself without anyone dismissing it', async () => {
    const { client } = clientThatReturns([503], { 'retry-after': '1' })
    const call = client.post('/v1/files').catch(() => 'rejected')

    // The toast must be up before the request has finished resolving: the user
    // should learn the server is busy while it still is.
    await vi.advanceTimersByTimeAsync(0)
    expect(isServerBusy.value).toBe(true)
    expect(await call).toBe('rejected')

    // It clears on its own — there is nothing to acknowledge, and by the time a
    // user reached for a close button the condition has usually passed.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(isServerBusy.value).toBe(false)
  })

  it('does not appear for ordinary errors', async () => {
    const { client } = clientThatReturns([500])
    await client.get('/v1/nodes/root').catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(isServerBusy.value).toBe(false)
  })

  it('holds while 503s keep arriving rather than flickering', async () => {
    markServerBusy(1)
    await vi.advanceTimersByTimeAsync(3_000)
    markServerBusy(1)               // another shed request lands
    await vi.advanceTimersByTimeAsync(3_000)
    expect(isServerBusy.value).toBe(true)
  })
})

describe('automatic retry', () => {
  it('retries a GET, because repeating a read cannot change anything', async () => {
    const { client, calls } = clientThatReturns([503, 200], { 'retry-after': '1' })
    const done = client.get('/v1/nodes/root')
    await vi.advanceTimersByTimeAsync(2_000)
    const resp = await done
    expect(resp.status).toBe(200)
    expect(calls).toEqual(['GET /v1/nodes/root', 'GET /v1/nodes/root'])
  })

  it('does NOT retry a POST — a silent duplicate is worse than an error', async () => {
    // This is the whole reason the toast exists: an unsafe request has to
    // surface, so the user is the one who decides to try again.
    const { client, calls } = clientThatReturns([503, 200], { 'retry-after': '1' })
    const outcome = await client.post('/v1/dirs/root/files', { name: 'x' }).catch(() => 'rejected')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(outcome).toBe('rejected')
    expect(calls).toEqual(['POST /v1/dirs/root/files'])
  })

  it('does not retry a PUT either', async () => {
    const { client, calls } = clientThatReturns([503, 200])
    await client.put('/v1/files/abc/content', 'data').catch(() => undefined)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(calls).toHaveLength(1)
  })

  it('gives up rather than hammering a service that is already struggling', async () => {
    const { client, calls } = clientThatReturns([503], { 'retry-after': '1' })
    const outcome = client.get('/v1/nodes/root').catch(() => 'rejected')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await outcome).toBe('rejected')
    // Original plus two retries, then it stops.
    expect(calls).toHaveLength(3)
  })

  it('caps how long it will wait, however long Retry-After asks for', async () => {
    const { client, calls } = clientThatReturns([503, 200], { 'retry-after': '600' })
    const done = client.get('/v1/nodes/root')
    // 5s cap: a ten-minute Retry-After must not strand the request for ten minutes.
    await vi.advanceTimersByTimeAsync(5_100)
    await done
    expect(calls).toHaveLength(2)
  })
})
