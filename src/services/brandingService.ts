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

// White-label overrides, read at RUNTIME from /branding.json on the SPA's own
// origin.
//
// Runtime and not build-time, because the SPA image is built once and deployed
// to many places: a VITE_ variable would mean a rebuild and a separate image per
// customer, which is the thing white-labelling is supposed to avoid. A
// deployment drops in a file (the nginx image renders one from environment) and
// the same image serves it.
//
// Absent or unreadable means the stock product, not a broken one: every field is
// optional and anything missing falls back to the FileEngine defaults.

export interface Palette {
  fg?: string
  muted?: string
  border?: string
  bg?: string
  card?: string
  primary?: string
  primaryHover?: string
  danger?: string
  success?: string
}

export interface LoginBranding {
  /**
   * Full-bleed media behind the sign-in card. An image, or a video to loop.
   * Same-origin path (or a data: image); see safeMediaUrl.
   */
  backgroundUrl: string
  /**
   * Still shown before a video has any frames to paint, and INSTEAD of the
   * video for anyone who has asked their system for reduced motion.
   */
  posterUrl: string
  /**
   * Scrim painted over the media, under the card. A photograph behind a form is
   * the classic way to make a password field unreadable; this is what keeps the
   * text legible over whatever the deployment chose.
   */
  overlay: string
}

export interface Branding {
  /** Shown at the left of the main navigation and on the sign-in page. */
  appName: string
  /** Optional mark shown beside the name. Same-origin path or data: URI. */
  iconUrl: string
  /** Browser tab / window title. Defaults to appName when not given. */
  title: string
  light: Palette
  dark: Palette
  login: LoginBranding
}

export const DEFAULT_LOGIN: LoginBranding = {
  backgroundUrl: '',
  posterUrl: '',
  // Only ever painted when there is media under it, so this default costs a
  // deployment nothing until it sets a background.
  overlay: 'rgba(0, 0, 0, 0.45)',
}

export const DEFAULT_BRANDING: Branding = {
  appName: 'FileEngine',
  iconUrl: '',
  title: 'FileEngine',
  light: {},
  dark: {},
  login: DEFAULT_LOGIN,
}

// The CSS custom property each palette key drives, matching App.vue's :root.
export const PALETTE_VARS: Record<keyof Palette, string> = {
  fg: '--fg',
  muted: '--muted',
  border: '--border',
  bg: '--bg',
  card: '--card',
  primary: '--primary',
  primaryHover: '--primary-hover',
  danger: '--danger',
  success: '--success',
}

// A colour, or nothing.
//
// These values are interpolated into a stylesheet, so they are validated rather
// than trusted. branding.json is deployment-controlled and therefore about as
// trusted as the app itself — but "about as trusted" is not a reason to
// concatenate an arbitrary string into CSS, where `red; } html { display: none`
// closes the rule and writes its own. Accepting only colour syntax makes the
// injection impossible rather than unlikely.
const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9a-z\s.,%/-]+\)|[a-z]{3,20})$/i

export function safeColour(v: unknown): string {
  const s = String(v ?? '').trim()
  return s && s.length <= 64 && COLOUR.test(s) ? s : ''
}

// Same-origin paths and data: URIs only.
//
// An off-site logo URL would be a request to a third party on every page load —
// which is a privacy leak a white-label customer is unlikely to want and did not
// ask for — and `javascript:` has no business in an <img> even though browsers
// will not run it there.
export function safeIconUrl(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s || s.length > 4096) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);/i.test(s)) return s
  return ''
}

// Background media: same-origin paths, plus data: images for something small.
//
// Same rule as the logo, and for the same reason — an off-site background is a
// third-party request on every visit to the sign-in page, which is the one page
// that is reachable without an account. Deliberately no data: video: a video
// small enough to inline is not a video worth looping, and the base64 would sit
// in the branding file every request pays for.
export function safeMediaUrl(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s || s.length > 4096) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (/^data:image\/(png|jpeg|gif|webp|avif);/i.test(s)) return s
  return ''
}

const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i

/** Whether a background URL should be played or shown. */
export function mediaKind(url: string): 'video' | 'image' | 'none' {
  if (!url) return 'none'
  // Query and fragment stripped first: a cache-buster like `?v=3` would
  // otherwise make every video look like an image and render in an <img>, which
  // fails silently as a broken-image icon behind the sign-in form.
  const path = url.split(/[?#]/)[0]
  return VIDEO_EXT.test(path) ? 'video' : 'image'
}

function login(raw: unknown): LoginBranding {
  const src = (raw ?? {}) as Record<string, unknown>
  return {
    backgroundUrl: safeMediaUrl(src.backgroundUrl),
    posterUrl: safeMediaUrl(src.posterUrl),
    overlay: safeColour(src.overlay) || DEFAULT_LOGIN.overlay,
  }
}

function palette(raw: unknown): Palette {
  const src = (raw ?? {}) as Record<string, unknown>
  const out: Palette = {}
  for (const key of Object.keys(PALETTE_VARS) as Array<keyof Palette>) {
    const c = safeColour(src[key])
    if (c) out[key] = c
  }
  return out
}

export function normalise(raw: unknown): Branding {
  const src = (raw ?? {}) as Record<string, unknown>
  const appName = String(src.appName ?? '').trim().slice(0, 64) || DEFAULT_BRANDING.appName
  return {
    appName,
    iconUrl: safeIconUrl(src.iconUrl),
    // A deployment that renames the app almost always wants the tab to match,
    // so the title follows the name unless it is given separately.
    title: String(src.title ?? '').trim().slice(0, 64) || appName,
    light: palette(src.light),
    dark: palette(src.dark),
    login: login(src.login),
  }
}

let cached: Promise<Branding> | null = null

export const brandingService = {
  // Fetched with plain fetch(), not the API client: this is static chrome on the
  // SPA's own origin, needed before anyone has signed in, and it must not carry
  // or require a token.
  load(): Promise<Branding> {
    if (!cached) {
      // Wrapped so that a synchronous throw — no fetch in the environment at
      // all — lands in the same catch as a network failure and yields the
      // defaults, rather than taking the app root down with it.
      cached = Promise.resolve()
        .then(() => fetch('/branding.json', { cache: 'no-cache' }))
        // Content-type checked, not just the status. The SPA's nginx answers an
        // unknown path with index.html and HTTP 200, so a deployment with no
        // branding file gets a 200 whose body is markup — r.json() would reject
        // and the catch would cover it, but only by accident. Requiring JSON
        // says the actual rule: a file, or the defaults.
        .then((r) =>
          r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null,
        )
        .then((raw) => (raw ? normalise(raw) : DEFAULT_BRANDING))
        .catch(() => DEFAULT_BRANDING)
    }
    return cached
  },

  /** Test seam. */
  reset() {
    cached = null
  },
}
