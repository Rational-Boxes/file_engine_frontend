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
 * End-to-end: the drawer's video path, against the live stack.
 *
 * Upload a clip → the ingest worker makes the 10 s silent `preview` → publish
 * through CSAI (what the Share tab will send) → the media worker encodes 720p +
 * 480p → the bridge's rendition listing, classified by the SPA's OWN
 * `toRenditionSet` (imported, not re-implemented), offers exactly what
 * DocumentPreview shows: the preview by default and the two full versions as
 * the explicit choice → each one streams through a playback ticket the way
 * `fileService.playbackUrl` builds it, with exact 206s on a seek.
 *
 * Needs core, http_bridge, csai (app + ingest worker + media worker) and
 * ffmpeg. Run with vite-node so the `@/` imports resolve:
 *   FE_PASS=… npx vite-node e2e/media-playback.ts
 * Env: FE_PASS (required); BRIDGE_URL, CSAI_URL, FE_USER, FE_TENANT,
 * MAILHOG_URL, MEDIA_SRC (a real clip instead of the generated one).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { toRenditionSet, type RenditionRef } from '@/services/renditions'

const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const CSAI = process.env.CSAI_URL || 'http://localhost:8092'
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
const ROOT = '00000000-0000-0000-0000-000000000000'

if (!PASS) {
  console.error('FE_PASS is required (the LDAP test-user password).')
  process.exit(1)
}

let passed = 0
let failed = 0
const assert = (cond: unknown, msg: string) => {
  if (cond) { passed++; console.log('  ✓', msg) } else { failed++; console.error('  ✗', msg) }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let token = ''
const H = (extra: Record<string, string> = {}) =>
  ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...extra })
const json = async (r: Response) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }

async function login(): Promise<string> {
  const basic = Buffer.from(`${USER}:${PASS}`).toString('base64')
  const first = await json(await fetch(`${BRIDGE}/v1/auth/token`, {
    method: 'POST', headers: { Authorization: `Basic ${basic}`, 'X-Tenant': TENANT },
  }))
  if (first?.token) return first.token
  if (!first?.mfa_token) throw new Error(`login: ${JSON.stringify(first)}`)
  const send = { 'Content-Type': 'application/json' }
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await fetch(`${BRIDGE}/v1/auth/2fa`, {
    method: 'POST', headers: send,
    body: JSON.stringify({ mfa_token: first.mfa_token, action: 'send', method: 'email' }),
  })
  let code = ''
  for (let i = 0; i < 40 && !code; i++) {
    await sleep(250)
    const box = await json(await fetch(`${MAILHOG}/api/v2/messages`))
    const raw: string = box?.items?.[0]?.Content?.Body || ''
    code = (raw.replace(/=\r?\n/g, '').match(/\b(\d{6})\b/) || [])[1] || ''
  }
  if (!code) throw new Error('no 2FA code arrived in MailHog')
  const done = await json(await fetch(`${BRIDGE}/v1/auth/2fa`, {
    method: 'POST', headers: send,
    body: JSON.stringify({ mfa_token: first.mfa_token, method: 'email', code }),
  }))
  if (!done?.token) throw new Error(`2FA: ${JSON.stringify(done)}`)
  return done.token
}

// What fileService.playbackUrl does: mint, then a ticketed content URL.
async function playbackUrl(uid: string): Promise<string> {
  const r = await fetch(`${BRIDGE}/v1/files/${uid}/playback-ticket`, { method: 'POST', headers: H() })
  const { ticket } = await json(r)
  return `${BRIDGE}/v1/files/${uid}/content?${new URLSearchParams({ ticket })}`
}

async function listRenditions(uid: string) {
  const d = await json(await fetch(`${BRIDGE}/v1/files/${uid}/renditions`, { headers: H() }))
  return (d?.entries || []) as Array<{ uid: string; name: string; size: number }>
}

async function waitFor<T>(what: string, secs: number, probe: () => Promise<T | undefined>): Promise<T | undefined> {
  const end = Date.now() + secs * 1000
  while (Date.now() < end) {
    const v = await probe()
    if (v) return v
    await sleep(2000)
  }
  console.error(`  … gave up waiting ${secs}s for ${what}`)
  return undefined
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fe-media-e2e-'))
  let src = process.env.MEDIA_SRC || ''
  if (!src) {
    src = join(work, 'clip.mp4')
    // 1080p MPEG-4 + AAC: encodable by any FFmpeg, and never "conformant", so
    // publishing must really transcode and scale.
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '12',
      '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'aac', '-shortest', src])
  }
  token = await login()
  let fileUid = ''
  try {
    console.log('== upload')
    const name = `e2e-media-${process.pid}.${src.split('.').pop()!.toLowerCase()}`
    const created = await json(await fetch(`${BRIDGE}/v1/dirs/${ROOT}/files`, {
      method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ name }),
    }))
    fileUid = created?.uid
    assert(fileUid, 'file created')
    const put = await fetch(`${BRIDGE}/v1/files/${fileUid}/content`, {
      method: 'PUT', headers: H({ 'Content-Type': 'application/octet-stream' }), body: readFileSync(src),
    })
    assert(put.ok, `upload ${put.status}`)

    console.log('== the drawer default: the ingest preview')
    const preview = await waitFor('the ingest preview', 120, async () =>
      toRenditionSet(await listRenditions(fileUid)).preview)
    assert(preview, 'ingest produced a preview rendition')
    let set = toRenditionSet(await listRenditions(fileUid))
    assert(!set.media && !set.media_sd, 'nothing full-length exists before a publish (on demand only)')

    console.log('== publish (what the Share tab sends)')
    const pub = await fetch(`${CSAI}/documents/${fileUid}/media`, {
      method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: '{}',
    })
    const pubBody = await json(pub)
    assert(pub.status === 202, `publish accepted (${pub.status})`)
    assert(Array.isArray(pubBody?.jobs) && pubBody.jobs.length === 3, 'three jobs queued (720p, 480p, email poster)')
    const done = await waitFor('the media worker', 300, async () => {
      const st = await json(await fetch(`${CSAI}/documents/${fileUid}/media`, { headers: H() }))
      const jobs: Array<{ status: string }> = st?.jobs || []
      if (jobs.some((j) => j.status === 'failed')) return st
      return jobs.length && jobs.every((j) => j.status === 'succeeded' || j.status === 'skipped') ? st : undefined
    })
    assert(done && (done.jobs as Array<{ status: string }>).every((j) => j.status === 'succeeded'),
      'every publish job succeeded')

    console.log('== the listing, classified by the SPA')
    const listing = await listRenditions(fileUid)
    set = toRenditionSet(listing)
    assert(set.preview && set.media && set.media_sd && set.emailposter,
      'toRenditionSet sees preview + media + media_sd + emailposter')
    const sizeOf = (r: RenditionRef) => listing.find((e) => e.uid === r.uid)?.size ?? -1

    for (const ref of [set.preview, set.media, set.media_sd] as RenditionRef[]) {
      if (!ref) continue
      console.log(`== stream ${ref.fmt}`)
      const total = sizeOf(ref)
      const url = await playbackUrl(ref.uid)
      // A player's first request, then a seek to the middle.
      let r = await fetch(url, { headers: { Range: 'bytes=0-' } })
      assert(r.status === 206, `${ref.fmt}: first request 206 (${r.status})`)
      assert(r.headers.get('content-type') === 'video/webm', `${ref.fmt}: served as video/webm`)
      assert(r.headers.get('content-range') === `bytes 0-${total - 1}/${total}`,
        `${ref.fmt}: Content-Range names the total (${r.headers.get('content-range')})`)
      await r.body?.cancel()
      const mid = Math.floor(total / 2)
      r = await fetch(url, { headers: { Range: `bytes=${mid}-${mid + 4095}` } })
      const bytes = Buffer.from(await r.arrayBuffer())
      assert(r.status === 206 && bytes.length === Math.min(4096, total - mid),
        `${ref.fmt}: seek to 50% returns exactly the window`)
    }

    console.log('== ticket scope')
    const t = new URL(await playbackUrl(set.media!.uid)).searchParams.get('ticket')!
    const other = await fetch(`${BRIDGE}/v1/files/${set.media_sd!.uid}/content?ticket=${encodeURIComponent(t)}`)
    assert(other.status === 401, `a 720p ticket does not open the 480p rendition (${other.status})`)
    const src2 = await fetch(`${BRIDGE}/v1/files/${fileUid}/content?ticket=${encodeURIComponent(t)}`)
    assert(src2.status === 401, `nor the source (${src2.status})`)
  } finally {
    if (fileUid) await fetch(`${BRIDGE}/v1/files/${fileUid}`, { method: 'DELETE', headers: H() })
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
