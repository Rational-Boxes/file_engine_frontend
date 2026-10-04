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
 * The outside viewer's side of a media link — the media door (MEDIA_SHARE.md
 * §6.3-6.8). Token-free, like sharePublicService and for the same reason: a
 * signed-in browser must never lend its identity to a viewing.
 *
 * The door lives on its OWN origin (`<tenant>-media.<base>`); the landing page
 * learns it from the outside-share peek. JSON bodies go as text/plain so a
 * cross-origin call is a CORS simple request — no preflight — and the secret
 * rides the query (`k`), which the media origin's access log omits.
 */
export interface MediaSource {
  label: string
  quality: 'hd' | 'sd' | 'opus' | 'mp3'
  default: boolean
  mime: string
  bytes: number
  /** Relative to the door's origin. After a session opens it carries `t`. */
  url: string
}

export interface MediaPeek {
  kind: 'video' | 'audio'
  mode: 'verified' | 'claimed' | 'open'
  title: string | null
  duration_ms: number | null
  poster: string | null
  state: 'ready' | 'preparing'
  progress_pct: number | null
  /** Which gate to show BEFORE asking for bytes. */
  requires: 'none' | 'email' | 'code'
  allow_download: boolean
  sources: MediaSource[]
  /** False: the player sends no beacon, and the page says so. */
  tracking: boolean
}

export interface MediaSession {
  session: string
  expires_at: string
  title: string | null
  duration_ms: number | null
  sources: MediaSource[]
  tracking: boolean
  beacon?: string
}

/** Thrown for the one non-error refusal a viewer must see: still encoding. */
export class Preparing extends Error {}
/** Rung 3 on an OPEN link: the door explains itself (MEDIA_SHARE.md §6.9). */
export class Popular extends Error {}
/** Anything else — uniformly "not available", as the door intends. */
export class Unavailable extends Error {}

const TEXT = { 'Content-Type': 'text/plain' }

export function doorBase(mediaBase: string): string {
  // Empty in a dev stack with no media host: the Vite proxy serves /media/v1.
  return (mediaBase || '').replace(/\/+$/, '')
}

async function call(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, { credentials: 'omit', ...init })
  if (r.status === 202) throw new Preparing()
  if (r.status === 503) throw new Popular((await r.json().catch(() => ({})))?.message || '')
  if (r.status === 400 || r.status === 429) {
    const body = await r.json().catch(() => ({}))
    const err = new Unavailable(body?.error || String(r.status))
    ;(err as Unavailable & { status: number }).status = r.status
    throw err
  }
  if (!r.ok) throw new Unavailable(String(r.status))
  return r.json()
}

export function mediaDoor(mediaBase: string, linkUid: string, secret: string) {
  const base = `${doorBase(mediaBase)}/media/v1/${linkUid}`
  const k = encodeURIComponent(secret)
  return {
    abs: (path: string) => `${doorBase(mediaBase)}${path}`,
    peek: () => call(`${base}?k=${k}`) as Promise<MediaPeek>,
    posterUrl: () => `${base}/poster?k=${k}`,
    /** `claimed`: an address and consent, no code. */
    claim: (email: string, consentTextId: string) =>
      call(`${base}/claim?k=${k}`, { method: 'POST', headers: TEXT,
        body: JSON.stringify({ email, consent: true, consent_text_id: consentTextId }) }) as Promise<MediaSession>,
    /** `open`, or `verified` with the recipient token from verify(). */
    session: (email?: string, recipientToken?: string) =>
      call(`${base}/session?k=${k}`, { method: 'POST',
        headers: { ...TEXT, ...(recipientToken ? { 'X-Recipient-Token': recipientToken } : {}) },
        body: JSON.stringify(email ? { email } : {}) }) as Promise<MediaSession>,
    identify: (email: string) =>
      call(`${base}/identify?k=${k}`, { method: 'POST', headers: TEXT,
        body: JSON.stringify({ email }) }) as Promise<{ expires_in_seconds: number }>,
    async verify(email: string, code: string): Promise<{ ok: boolean; locked: boolean; recipient_token?: string }> {
      const r = await fetch(`${base}/verify?k=${k}`, { method: 'POST', headers: TEXT, credentials: 'omit',
        body: JSON.stringify({ email, code }) })
      const data = await r.json().catch(() => ({}))
      return r.status === 401 ? { ok: false, locked: !!data?.locked } : data
    },
    downloadUrl: (session: string) => `${base}/download?t=${encodeURIComponent(session)}`,
  }
}
