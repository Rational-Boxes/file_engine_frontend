#!/usr/bin/env node
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
 * End-to-end: an outside viewer opens a media link in a real browser (MS7).
 *
 * The creator mints through the API; the viewer has only the URL, opened in a
 * headless Chromium against the SPA. For a CLAIMED link: the page shows the
 * poster and the email + consent gate (no session before that), the video then
 * plays, the beacon lands, and the creator's roster reports a real, unverified,
 * partly-watched viewer; the download is the 720p WebM as an attachment. For a
 * VERIFIED link: the emailed code is read from MailHog and the video plays.
 * Throughout, the page sends no bearer token and no cookie to the door.
 *
 *   FE_PASS=… node e2e/media-landing.mjs
 * Env: FE_PASS (required); APP_URL (the SPA, default http://localhost:3000),
 * BRIDGE_URL, SHARE_URL, FE_USER, FE_TENANT, MAILHOG_URL.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const APP = process.env.APP_URL || 'http://localhost:3000'
const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const SHARE = process.env.SHARE_URL || 'http://localhost:8101'
const MAILHOG = process.env.MAILHOG_URL || 'http://localhost:8025'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS
const TENANT = process.env.FE_TENANT || 'default'
const ROOT = '00000000-0000-0000-0000-000000000000'
if (!PASS) { console.error('FE_PASS is required.'); process.exit(1) }

let passed = 0
let failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ✓', m) } else { failed++; console.error('  ✗', m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let token = ''
const H = (x = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...x })
const JH = () => H({ "Content-Type": "application/json" })

async function mailhogCode() {
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    const raw = (await json(await fetch(`${MAILHOG}/api/v2/messages`)))?.items?.[0]?.Content?.Body || ''
    const code = (raw.replace(/=\r?\n/g, '').match(/\b(\d{6})\b/) || [])[1]
    if (code) return code
  }
  return ''
}

async function login() {
  const basic = Buffer.from(`${USER}:${PASS}`).toString('base64')
  const first = await json(await fetch(`${BRIDGE}/v1/auth/token`, { method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'X-Tenant': TENANT } }))
  if (first?.token) return first.token
  const J = { 'Content-Type': 'application/json' }
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, action: 'send', method: 'email' }) })
  const code = await mailhogCode()
  return (await json(await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, method: 'email', code }) }))).token
}

async function mint(fileUid, body) {
  const c = await json(await fetch(`${SHARE}/share/v1/nodes/${fileUid}/links`, { method: 'POST',
    headers: JH(), body: JSON.stringify({ kind: 3, ttl_days: 1, ...body }) }))
  const end = Date.now() + 300_000
  let l = c
  while (l.media_state !== 'ready' && Date.now() < end) {
    await sleep(3000)
    l = await json(await fetch(`${SHARE}/share/v1/links/${c.link_uid}`, { headers: H() }))
  }
  return { ...c, ready: l.media_state === 'ready', path: new URL(c.url).pathname }
}

/** Watch the page's own requests: no credential may ever leave it. */
function guard(page) {
  const leaks = []
  page.on('request', (r) => {
    const h = r.headers()
    if (h.authorization || h.cookie) leaks.push(r.url())
  })
  return leaks
}

async function plays(page, seconds) {
  await page.waitForSelector('[data-test="media"]', { timeout: 30000 })
  return page.evaluate((secs) => new Promise((resolve, reject) => {
    const v = document.querySelector('[data-test="media"]')
    const t = setTimeout(() => reject(new Error(`no playback (readyState ${v.readyState})`)), 60000)
    v.muted = true
    void v.play().catch(() => {})
    const tick = () => (v.currentTime >= secs ? (clearTimeout(t), v.pause(), resolve(v.currentTime))
      : setTimeout(tick, 100))
    tick()
  }), seconds)
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fe-landing-'))
  const src = join(work, 'clip.mp4')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '12', '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'aac',
    '-shortest', src])
  token = await login()
  const browser = await chromium.launch({ headless: true })
  let fileUid = ''
  const minted = []
  try {
    fileUid = (await json(await fetch(`${BRIDGE}/v1/dirs/${ROOT}/files`, { method: 'POST', headers: JH(),
      body: JSON.stringify({ name: `e2e-landing-${process.pid}.mp4` }) }))).uid
    await fetch(`${BRIDGE}/v1/files/${fileUid}/content`, { method: 'PUT',
      headers: H({ 'Content-Type': 'application/octet-stream' }), body: readFileSync(src) })

    console.log('== claimed: an address and consent, then it plays')
    const claimed = await mint(fileUid, { access_mode: 'claimed', recipients: [],
                                          display_name: 'Landing E2E', allow_download: true })
    minted.push(claimed.link_uid)
    assert(claimed.ready, 'published')
    const page = await browser.newPage()
    const leaks = guard(page)
    await page.goto(APP + claimed.path)
    await page.waitForSelector('[data-test="claim"]', { timeout: 30000 })
    assert(await page.locator('h1', { hasText: 'Landing E2E' }).count() === 1, 'the creator’s title, not the file name')
    assert(await page.locator('[data-test="player"]').count() === 0, 'no player before the gate')
    const before = await json(await fetch(`${SHARE}/share/v1/links/${claimed.link_uid}/audience`, { headers: H() }))
    assert(before.audience.length === 0, 'opening the page is not a view')
    assert(/sender can see whether and how much/.test(await page.textContent('[data-test="claim"]')),
      'the consent wording is shown')
    await page.fill('[data-test="claim"] input[type="email"]', 'landing-viewer@example.com')
    await page.check('[data-test="consent"]')
    await page.click('[data-test="claim"] button')
    const reached = await plays(page, 4)
    assert(reached >= 4, `the video played in the page (${reached.toFixed(1)} s)`)
    await sleep(1500)                                       // the pause beacon
    const aud = await json(await fetch(`${SHARE}/share/v1/links/${claimed.link_uid}/audience`, { headers: H() }))
    const row = aud.audience[0]
    assert(row?.email === 'landing-viewer@example.com' && row.verified === false,
      'the roster has the viewer, marked unverified')
    assert(row?.has_playback && row.coverage_pct >= 20 && row.coverage_pct <= 60,
      `the beacon from the real player landed (${row?.coverage_pct}% of 12 s)`)
    const dl = await page.getAttribute('[data-test="download"]', 'href')
    const head = await page.evaluate(async (u) => {
      const r = await fetch(u, { headers: { Range: 'bytes=0-3' } })
      return { status: r.status, cd: r.headers.get('content-disposition'), ct: r.headers.get('content-type') }
    }, dl)
    assert(head.status === 206 && /^attachment; filename="Landing E2E\.webm"$/.test(head.cd || '')
      && head.ct === 'video/webm', 'download: the 720p WebM, as an attachment')
    assert(leaks.length === 0, `no bearer or cookie left the page (${leaks.length})`)
    await page.close()

    console.log('== verified: an emailed code, then it plays')
    const verified = await mint(fileUid, { access_mode: 'verified',
                                           recipients: ['landing-verified@example.com'] })
    minted.push(verified.link_uid)
    const p2 = await browser.newPage()
    const leaks2 = guard(p2)
    await p2.goto(APP + verified.path)
    await p2.waitForSelector('[data-test="identify"]', { timeout: 30000 })
    await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
    await p2.fill('[data-test="identify"] input', 'landing-verified@example.com')
    await p2.click('[data-test="identify"] button')
    await p2.waitForSelector('[data-test="code"]')
    const code = await mailhogCode()
    assert(/^\d{6}$/.test(code), 'the code arrived by email')
    await p2.fill('[data-test="code"] input', code)
    await p2.click('[data-test="code"] button')
    assert((await plays(p2, 2)) >= 2, 'the verified viewer’s video played')
    const vaud = await json(await fetch(`${SHARE}/share/v1/links/${verified.link_uid}/audience`, { headers: H() }))
    assert(vaud.audience[0]?.verified === true, 'and the roster shows them verified')
    assert(leaks2.length === 0, 'no bearer or cookie left the page')
    await p2.close()
  } finally {
    await browser.close()
    for (const l of minted) await fetch(`${SHARE}/share/v1/links/${l}`, { method: 'DELETE', headers: H() })
    if (fileUid) await fetch(`${BRIDGE}/v1/files/${fileUid}`, { method: 'DELETE', headers: H() })
    rmSync(work, { recursive: true, force: true })
  }
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
