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
  Status & history for a MEDIA link (MEDIA_SHARE.md §10): what it plays, who
  watched and how much, and how much it has served.

  Watch tracking leads — for a one-to-one intro video "did they watch it?" is
  the only question being asked. Four labels stay honest in the unflattering
  direction:
    * coverage is the headline; "reached the end" is secondary, never the reverse;
    * completion shows its basis ("probably finished" is not "finished");
    * no playback data is NOT 0% watched;
    * there is no "delivered" — nothing here sends the mail.
-->
<template>
  <div class="mld">
    <p v-if="error" class="mld-err">{{ error }}</p>

    <!-- ── what it plays ─────────────────────────────────────────────── -->
    <p v-if="link.media_state === 'pending_media'" class="mld-state" data-test="preparing">
      Preparing a web-playable copy<template v-if="pct != null"> · {{ pct }}%</template>
      <template v-if="eta != null"> · about {{ duration(eta) }} left</template>.
      The link already works — viewers can open it, and it plays once this finishes.
    </p>
    <p v-else-if="link.media_state === 'failed'" class="mld-state mld-bad" data-test="failed">
      The web-playable copy could not be made.
      <template v-if="failure">{{ failure }}</template>
    </p>
    <p v-else class="mld-state">
      Playing the version from {{ versionLabel(link.media_version) }}.
      <span v-if="correcting" data-test="correcting">
        A corrected version is being prepared<template v-if="pct != null"> ({{ pct }}%)</template>;
        viewers see the previous one until it is ready.
      </span>
    </p>

    <!-- ── egress ────────────────────────────────────────────────────── -->
    <div class="mld-meter" data-test="egress">
      <span class="muted">Served</span>
      <div class="mld-bar"><span :style="{ width: egressPct + '%' }" :class="{ hot: egressPct >= 80 }" /></div>
      <span class="muted">{{ human(link.bytes_consumed) }} of {{ human(link.max_bytes) }}</span>
    </div>
    <p v-if="egressPct >= 80" class="mld-advise" data-test="publish-elsewhere">
      This link is close to its limit. FileEngine shares media with clients and
      prospects — it is not a video host. For a large audience, publish it on
      PeerTube (open source), YouTube or Vimeo and share that link instead.
    </p>

    <!-- ── audience ──────────────────────────────────────────────────── -->
    <template v-if="aud">
      <p v-if="!aud.tracking" class="muted" data-test="tracking-off">
        Playback tracking is disabled on this deployment, so there is no watch data.
      </p>
      <p v-if="aud.unverified_note" class="mld-note" data-test="unverified-note">
        {{ aud.unverified_note }}
      </p>

      <!-- open: no addresses — the aggregate, and the retention curve -->
      <template v-if="aud.mode === 'open'">
        <p class="mld-totals" data-test="open-totals">
          {{ aud.totals.viewers }} viewer{{ aud.totals.viewers === 1 ? '' : 's' }}
          · {{ aud.totals.completed }} finished · {{ human(aud.totals.bytes_served) }} served
          <template v-if="aud.totals.referers.length">
            · from {{ aud.totals.referers.join(', ') }}
          </template>
        </p>
        <svg
          v-if="aud.totals.retention.length"
          class="mld-curve"
          :viewBox="`0 0 ${aud.totals.retention.length} 100`"
          preserveAspectRatio="none"
          role="img"
          aria-label="How many viewers were still watching at each point"
          data-test="retention"
        >
          <polyline :points="curvePoints" />
        </svg>
      </template>

      <!-- verified / claimed: the people -->
      <ul v-else class="mld-list">
        <li v-for="r in roster" :key="r.email + r.first_seen_utc" class="mld-row" data-test="viewer">
          <div class="mld-who">
            <span>{{ r.email }}</span>
            <span v-if="!r.verified" class="mld-tag" title="Typed by the viewer; not checked">unverified</span>
            <span v-if="aud.mode === 'claimed' && r.on_allowlist" class="mld-tag ok">expected</span>
          </div>
          <CoverageBar v-if="r.has_playback" :bits="r.coverage_bits" :duration-ms="link.duration_ms" />
          <div class="mld-line" data-test="watch-line">{{ watchLine(r) }}</div>
        </li>
        <li v-if="!roster.length" class="muted" data-test="nobody">
          Nobody has opened this link yet.
        </li>
      </ul>

      <div class="mld-actions">
        <button class="mld-btn" data-test="export" @click="exportCsv">Export CSV</button>
        <button class="mld-btn" :disabled="flushing" data-test="flush" @click="flush">
          {{ flushing ? 'Updating…' : 'Update the file’s audience.csv now' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CoverageBar from '@/components/CoverageBar.vue'
import { shareService, type AudienceRow, type LinkAudience, type ShareLink } from '@/services/shareService'
import {
  etaSeconds, failureDetail, inProgress, mediaService, progressPct, type MediaState,
} from '@/services/mediaService'
import { errorMessage } from '@/services/apiClient'

const props = defineProps<{ link: ShareLink }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const aud = ref<LinkAudience | null>(null)
const media = ref<MediaState | null>(null)
const error = ref('')
const flushing = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const pct = computed(() => progressPct(media.value))
const eta = computed(() => etaSeconds(media.value))
const failure = computed(() => failureDetail(media.value))
/** A newer upload is encoding while the link keeps playing the older copy. */
const correcting = computed(() =>
  !!media.value && inProgress(media.value)
  && !!props.link.media_version && media.value.source_version !== props.link.media_version)

const egressPct = computed(() => {
  const max = props.link.max_bytes || 0
  return max ? Math.min(100, Math.round((100 * (props.link.bytes_consumed || 0)) / max)) : 0
})

/** Last seen first — "who looked most recently" is the question on opening this. */
const roster = computed<AudienceRow[]>(() =>
  [...(aud.value?.audience ?? [])].sort((a, b) => b.last_seen_utc.localeCompare(a.last_seen_utc)))

const curvePoints = computed(() =>
  (aud.value?.totals.retention ?? []).map((v, i) => `${i},${100 - v}`).join(' '))

function completionLabel(r: AudienceRow): string {
  if (!r.completed) return ''
  return {
    'beacon+bytes': 'finished',
    beacon: 'says finished (not confirmed)',
    'bytes-floor': 'probably finished',
    '': 'finished',
  }[r.completion_basis]
}

/** "watched 94% · reached the end · 2 plays · Tue 14:02 · mobile" */
function watchLine(r: AudienceRow): string {
  const when = new Date(r.last_seen_utc).toLocaleString(undefined, {
    weekday: 'short', hour: '2-digit', minute: '2-digit' })
  const parts: string[] = []
  if (!r.has_playback) {
    // Never "0%": a blocked beacon looks exactly like this.
    parts.push(r.completed ? completionLabel(r) : 'no playback data')
  } else {
    parts.push(`watched ${r.coverage_pct}%`)
    if (r.completed) parts.push(completionLabel(r))
    if (r.furthest_pct >= 99) parts.push('reached the end')
    else if (r.dropoff_seconds != null) parts.push(`stopped at ${clock(r.dropoff_seconds)}`)
    if (r.plays) parts.push(`${r.plays} play${r.plays === 1 ? '' : 's'}`)
  }
  parts.push(when)
  if (r.device_class) parts.push(r.device_class)
  return parts.join(' · ')
}

function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function duration(s: number): string {
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`
}

function versionLabel(v?: string | null): string {
  if (!v) return 'its first upload'
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/.exec(v)
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : v
}

function human(bytes?: number | null): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1 }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

async function load() {
  error.value = ''
  try {
    const [a, m] = await Promise.all([
      shareService.audience(props.link.link_uid),
      mediaService.state(props.link.resource_uid).catch(() => null),
    ])
    aud.value = a
    media.value = m
  } catch (e) {
    error.value = errorMessage(e, 'Could not load who watched this')
  }
  // Keep the preparing / correcting state fresh while something is encoding.
  if (timer) clearTimeout(timer)
  if (props.link.media_state === 'pending_media' || inProgress(media.value)) {
    timer = setTimeout(() => { emit('changed'); void load() }, 5000)
  }
}

async function exportCsv() {
  try {
    const blob = await shareService.audienceCsv(props.link.link_uid)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audience-${props.link.link_uid}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    error.value = errorMessage(e, 'Could not export the audience')
  }
}

async function flush() {
  flushing.value = true
  try {
    await shareService.flushAudience(props.link.link_uid)
  } catch (e) {
    error.value = errorMessage(e, 'Could not update audience.csv')
  } finally {
    flushing.value = false
  }
}

watch(() => props.link.link_uid, () => void load(), { immediate: true })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<style scoped>
.mld { padding: .4rem 0 .2rem 1rem; border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: .4rem; }
.mld-state { margin: 0; font-size: .8rem; }
.mld-bad { color: var(--danger); }
.mld-meter { display: flex; align-items: center; gap: .5rem; font-size: .75rem; }
.mld-bar { flex: 1; height: .4rem; background: var(--bg); border: 1px solid var(--border); border-radius: 2px; overflow: hidden; }
.mld-bar span { display: block; height: 100%; background: var(--primary); }
.mld-bar span.hot { background: var(--danger); }
.mld-advise, .mld-note { margin: 0; font-size: .75rem; color: var(--muted); }
.mld-totals { margin: 0; font-size: .8rem; }
.mld-curve { width: 100%; height: 3rem; background: var(--bg); border: 1px solid var(--border); }
.mld-curve polyline { fill: none; stroke: var(--primary); stroke-width: 2; vector-effect: non-scaling-stroke; }
.mld-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
.mld-row { display: flex; flex-direction: column; gap: .2rem; }
.mld-who { display: flex; gap: .4rem; align-items: center; font-size: .85rem; }
.mld-tag { font-size: .7rem; padding: 0 .3rem; border: 1px solid var(--border); border-radius: .25rem; color: var(--muted); }
.mld-tag.ok { color: var(--success); border-color: var(--success); }
.mld-line { font-size: .75rem; color: var(--muted); }
.mld-actions { display: flex; gap: .4rem; flex-wrap: wrap; }
.mld-btn {
  padding: .1rem .4rem; font-size: .75rem; cursor: pointer;
  border: 1px solid var(--border); border-radius: 4px; background: var(--card); color: var(--fg);
}
.mld-btn:hover:not(:disabled) { border-color: var(--primary); }
.mld-err { color: var(--danger); font-size: .8rem; }
.muted { color: var(--muted); font-size: .8rem; }
</style>
