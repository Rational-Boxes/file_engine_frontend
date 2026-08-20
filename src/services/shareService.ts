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

import shareClient from '@/services/shareClient'

/** 0 = download a file, 1 = drop box, 2 = download a folder as a zip. */
export const ShareKind = { FILE: 0, UPLOAD: 1, FOLDER: 2 } as const
export type ShareKindValue = (typeof ShareKind)[keyof typeof ShareKind]

/**
 * The computed state of a link, as one badge.
 *
 * `not_working` is the one that earns its place: a link can stop working with
 * nothing about the link having changed — someone edited an ACL three folders
 * up, or the pinned version was culled. Without it the creator's experience is
 * "my recipient says it's broken and everything looks fine to me".
 */
export type ShareStatus =
  | 'active' | 'expired' | 'revoked' | 'exhausted' | 'blocked' | 'not_working'

export interface ShareLink {
  link_uid: string
  kind: ShareKindValue
  resource_uid: string
  created_by: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  revoked_by: string | null
  status: ShareStatus
  max_uses: number
  uses_consumed: number
  max_uses_per_recipient: number
  max_bytes: number
  bytes_consumed: number
  max_file_bytes: number
  max_files: number
  files_consumed: number
  pinned_version: string | null
  follow_folder: boolean
  include_subdirs: boolean
  archive_bytes: number | null
  note: string | null
  /** Only ever present on the creation response — see `CreatedShareLink`. */
  not_working_reason?: string
  not_working_message?: string
}

/**
 * The creation response, and the ONLY time the URL exists.
 *
 * The service stores `sha256(secret)` and nothing else, so this cannot be
 * fetched again — the UI has to say so unmistakably rather than letting someone
 * assume they can come back for it.
 */
export interface CreatedShareLink extends ShareLink {
  url: string
  secret_shown_once: true
  member_count?: number
  worst_case_egress_bytes?: number | null
  skipped?: string[]
}

/** One address on the link's allowlist, with how far it has got. */
export interface ShareRecipient {
  email: string
  invited_at: string
  invited_by: string
  last_code_sent_at: string | null
  first_verified_at: string | null
  last_used_at: string | null
  uses_consumed: number
  failed_codes: number
  removed_at: string | null
  removed_by: string | null
  status: 'on_the_list' | 'opened' | 'verified' | 'used' | 'removed'
}

/** One use of a link: who, when, from where, how much. */
export interface ShareRedemption {
  redemption_uid: string
  opened_at: string
  completed_at: string | null
  verified_email: string
  source_addr: string | null
  user_agent: string | null
  bytes_moved: number
  files_moved: number
  /** For a drop, the file the drop created — "what did they send us", one click. */
  result_uid: string | null
  archive_bytes: number | null
  members_served: number
}

export interface CreateShareLinkRequest {
  kind: ShareKindValue
  recipients: string[]
  ttl_days?: number
  expires_at?: string
  max_uses?: number
  max_uses_per_recipient?: number
  max_bytes?: number
  max_file_bytes?: number
  max_files?: number
  follow_latest?: boolean
  follow_folder?: boolean
  include_subdirs?: boolean
  landing_prefix?: string
  ext_allowlist?: string[]
  note?: string
}

export const shareService = {
  /**
   * Mint a link. The response carries the only copy of the URL.
   *
   * Note there is no `send_invite`: v1 mails no invite. An address entered here
   * *authorizes* someone — it does not contact them — and the form has to say
   * so, because it is the one thing about this feature a user can get wrong
   * without noticing.
   */
  async create(resourceUid: string, body: CreateShareLinkRequest): Promise<CreatedShareLink> {
    const { data } = await shareClient.post(`/v1/nodes/${resourceUid}/links`, body)
    return data
  },

  /** Links this user has minted on one node. */
  async listForNode(resourceUid: string): Promise<ShareLink[]> {
    const { data } = await shareClient.get(`/v1/nodes/${resourceUid}/links`)
    return data.links ?? []
  },

  /** Every link this user has minted; `live` excludes revoked and expired. */
  async listMine(live = true): Promise<ShareLink[]> {
    const { data } = await shareClient.get('/v1/links', { params: { live } })
    return data.links ?? []
  },

  /**
   * One link's live status — this re-runs the authority pre-flight server-side,
   * so it is what surfaces `not_working`. Cheap enough to call when the tab
   * opens; not something to poll.
   */
  async get(linkUid: string): Promise<ShareLink> {
    const { data } = await shareClient.get(`/v1/links/${linkUid}`)
    return data
  },

  /** Revoke. Idempotent — revoking an already-revoked link is a success. */
  async revoke(linkUid: string): Promise<void> {
    await shareClient.delete(`/v1/links/${linkUid}`)
  },

  async recipients(linkUid: string, includeRemoved = false): Promise<ShareRecipient[]> {
    const { data } = await shareClient.get(`/v1/links/${linkUid}/recipients`, {
      params: { include_removed: includeRemoved },
    })
    return data.recipients ?? []
  },

  /**
   * The usage ledger. Served from share_service's own rows, so an ordinary
   * creator needs no AUDIT_READ scope to see who used their own link.
   */
  async redemptions(linkUid: string, limit = 200): Promise<ShareRedemption[]> {
    const { data } = await shareClient.get(`/v1/links/${linkUid}/redemptions`, {
      params: { limit },
    })
    return data.redemptions ?? []
  },

  async addRecipient(linkUid: string, email: string): Promise<void> {
    await shareClient.post(`/v1/links/${linkUid}/recipients`, { email })
  },

  /**
   * Partial revoke: that address loses access, the link keeps working for
   * everyone else. Cheaper than revoking and re-issuing, which would invalidate
   * the URL for people who already have it.
   */
  async removeRecipient(linkUid: string, email: string): Promise<void> {
    await shareClient.delete(`/v1/links/${linkUid}/recipients/${encodeURIComponent(email)}`)
  },
}

export default shareService
