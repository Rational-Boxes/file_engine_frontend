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

import axios from 'axios'
import { SERVICE_PATHS, serviceBase } from '@/services/serviceBase'

/**
 * The recipient's side of a share link — deliberately **token-free**.
 *
 * This is a separate client from `shareClient` for one reason, and it is not
 * stylistic: `shareClient` attaches the SPA's bearer token to every request. If
 * the landing page used it, a redemption made in a browser that happens to be
 * signed in would carry that identity, and the audit record could name a passing
 * authenticated user instead of the verified recipient. The service refuses to
 * read a bearer on these routes; this makes the SPA refuse to send one.
 *
 * There is no interceptor here at all — that absence is the feature.
 */
const publicClient = axios.create({
  baseURL: serviceBase(import.meta.env.VITE_SHARE_BASE, SERVICE_PATHS.share),
  // A 401 on /verify is a DEFINED outcome (wrong code / locked out), not a
  // transport failure. Letting axios reject it would turn the one response the
  // recipient most needs to understand into a generic error.
  validateStatus: (s) => (s >= 200 && s < 300) || s === 401,
})

export interface SharePeek {
  kind: 0 | 1 | 2
  expires_at: string
  uses_remaining: number | null
  verification_required: boolean
  note: string | null
  member_count?: number
  archive_bytes?: number | null
  size_bytes?: number | null
  files_remaining?: number | null
  bytes_remaining?: number | null
}

export interface ShareSession {
  redemption_uid: string
  expires_at: string
  kind: 0 | 1 | 2
  archive_bytes?: number
  members_served?: number
  members_omitted?: number
}

export interface ShareManifestEntry { path: string; size_bytes: number }

/** `{link_uid}.{secret}` — the whole token as it appears in the URL. */
export function splitToken(token: string): { linkUid: string; secret: string } {
  const dot = token.indexOf('.')
  if (dot <= 0) return { linkUid: '', secret: '' }
  return { linkUid: token.slice(0, dot), secret: token.slice(dot + 1) }
}

function headers(secret: string, extra: Record<string, string> = {}) {
  // The secret rides a header, not the query string: a query string lands in
  // every proxy and access log between here and the service.
  return { 'X-Share-Secret': secret, ...extra }
}

export const sharePublicService = {
  /** Metadata only. Consumes nothing, and reveals nothing about recipients. */
  async peek(linkUid: string, secret: string): Promise<SharePeek> {
    const { data } = await publicClient.get(`/v1/public/${linkUid}`, { headers: headers(secret) })
    return data
  },

  /**
   * Ask for a code. Also the **resend** path — there is no separate route, so a
   * recipient whose code expired or never arrived submits the same address again.
   *
   * The response is identical whether or not the address is on the link, which
   * is what stops this endpoint enumerating the recipient list.
   */
  async identify(linkUid: string, secret: string, email: string): Promise<{ expires_in_seconds: number }> {
    const { data } = await publicClient.post(`/v1/public/${linkUid}/identify`, { email },
      { headers: headers(secret) })
    return data
  },

  /** Exchange a code for a recipient token. Consumes no use. */
  async verify(linkUid: string, secret: string, email: string, code: string):
      Promise<{ ok: boolean; locked: boolean; recipient_token?: string; expires_in?: number }> {
    const { data, status } = await publicClient.post(`/v1/public/${linkUid}/verify`,
      { email, code }, { headers: headers(secret) })
    return status === 401 ? { ok: false, locked: !!data?.locked } : data
  },

  /** Open a session. **This is where a use is consumed.** */
  async openSession(linkUid: string, secret: string, email: string, recipientToken: string):
      Promise<ShareSession> {
    const { data } = await publicClient.post(`/v1/public/${linkUid}/session`, { email },
      { headers: headers(secret, { 'X-Recipient-Token': recipientToken }) })
    return data
  },

  async manifest(linkUid: string, secret: string, redemptionUid: string):
      Promise<ShareManifestEntry[]> {
    const { data } = await publicClient.get(`/v1/public/${linkUid}/manifest`,
      { headers: headers(secret, { 'X-Redemption-Uid': redemptionUid }) })
    return data.members ?? []
  },

  /**
   * The payload URL. Returned rather than fetched so the browser downloads it
   * directly — pulling gigabytes through XHR just to hand them back as a blob
   * would defeat the streaming the whole stack was built for.
   *
   * NB the secret is in the query here because a browser navigation cannot set
   * headers. That is why the service's nginx location strips the query string
   * from its access log.
   */
  contentUrl(linkUid: string, secret: string, redemptionUid: string): string {
    const base = serviceBase(import.meta.env.VITE_SHARE_BASE, SERVICE_PATHS.share)
    const q = new URLSearchParams({ k: secret, redemption: redemptionUid })
    return `${base}/v1/public/${linkUid}/content?${q.toString()}`
  },

  /** Drop one file into the folder. */
  async drop(linkUid: string, secret: string, redemptionUid: string, file: File,
             claimedName: string): Promise<{ stored_name: string; size_bytes: number }> {
    const { data } = await publicClient.post(`/v1/public/${linkUid}/files`, file, {
      headers: headers(secret, {
        'X-Redemption-Uid': redemptionUid,
        'X-File-Name': file.name,
        ...(claimedName ? { 'X-Claimed-Name': claimedName } : {}),
        'Content-Type': 'application/octet-stream',
      }),
    })
    return data
  },
}

export default sharePublicService
