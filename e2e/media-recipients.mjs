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
 * End-to-end: a video link's address list, edited from the creator's Share tab.
 *
 * The creator works in the real SPA (signed in, file drawer → Share → "Who /
 * activity"); the viewers are real browser pages on the landing URL, verifying
 * with the code MailHog receives. What is proved:
 *   * the roster of a VERIFIED link is shown, and an address added there can
 *     then verify and watch;
 *   * removing an address there stops that viewer's playback at the next range
 *     request, and the recipient token they still hold no longer opens a
 *     session — while the address that stayed keeps watching;
 *   * a CLAIMED link's list is labelled "who you expect", and removing an
 *     address from it does not stop that viewer;
 *   * a revoked link offers no Add control.
 *
 *   FE_PASS=… node e2e/media-recipients.mjs
 * Env: FE_PASS (required); APP_URL, BRIDGE_URL, SHARE_URL, FE_USER, FE_TENANT,
 * MAILHOG_URL.
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

const RUN = process.pid
const A = `rcpt-a-${RUN}@example.com`        // on the list at creation, later removed
const B = `rcpt-b-${RUN}@example.com`        // added from the Share tab
const KEEP = `rcpt-keep-${RUN}@example.com`  // stays on the list throughout
const EXPECTED = `rcpt-exp-${RUN}@example.com`

let passed = 0
let failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ✓', m) } else { failed++; console.error('  ✗', m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let token = ''
let expiresIn = 3600
const H = (x = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...x })
const JH = () => H({ 'Content-Type': 'application/json' })

/** The newest code mailed to `to` (MailHog keeps every message). */
async function mailhogCode(to) {
  for (let i = 0; i < 60; i++) {
    await sleep(250)
    const items = (await json(await fetch(`${MAILHOG}/api/v2/messages`)))?.items || []
    const m = items.find((x) => !to || JSON.stringify(x.Raw?.To || x.Content?.Headers?.To || '').includes(to))
    const code = ((m?.Content?.Body || '').replace(/=\r?\n/g, '').match(/\b(\d{6})\b/) || [])[1]
    if (code) return code
  }
  return ''
}

async function login() {
  const basic = Buffer.from(`${USER}:${PASS}`).toString('base64')
  const first = await json(await fetch(`${BRIDGE}/v1/auth/token`, { method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'X-Tenant': TENANT } }))
  if (first?.token) { expiresIn = first.expires_in || expiresIn; return first.token }
  const J = { 'Content-Type': 'application/json' }
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, action: 'send', method: 'email' }) })
  const code = await mailhogCode('')
  await sleep(5500)                         // ldap_manager charges a too-fast attempt
  const done = await json(await fetch(`${BRIDGE}/v1/auth/2fa`, { method: 'POST', headers: J,
    body: JSON.stringify({ mfa_token: first.mfa_token, method: 'email', code }) }))
  expiresIn = done.expires_in || expiresIn
  return done.token
}

async function mint(fileUid, body) {
  const c = await json(await fetch(`${SHARE}/share/v1/nodes/${fileUid}/links`, { method: 'POST',
    headers: JH(), body: JSON.stringify({ kind: 3, ttl_days: 1, ...body }) }))
  if (!c?.link_uid) throw new Error(`mint failed: ${JSON.stringify(c)}`)
  const end = Date.now() + 300_000
  let l = c
  while (l.media_state !== 'ready' && Date.now() < end) {
    await sleep(3000)
    l = await json(await fetch(`${SHARE}/share/v1/links/${c.link_uid}`, { headers: H() }))
  }
  const tail = new URL(c.url).pathname.split('/').pop() || ''
  return { ...c, ready: l.media_state === 'ready', path: new URL(c.url).pathname,
           k: tail.slice(tail.indexOf('.') + 1) }
}

const roster = async (link) => Object.fromEntries(
  ((await json(await fetch(`${SHARE}/share/v1/links/${link}/recipients?include_removed=true`,
    { headers: H() })))?.recipients || []).map((r) => [r.email, r]))

// ── the creator, in the SPA ─────────────────────────────────────────────────

async function ownerPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.addInitScript(({ token, exp, tenant }) => {
    localStorage.setItem('fileengine_auth', JSON.stringify({ accessToken: token, refreshToken: '', expiresAt: exp }))
    localStorage.setItem('fileengine_tenant', tenant)
  }, { token, exp: Date.now() + expiresIn * 1000, tenant: TENANT })
  // What the SPA asked for, so a stuck page can say which call it is waiting on.
  page.netlog = []
  const t0 = Date.now()
  const at = () => ((Date.now() - t0) / 1000).toFixed(1)
  page.on('response', (r) => {
    if (!/\.(js|ts|vue|css|svg|png|woff2?)(\?|$)|@vite|@id|node_modules/.test(r.url()))
      page.netlog.push(`${at()} ${r.status()} ${r.request().method()} ${r.url().slice(0, 150)}`)
  })
  page.on('requestfailed', (r) => page.netlog.push(`${at()} FAILED ${r.url().slice(0, 150)} ${r.failure()?.errorText}`))
  page.on('console', (m) => { if (m.type() === 'error') page.netlog.push(`${at()} console: ${m.text().slice(0, 200)}`) })
  return page
}

/** Open the file's drawer on the Share tab and expand the link whose row carries `mode`. */
async function openLinkDetail(page, fileUid, mode) {
  await page.goto(`${APP}/files?file=${fileUid}`)
  const shareTab = page.locator('button', { hasText: /^Share$/ })
  await shareTab.waitFor({ timeout: 30000 }).catch(async (e) => {
    const shot = join(tmpdir(), `media-recipients-${RUN}.png`)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    console.error(`  page at failure (${page.url()}), screenshot ${shot}:\n`,
      (await page.locator('body').innerText().catch(() => '')).slice(0, 300))
    console.error('  requests:\n   ' + (page.netlog || []).slice(-40).join('\n   '))
    throw e
  })
  await shareTab.click()
  const row = page.locator('li.share-item', { has: page.locator('.share-mode', { hasText: mode }) })
    .filter({ hasNot: page.locator('.share-badge[data-st="revoked"]') }).first()
  await row.waitFor({ timeout: 20000 })
  await row.locator('button', { hasText: 'Who / activity' }).click()
  await row.locator('[data-test="recipients"]').waitFor({ timeout: 15000 })
  return row
}

const recipientRow = (detail, email) => detail.locator('[data-test="recipient"]', { hasText: email })

// ── a viewer, on the landing page ───────────────────────────────────────────

/** Verify `email` in a fresh page and start playback. Returns the page, the
 *  recipient token the door issued, and the stream URL the player is reading. */
async function verifiedViewer(browser, link, email) {
  const page = await browser.newPage()
  let recipientToken = ''
  page.on('response', async (r) => {
    if (/\/media\/v1\/[^/]+\/verify/.test(r.url())) {
      try { recipientToken = (await r.json())?.recipient_token || recipientToken } catch { /* not json */ }
    }
  })
  await page.goto(APP + link.path)
  await page.waitForSelector('[data-test="identify"]', { timeout: 30000 })
  await page.fill('[data-test="identify"] input', email)
  await page.click('[data-test="identify"] button')
  await page.waitForSelector('[data-test="code"]', { timeout: 20000 })
  const code = await mailhogCode(email)
  await sleep(5500)                         // paced like a person (rung-0 attempt charge)
  await page.fill('[data-test="code"] input', code)
  await page.click('[data-test="code"] button')
  const played = await plays(page, 2).catch((e) => { console.error('   ', String(e)); return 0 })
  const src = await page.evaluate(() => document.querySelector('[data-test="media"]')?.currentSrc || '')
  return { page, played, src, recipientToken, code }
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

/** One range read of the stream, from inside the viewer's own page. */
const rangeStatus = (page, src) => page.evaluate(async (u) =>
  (await fetch(u, { headers: { Range: 'bytes=0-99' }, credentials: 'omit' })).status, src)

/** Ask the door for a fresh session with a token already in hand. */
const reopen = (page, link, email, recipientToken) => page.evaluate(async ({ uid, k, email, recipientToken }) =>
  (await fetch(`/media/v1/${uid}/session?k=${encodeURIComponent(k)}`, { method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ email, recipient_token: recipientToken }) })).status,
{ uid: link.link_uid, k: link.k, email, recipientToken })

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fe-recipients-'))
  const src = join(work, 'clip.mp4')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '12', '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'aac',
    '-shortest', src])
  token = await login()
  if (!token) throw new Error('could not sign in')
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  const browser = await chromium.launch({ headless: true })
  let fileUid = ''
  const minted = []
  try {
    fileUid = (await json(await fetch(`${BRIDGE}/v1/dirs/${ROOT}/files`, { method: 'POST', headers: JH(),
      body: JSON.stringify({ name: `e2e-recipients-${RUN}.mp4` }) }))).uid
    await fetch(`${BRIDGE}/v1/files/${fileUid}/content`, { method: 'PUT',
      headers: H({ 'Content-Type': 'application/octet-stream' }), body: readFileSync(src) })

    const verified = await mint(fileUid, { access_mode: 'verified', recipients: [A, KEEP],
                                           display_name: 'Recipients E2E' })
    minted.push(verified.link_uid)
    assert(verified.ready, `verified link published (${verified.link_uid})`)

    console.log('== the Share tab shows a verified link\'s list')
    const owner = await ownerPage(browser)
    let detail = await openLinkDetail(owner, fileUid, 'named people')
    assert(await detail.locator('h4', { hasText: 'Who may watch' }).count() === 1, 'headed "Who may watch"')
    assert(await recipientRow(detail, A).count() === 1 && await recipientRow(detail, KEEP).count() === 1,
      'both addresses given at creation are listed')
    assert(/On the list/.test(await recipientRow(detail, A).innerText()), 'not yet contacted: "On the list"')
    assert(/stops their playback/.test(await detail.locator('[data-test="roster-note"]').innerText()),
      'the note says removal stops playback')

    console.log('== an address added in the Share tab can watch')
    await detail.locator('[data-test="add-email"]').fill(B)
    await detail.locator('[data-test="add"]').click()
    await recipientRow(detail, B).waitFor({ timeout: 10000 })
    assert(true, 'the added address appears in the list')
    assert(!!(await roster(verified.link_uid))[B] && !(await roster(verified.link_uid))[B].removed_at,
      'and the server roster has it')
    const vb = await verifiedViewer(browser, verified, B)
    assert(vb.played >= 2, `the added recipient verified and watched (${Number(vb.played).toFixed(1)} s)`)
    await vb.page.close()

    console.log('== removing an address in the Share tab stops that viewer')
    const va = await verifiedViewer(browser, verified, A)
    const vk = await verifiedViewer(browser, verified, KEEP)
    assert(va.played >= 2 && vk.played >= 2, 'two listed recipients are watching')
    assert(!!va.src && await rangeStatus(va.page, va.src) === 206, 'A\'s stream answers a range before removal')
    assert(!!va.recipientToken, 'A\'s page holds a recipient token')
    await owner.reload()
    detail = await openLinkDetail(owner, fileUid, 'named people')
    assert(/Verified/.test(await recipientRow(detail, A).innerText()), 'the list now says A verified')
    await recipientRow(detail, A).locator('[data-test="remove"]').click()
    await detail.locator('[data-test="recipient"]', { hasText: A })
      .filter({ hasText: 'Removed' }).waitFor({ timeout: 10000 })
    assert(await recipientRow(detail, A).locator('[data-test="remove"]').count() === 0,
      'A shows Removed, with no Remove button')
    assert(!!(await roster(verified.link_uid))[A]?.removed_at, 'the server roster marks A removed')
    assert(await rangeStatus(va.page, va.src) === 404, 'A\'s very next range request is refused')
    assert(await reopen(va.page, verified, A, va.recipientToken) === 404,
      'the recipient token A still holds no longer opens a session')
    assert(await rangeStatus(vk.page, vk.src) === 206, 'the recipient who stayed keeps streaming')
    assert(await reopen(vk.page, verified, KEEP, vk.recipientToken) === 200,
      'and can still open a new session with their token')
    await va.page.close()
    await vk.page.close()

    console.log('== a claimed link\'s list is only who you expect')
    const claimed = await mint(fileUid, { access_mode: 'claimed', recipients: [EXPECTED],
                                          display_name: 'Recipients E2E (claimed)' })
    minted.push(claimed.link_uid)
    assert(claimed.ready, 'claimed link published')
    const viewer = await browser.newPage()
    await viewer.goto(APP + claimed.path)
    await viewer.waitForSelector('[data-test="claim"]', { timeout: 30000 })
    await viewer.fill('[data-test="claim"] input[type="email"]', EXPECTED)
    await viewer.click('[data-test="claim"] button')
    assert((await plays(viewer, 2)) >= 2, 'the expected viewer is watching')
    const csrc = await viewer.evaluate(() => document.querySelector('[data-test="media"]').currentSrc)
    await owner.reload()
    detail = await openLinkDetail(owner, fileUid, 'email given')
    assert(await detail.locator('h4', { hasText: 'Who you expect' }).count() === 1, 'headed "Who you expect"')
    assert(/Expected/.test(await recipientRow(detail, EXPECTED).innerText()), 'the address is tagged Expected')
    assert(/does not stop them watching/.test(await detail.locator('[data-test="roster-note"]').innerText()),
      'the note says removal does not stop anyone')
    await recipientRow(detail, EXPECTED).locator('[data-test="remove"]').click()
    await detail.locator('[data-test="recipient"]', { hasText: EXPECTED })
      .filter({ hasText: 'Removed' }).waitFor({ timeout: 10000 })
    assert(await rangeStatus(viewer, csrc) === 206, 'and indeed the claimed viewer keeps streaming')
    await viewer.close()

    console.log('== a revoked link cannot be widened')
    const rv = await fetch(`${SHARE}/share/v1/links/${verified.link_uid}`, { method: 'DELETE', headers: H() })
    assert(rv.ok, 'the verified link is revoked')
    await owner.goto(`${APP}/files?file=${fileUid}`)
    await owner.locator('button', { hasText: /^Share$/ }).click()
    const dead = owner.locator('li.share-item', { has: owner.locator('.share-badge[data-st="revoked"]') }).first()
    await dead.waitFor({ timeout: 20000 })
    await dead.locator('button', { hasText: 'Who / activity' }).click()
    await dead.locator('[data-test="roster-dead"]').waitFor({ timeout: 10000 })
    assert(await dead.locator('[data-test="add-email"]').count() === 0, 'no Add control on the revoked link')
    await owner.close()
    console.log(`\n  links: verified ${verified.link_uid}, claimed ${claimed.link_uid}`)
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
