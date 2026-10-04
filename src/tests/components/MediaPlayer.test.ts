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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaPlayer from '@/components/MediaPlayer.vue'
import type { MediaSource } from '@/services/mediaDoorService'

const SOURCES: MediaSource[] = [
  { label: '720p', quality: 'hd', default: true, mime: 'video/webm', bytes: 10, url: 'https://m/hd' },
  { label: '480p', quality: 'sd', default: false, mime: 'video/webm', bytes: 5, url: 'https://m/sd' },
]

beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably')
  Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: '4g' } })
})

const src = (w: ReturnType<typeof mount>) => w.get('[data-test="media"]').attributes('src')

describe('MediaPlayer', () => {
  it('plays the first source the browser can play', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      (m) => (m === 'video/webm' ? '' : 'maybe'))
    const w = mount(MediaPlayer, { props: { sources: [
      { ...SOURCES[0], mime: 'video/webm' }, { ...SOURCES[1], mime: 'video/mp4' }] } })
    expect(src(w)).toBe('https://m/sd')
  })

  it('offers Auto/720p/480p only when both encodes exist', () => {
    let w = mount(MediaPlayer, { props: { sources: SOURCES } })
    expect(w.findAll('[data-test="quality"] option').map((o) => o.text())).toEqual(['Auto', '720p', '480p'])
    w = mount(MediaPlayer, { props: { sources: [SOURCES[0]] } })
    expect(w.find('[data-test="quality"]').exists()).toBe(false)
  })

  it('Auto picks 480p on a slow connection and 720p otherwise', () => {
    expect(src(mount(MediaPlayer, { props: { sources: SOURCES } }))).toBe('https://m/hd')
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: '3g' } })
    expect(src(mount(MediaPlayer, { props: { sources: SOURCES } }))).toBe('https://m/sd')
  })

  it('remembers an explicit choice for the session', async () => {
    const w = mount(MediaPlayer, { props: { sources: SOURCES } })
    await w.get('[data-test="quality"]').setValue('sd')
    expect(src(w)).toBe('https://m/sd')
    expect(sessionStorage.getItem('media.quality')).toBe('sd')
    expect(src(mount(MediaPlayer, { props: { sources: SOURCES } }))).toBe('https://m/sd')
  })

  it('never switches by itself: a slower connection later does not change the source', async () => {
    const w = mount(MediaPlayer, { props: { sources: SOURCES } })
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: '2g' } })
    await w.setProps({ poster: 'p' })
    expect(src(w)).toBe('https://m/hd')
  })

  it('hides the caption menu while there are no tracks', () => {
    expect(mount(MediaPlayer, { props: { sources: SOURCES } }).find('[data-test="captions"]').exists()).toBe(false)
  })
})
