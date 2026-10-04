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

// MS6 — the media branch of the Share tab (MEDIA_SHARE.md §10).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const { create, listForNode, revoke, capabilities, state, features } = vi.hoisted(() => ({
  create: vi.fn(), listForNode: vi.fn(), revoke: vi.fn(), capabilities: vi.fn(),
  state: vi.fn(), features: { media: true } as Record<string, boolean>,
}))

vi.mock('@/services/shareService', async () => {
  const actual = await vi.importActual<object>('@/services/shareService')
  const svc = { create, listForNode, revoke, capabilities }
  return { ...actual, shareService: svc, default: svc }
})
vi.mock('@/services/mediaService', async () => {
  const actual = await vi.importActual<object>('@/services/mediaService')
  return { ...actual, mediaService: { state }, default: { state } }
})
vi.mock('@/composables/useCapabilities', () => ({
  useCapabilities: () => ({ features: reactive(features), ready: { value: true } }),
}))

import ShareTab from '@/components/ShareTab.vue'
import { ShareKind } from '@/services/shareService'

const CAPS = { enabled: true, media: { available: true, open_mode: true, playback_tracking: true,
                                      max_bytes: 4 * 2 ** 30, default_max_bytes: 50 * 2 ** 30 } }

function mountTab(name = 'Intro.mp4') {
  return mount(ShareTab, {
    props: { resourceUid: 'vid-1', isFolder: false, name },
    global: { stubs: { HelpIcon: true, MediaLinkDetail: true, ShareLinkDetail: true } },
  })
}

async function chooseWatch(w: ReturnType<typeof mountTab>) {
  await w.get('[data-test="kind"]').setValue(String(ShareKind.MEDIA))
  await flushPromises()
}

beforeEach(() => {
  for (const f of [create, listForNode, revoke, capabilities, state]) f.mockReset()
  features.media = true
  listForNode.mockResolvedValue([])
  capabilities.mockResolvedValue(CAPS)
  state.mockResolvedValue({ file_uid: 'vid-1', source_version: 'v1', mime: 'video/mp4',
                            jobs: [], renditions: [] })
})

describe('ShareTab — media', () => {
  it('offers "let someone watch" for a video when both csai and share_service can', async () => {
    const w = mountTab()
    await flushPromises()
    expect(w.find('[data-test="kind"]').text()).toMatch(/watch this/)
  })

  it('offers nothing new for a document, or where encoding is unavailable', async () => {
    let w = mountTab('Contract.pdf')
    await flushPromises()
    expect(w.find('[data-test="kind"]').exists()).toBe(false)
    expect(capabilities).not.toHaveBeenCalled()
    features.media = false
    w = mountTab()
    await flushPromises()
    expect(w.find('[data-test="kind"]').exists()).toBe(false)
    features.media = true
    capabilities.mockResolvedValue({ ...CAPS, media: { ...CAPS.media, available: false } })
    w = mountTab()
    await flushPromises()
    expect(w.find('[data-test="kind"]').exists()).toBe(false)
  })

  it('says listen, not watch, for audio', async () => {
    const w = mountTab('Talk.mp3')
    await flushPromises()
    expect(w.find('[data-test="kind"]').text()).toMatch(/listen to this/)
  })

  it('shows the three modes as radios and disables open where it is off', async () => {
    capabilities.mockResolvedValue({ ...CAPS, media: { ...CAPS.media, open_mode: false } })
    const w = mountTab()
    await flushPromises()
    await chooseWatch(w)
    const radios = w.findAll('[data-test="modes"] input[type="radio"]')
    expect(radios.map((r) => (r.element as HTMLInputElement).value)).toEqual(['verified', 'claimed', 'open'])
    expect((radios[2].element as HTMLInputElement).disabled).toBe(true)
    expect(w.text()).toMatch(/not enabled on this deployment/)
  })

  it('says creating will prepare a copy when nothing is published yet', async () => {
    const w = mountTab()
    await flushPromises()
    await chooseWatch(w)
    expect(w.get('[data-test="will-prepare"]').text()).toMatch(/prepare a web-playable copy/)
  })

  it('passes on a publish failure such as the length limit, with its pointer', async () => {
    state.mockResolvedValue({ file_uid: 'vid-1', source_version: 'v1', mime: 'video/mp4',
      jobs: [{ profile: 'video-720p-vp9', status: 'failed',
               detail: 'too long. For longer videos, publish to PeerTube (open source), YouTube or Vimeo' }],
      renditions: [] })
    const w = mountTab()
    await flushPromises()
    await chooseWatch(w)
    expect(w.get('[data-test="will-prepare"]').text()).toMatch(/PeerTube/)
  })

  it('needs addresses for verified, none for claimed', async () => {
    const w = mountTab()
    await flushPromises()
    await chooseWatch(w)
    expect(w.get('[data-test="create"]').attributes('disabled')).toBeDefined()
    await w.get('[data-test="modes"] input[value="claimed"]').setValue(true)
    expect(w.get('[data-test="create"]').attributes('disabled')).toBeUndefined()
  })

  it('makes an open link need the confirmation AND a public title', async () => {
    create.mockResolvedValue({ link_uid: 'L1', kind: 3, url: 'https://t/s/L1.sec',
                               expires_at: '2026-10-11T00:00:00Z', secret_shown_once: true })
    const w = mountTab()
    await flushPromises()
    await chooseWatch(w)
    await w.get('[data-test="modes"] input[value="open"]').setValue(true)
    const btn = () => w.get('[data-test="create"]').attributes('disabled')
    expect(btn()).toBeDefined()
    await w.get('[data-test="confirm-public"] input').setValue(true)
    expect(btn()).toBeDefined()                        // still no title
    await w.get('[data-test="display-name"]').setValue('Product tour')
    expect(btn()).toBeUndefined()
    expect(w.get('[data-test="confirm-public"]').text()).toMatch(/anyone they forward it to/)
    await w.get('[data-test="create"]').trigger('click')
    await flushPromises()
    const [uid, body] = create.mock.calls[0]
    expect(uid).toBe('vid-1')
    expect(body).toMatchObject({ kind: 3, access_mode: 'open', recipients: [],
                                 confirm_public: true, display_name: 'Product tour' })
    expect(body.max_uses).toBeUndefined()
  })

  it('states the worst case in viewings, from the published size', async () => {
    state.mockResolvedValue({ file_uid: 'vid-1', source_version: 'v1', mime: 'video/mp4',
      jobs: [{ profile: 'video-720p-vp9', status: 'succeeded', output_bytes: 50 * 2 ** 20 }],
      renditions: ['v1-media.webm'] })
    const w = mountTab()
    await flushPromises()
    await chooseWatch(w)
    expect(w.find('[data-test="will-prepare"]').exists()).toBe(false)   // already published
    expect(w.get('[data-test="worst-case"]').text()).toMatch(/1,024 full viewings/)
    expect(w.get('[data-test="worst-case"]').text()).toMatch(/PeerTube/)
  })

  it('gives an email snippet on the media origin after creation', async () => {
    create.mockResolvedValue({
      link_uid: 'L1', kind: 3, access_mode: 'claimed', display_name: 'Intro',
      url: 'https://acme.example.com/s/L1.sec', media_state: 'pending_media',
      media_url: 'https://acme-media.example.com/media/v1/L1?k=sec',
      expires_at: '2026-10-11T00:00:00Z', secret_shown_once: true })
    const w = mountTab()
    await flushPromises()
    await chooseWatch(w)
    await w.get('[data-test="modes"] input[value="claimed"]').setValue(true)
    await w.get('[data-test="create"]').trigger('click')
    await flushPromises()
    const html = (w.get('[data-test="email-snippet"] textarea').element as HTMLTextAreaElement).value
    expect(html).toContain('src="https://acme-media.example.com/media/v1/L1/poster?k=sec"')
    expect(html).toContain('href="https://acme.example.com/s/L1.sec"')
    expect(html).toMatch(/alt="▶ Watch: Intro"/)
    expect(w.find('[data-test="created-preparing"]').exists()).toBe(true)
    // The message for a claimed link does not promise a code that never comes.
    const msg = (w.findAll('.share-msg textarea')[0].element as HTMLTextAreaElement).value
    expect(msg).toMatch(/asked for your email address/)
    expect(msg).not.toMatch(/one-time code/)
  })
})
