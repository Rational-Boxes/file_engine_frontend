<!--
  Copyright (C) 2026 James Hickman

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  The player (MEDIA_SHARE.md §10) — one component for the landing page, and
  later the embed. It takes the server's ORDERED sources and plays the first the
  browser says it can. For video with both encodes it offers Auto / 720p / 480p:
  Auto picks 480p on a slow connection and 720p otherwise, an explicit choice is
  remembered for the session, and it NEVER switches by itself mid-playback.

  There is a <track> slot and a caption menu that hides itself while there are
  no tracks (§16.5): free now, and the difference between a day and a week if
  transcripts ever arrive.
-->
<template>
  <div class="mp">
    <video
      v-if="kind === 'video'"
      ref="el"
      class="mp-media"
      :src="src"
      :poster="poster || undefined"
      controls
      playsinline
      preload="metadata"
      :autoplay="autoplay"
      data-test="media"
      @error="$emit('error')"
    >
      <slot name="tracks" />
    </video>
    <audio
      v-else
      ref="el"
      class="mp-media"
      :src="src"
      controls
      preload="metadata"
      :autoplay="autoplay"
      data-test="media"
      @error="$emit('error')"
    >
      <slot name="tracks" />
    </audio>

    <div class="mp-bar">
      <label v-if="qualityOptions.length" class="mp-q">
        <span>Quality</span>
        <select :value="choice" data-test="quality" @change="choose(($event.target as HTMLSelectElement).value)">
          <option v-for="o in qualityOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <label v-if="hasTracks" class="mp-q" data-test="captions">
        <span>Captions</span>
        <select @change="setTrack(($event.target as HTMLSelectElement).value)">
          <option value="">Off</option>
          <option v-for="(t, i) in trackLabels" :key="i" :value="String(i)">{{ t }}</option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MediaSource } from '@/services/mediaDoorService'
import { trackPlayback } from '@/utils/playbackBeacon'

const props = withDefaults(defineProps<{
  sources: MediaSource[]
  kind?: 'video' | 'audio'
  poster?: string | null
  /** Absolute beacon URL; absent when tracking is off. */
  beaconUrl?: string
  autoplay?: boolean
}>(), { kind: 'video', poster: null, beaconUrl: undefined, autoplay: false })
defineEmits<{ (e: 'error'): void }>()

const QUALITY_KEY = 'media.quality'
const el = ref<HTMLMediaElement | null>(null)
const choice = ref<string>(readChoice())
const hasTracks = ref(false)
const trackLabels = ref<string[]>([])
let detach: (() => void) | null = null

function readChoice(): string {
  try { return sessionStorage.getItem(QUALITY_KEY) || 'auto' } catch { return 'auto' }
}

/** What this browser can actually play, in the server's order of preference. */
const playable = computed(() => {
  const probe = document.createElement(props.kind === 'audio' ? 'audio' : 'video')
  return props.sources.filter((s) => !s.mime || probe.canPlayType(s.mime) !== '')
})

const qualityOptions = computed(() => {
  const qs = playable.value.map((s) => s.quality)
  if (props.kind !== 'video' || !(qs.includes('hd') && qs.includes('sd'))) return []
  return [{ value: 'auto', label: 'Auto' },
          ...playable.value.map((s) => ({ value: s.quality, label: s.label }))]
})

function slowConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection
  return !!c && (c.saveData === true || ['slow-2g', '2g', '3g'].includes(c.effectiveType || ''))
}

function pick(q: string): MediaSource | undefined {
  const list = playable.value
  if (q === 'auto') {
    if (qualityOptions.value.length) return list.find((s) => s.quality === (slowConnection() ? 'sd' : 'hd'))
    return list[0]
  }
  return list.find((s) => s.quality === q) ?? list[0]
}

// Chosen ONCE from the current choice; only an explicit choose() changes it.
const current = ref<MediaSource | undefined>(pick(choice.value))
const src = computed(() => current.value?.url ?? '')

async function choose(q: string) {
  choice.value = q
  try { sessionStorage.setItem(QUALITY_KEY, q) } catch { /* private mode */ }
  const next = pick(q)
  if (!next || next.url === current.value?.url) return
  // The viewer asked: switch, keeping their place.
  const at = el.value?.currentTime ?? 0
  const wasPlaying = !!el.value && !el.value.paused
  current.value = next
  await nextTick()
  if (el.value) {
    el.value.currentTime = at
    if (wasPlaying) void el.value.play().catch(() => {})
  }
}

function setTrack(i: string) {
  const tracks = el.value?.textTracks
  if (!tracks) return
  for (let n = 0; n < tracks.length; n++) tracks[n].mode = String(n) === i ? 'showing' : 'disabled'
}

function readTracks() {
  const tracks = el.value?.textTracks
  hasTracks.value = !!tracks && tracks.length > 0
  trackLabels.value = tracks ? Array.from(tracks).map((t) => t.label || t.language || 'Captions') : []
}

watch(() => props.sources, () => { current.value = pick(choice.value) })

onMounted(() => {
  readTracks()
  if (el.value && props.beaconUrl) {
    detach = trackPlayback(el.value, props.beaconUrl, () => current.value?.quality)
  }
})
onBeforeUnmount(() => { detach?.() })
defineExpose({ el, current })
</script>

<style scoped>
.mp { display: flex; flex-direction: column; gap: .4rem; }
.mp-media { width: 100%; max-height: 70vh; background: #000; border-radius: .3rem; }
audio.mp-media { background: transparent; }
.mp-bar { display: flex; gap: .8rem; justify-content: flex-end; font-size: .8rem; }
.mp-q { display: flex; gap: .3rem; align-items: center; }
</style>
