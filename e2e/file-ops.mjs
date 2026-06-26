#!/usr/bin/env node
/**
 * End-to-end test for the file operations the SPA relies on, driven against the
 * live http_bridge REST API (the same endpoints fileService uses). Covers the
 * cut/copy/paste + batch-delete + versions behaviour, including the regression
 * where a versioned copy must preserve history and current = latest version.
 *
 * Run against a running stack (core + http_bridge):
 *   node e2e/file-ops.mjs
 * Env overrides: BRIDGE_URL, FE_USER, FE_PASS, FE_TENANT.
 */
const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8090'
const USER = process.env.FE_USER || 'testuser@rationalboxes.com'
const PASS = process.env.FE_PASS || 'P@ssword1234567890*'
const TENANT = process.env.FE_TENANT || 'default'
const ROOT = '00000000-0000-0000-0000-000000000000'

let token
const H = (extra = {}) => ({ Authorization: `Bearer ${token}`, 'X-Tenant': TENANT, ...extra })
let passed = 0
let failed = 0
const assert = (cond, msg) => {
  if (cond) { passed++; console.log('  ✓', msg) } else { failed++; console.error('  ✗', msg) }
}
const body = (o) => ({ headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify(o) })
const j = async (res) => { const t = await res.text(); try { return JSON.parse(t) } catch { return t } }

const login = async () => {
  const res = await fetch(`${BRIDGE}/v1/auth/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64'), 'X-Tenant': TENANT },
  })
  token = (await j(res)).token
  if (!token) throw new Error(`login failed for ${USER}`)
}
const mkdir = async (parent, name) => (await j(await fetch(`${BRIDGE}/v1/dirs/${parent}`, { method: 'POST', ...body({ name }) }))).uid
const touch = async (parent, name) => (await j(await fetch(`${BRIDGE}/v1/dirs/${parent}/files`, { method: 'POST', ...body({ name }) }))).uid
const put = (uid, data) => fetch(`${BRIDGE}/v1/files/${uid}/content`, { method: 'PUT', headers: H({ 'Content-Type': 'text/plain' }), body: data })
const content = async (uid) => (await fetch(`${BRIDGE}/v1/files/${uid}/content`, { headers: H() })).text()
const versions = async (uid) => (await j(await fetch(`${BRIDGE}/v1/files/${uid}/versions`, { headers: H() }))).versions || []
const listDir = async (uid) => (await j(await fetch(`${BRIDGE}/v1/dirs/${uid}`, { headers: H() }))).entries || []
const copy = (uid, dest) => fetch(`${BRIDGE}/v1/nodes/${uid}/copy`, { method: 'POST', ...body({ destination_parent_uid: dest }) })
const move = (uid, dest) => fetch(`${BRIDGE}/v1/nodes/${uid}/move`, { method: 'POST', ...body({ destination_parent_uid: dest }) })
const rm = (uid, isDir) => fetch(`${BRIDGE}/v1/${isDir ? 'dirs' : 'files'}/${uid}`, { method: 'DELETE', headers: H() })

async function main() {
  await login()
  const work = await mkdir(ROOT, `e2e-fileops-${Date.now()}`)
  const dst = await mkdir(work, 'dst')

  console.log('copy preserves version history + current = latest')
  const vf = await touch(work, 'versioned.txt')
  for (const v of ['v1-one', 'v2-two', 'v3-three']) await put(vf, v)
  assert((await versions(vf)).length === 3, 'source has 3 versions')
  await copy(vf, dst)
  const vcopy = (await listDir(dst)).find((e) => e.name === 'versioned.txt')
  assert(!!vcopy, 'copy exists in destination')
  assert((await versions(vcopy.uid)).length === 3, 'copy preserves all 3 versions (history)')
  assert((await content(vcopy.uid)) === 'v3-three', 'copy current content is the LATEST version')
  const cv = await versions(vcopy.uid)
  const oldest = cv[cv.length - 1]
  const oldBlob = await (await fetch(`${BRIDGE}/v1/files/${vcopy.uid}/versions/${encodeURIComponent(oldest)}`, { headers: H() })).text()
  assert(oldBlob === 'v1-one', 'an older version of the copy is intact')

  console.log('single-version copy (the non-versioned baseline)')
  const sf = await touch(work, 'single.txt'); await put(sf, 'only-content')
  await copy(sf, dst)
  const scopy = (await listDir(dst)).find((e) => e.name === 'single.txt')
  assert(scopy && (await content(scopy.uid)) === 'only-content', 'single-version copy has correct content')

  console.log('move (cut) relocates the node')
  const mf = await touch(work, 'mover.txt'); await put(mf, 'moved')
  await move(mf, dst)
  assert((await listDir(dst)).some((e) => e.uid === mf), 'moved file is in the destination')
  assert(!(await listDir(work)).some((e) => e.uid === mf), 'moved file is gone from the source')

  console.log('batch delete')
  const d1 = await touch(work, 'del1.txt'); const d2 = await touch(work, 'del2.txt')
  await rm(d1, false); await rm(d2, false)
  assert(!(await listDir(work)).some((e) => e.uid === d1 || e.uid === d2), 'batch-deleted files are gone')

  console.log('name collisions auto-rename with a number suffix')
  const cf = await touch(work, 'dup.txt'); await put(cf, 'orig')
  await copy(cf, work) // copy into the SAME folder
  const dupNames = (await listDir(work)).map((e) => e.name).filter((n) => n.startsWith('dup'))
  assert(dupNames.includes('dup.txt') && dupNames.includes('dup (1).txt'),
    'copy into the same folder yields "dup (1).txt" (no duplicate name)')

  await rm(work, true) // cleanup
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('E2E error:', e); process.exit(1) })
