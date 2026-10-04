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
    // A fixed, wide window: the media page must FILL it (production 2026-10-04 drew
    // a 720p stream as a ~430px stamp in a form-sized card).
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    const leaks = guard(page)
    await page.goto(APP + claimed.path)
    await page.waitForSelector('[data-test="claim"]', { timeout: 30000 }).catch(async (e) => {
      // Say what the page DID show — a bare selector timeout names nothing.
      const shot = join(tmpdir(), `media-landing-${process.pid}.png`)
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
      console.error(`  page at failure (${page.url()}), screenshot ${shot}:\n`,
        (await page.locator('body').innerText().catch(() => '')).slice(0, 600))
      throw e
    })
    assert(await page.locator('h1', { hasText: 'Landing E2E' }).count() === 1, 'the creator’s title, not the file name')
    assert(await page.locator('[data-test="player"]').count() === 0, 'no player before the gate')
    const before = await json(await fetch(`${SHARE}/share/v1/links/${claimed.link_uid}/audience`, { headers: H() }))
    assert(before.audience.length === 0, 'opening the page is not a view')
    assert(/^By clicking Watch, you agree that the sender can see whether and how much/
      .test((await page.textContent('[data-test="consent"]')).trim()),
      'the consent wording is shown above Watch')
    assert(await page.locator('[data-test="claim"] input[type="checkbox"]').count() === 0,
      'no checkbox to tick — the click on Watch is the consent')
    const gate = await page.evaluate(() => {
      const f = document.querySelector('[data-test="claim"]').getBoundingClientRect()
      return { left: f.left, right: innerWidth - f.right }
    })
    assert(Math.abs(gate.left - gate.right) <= 2,
      `the email gate is centred (${Math.round(gate.left)}px | ${Math.round(gate.right)}px)`)
    const gateW = await page.evaluate(() => document.querySelector('[data-test="claim"]').getBoundingClientRect().width)
    assert(gateW <= 481, `the email gate keeps a form's measure (${Math.round(gateW)}px)`)
    await page.fill('[data-test="claim"] input[type="email"]', 'landing-viewer@example.com')
    await page.click('[data-test="claim"] button')
    const reached = await plays(page, 4)
    assert(reached >= 4, `the video played in the page (${reached.toFixed(1)} s)`)
    const box = await page.evaluate(() => {
      const v = document.querySelector('[data-test="media"]')
      const r = v.getBoundingClientRect()
      // The picture actually drawn: the element letterboxes when height binds.
      const drawn = Math.min(r.width, r.height * (v.videoWidth / v.videoHeight))
      return { w: r.width, h: r.height, drawn, bottom: r.bottom, vh: innerHeight }
    })
    assert(box.w >= 1500, `the player spans the page (${Math.round(box.w)}px of 1600)`)
    assert(box.drawn >= 1400, `and the picture fills it, not a stamp (${Math.round(box.drawn)}px drawn)`)
    assert(box.bottom <= box.vh, `without running off the bottom of the window (${Math.round(box.bottom)} <= ${box.vh})`)
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

    // Production 2026-10-04: the landing page (tenant origin) calls the door on
    // <tenant>-media, and identify/verify carried no CORS — the browser withheld a
    // 200 the server had acted on. Dev proxies the door onto the SPA's origin, so
    // the steps above cannot see that; here the page calls the door DIRECTLY on
    // its own origin, and the browser enforces CORS for real.
    console.log('== the verified path, cross-origin as in production')
    const xo = await mint(fileUid, { access_mode: 'verified', allowed_embed_origins: [APP],
                                     recipients: ['landing-xo@example.com'] })
    minted.push(xo.link_uid)
    const p3 = await browser.newPage()
    await p3.goto(APP + '/')
    const door = `${SHARE}/media/v1/${xo.link_uid}`
    // The URL is <origin>/s/<link_uid>.<secret>.
    const tail = new URL(xo.url).pathname.split('/').pop() || ''
    const k = encodeURIComponent(tail.slice(tail.indexOf('.') + 1))
    const xpost = (route, body, headers = {}) => p3.evaluate(async ({ door, k, route, body, headers }) => {
      try {
        const r = await fetch(`${door}/${route}?k=${k}`, { method: 'POST', credentials: 'omit',
          headers: { 'Content-Type': 'text/plain', ...headers }, body: JSON.stringify(body) })
        return { status: r.status, body: await r.json() }
      } catch (e) { return { threw: String(e) } }
    }, { door, k, route, body, headers })
    await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
    const idr = await xpost('identify', { email: 'landing-xo@example.com' })
    assert(idr.status === 200 && idr.body?.status === 'sent_if_authorized',
      `identify is readable cross-origin (${JSON.stringify(idr)})`)
    // Paced like a person: ldap_manager's rung 0 charges an attempt made sooner
    // than a code could be read (5 s after send, 1.5 s between tries) at 5x —
    // one scripted wrong code would otherwise spend the whole budget and lock
    // the address, and the right code would then be refused too.
    await sleep(6000)
    const wrong = await xpost('verify', { email: 'landing-xo@example.com', code: '000000' })
    assert(wrong.status === 401,
      `a wrong code is readable cross-origin, so the page can say so (${JSON.stringify(wrong)})`)
    const xcode = await mailhogCode()
    await sleep(2000)
    const vr = await xpost('verify', { email: 'landing-xo@example.com', code: xcode })
    assert(vr.status === 200 && vr.body?.ok && vr.body?.recipient_token,
      `the right code is readable cross-origin and yields a recipient token (${JSON.stringify(vr).slice(0, 160)})`)
    // The step production failed next: as a header the token forced a preflight
    // the door answers 405, so the browser never sent the request at all.
    const viaHeader = await xpost('session', { email: 'landing-xo@example.com' },
                                  { 'X-Recipient-Token': vr.body?.recipient_token })
    assert(!!viaHeader.threw, `a custom header is preflighted and blocked (${JSON.stringify(viaHeader).slice(0, 80)})`)
    const sr = await xpost('session', { email: 'landing-xo@example.com',
                                        recipient_token: vr.body?.recipient_token })
    assert(sr.status === 200 && !!sr.body?.session,
      `with the token in the body the session opens cross-origin (${sr.status ?? sr.threw})`)
    await p3.close()
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
