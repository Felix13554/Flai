/**
 * cloudinaryUrls.ts
 *
 * Side-effect-free Cloudinary URL builders — the single source of truth for
 * how Flai turns a Cloudinary public_id into playable/poster URLs.
 *
 * These were extracted verbatim from heroPreload.ts (which re-exports them,
 * so every existing import keeps working unchanged). They live here so that
 * pages OTHER than the homepage (Portfolio, Products, Preview, …) can use the
 * exact same URL construction as the hero video WITHOUT importing
 * heroPreload.ts, whose module-init injects hero <link rel="preload"> hints.
 */

import {
  CLOUD,
  CROP_TIERS,
  CROP_BUCKETS,
  variantUrl,
  type HeroVideoTier,
  type VideoFormat,
} from './cloudinaryVariantSpec'

export { CLOUD }
export type { HeroVideoTier, VideoFormat }

/**
 * extractCloudinaryPublicId(url)
 *
 * Pulls the bare public_id out of a full Cloudinary delivery URL, so callers
 * (e.g. the hero project carousel) can store a normal Cloudinary URL in their
 * data and still feed HeroVideoSection the public_id it actually needs.
 *
 * Strips, in order:
 *   1. Everything up to and including `/upload/`.
 *   2. Any leading transformation segments (e.g. `vc_h264`, `f_mp4`,
 *      `q_auto:good`, `sp_auto`, or a comma-joined group like
 *      `c_fill,w_500,h_300`) and a leading version segment (`v123456`).
 *      Each is recognized by Cloudinary's own `letters_value` transformation
 *      syntax, not by a fixed whitelist, so any transformation chain is
 *      stripped correctly — this previously only handled the version
 *      segment and silently left transformation folders (e.g. `sp_auto/`)
 *      stuck onto the front of the id, producing a public_id that could
 *      never resolve (404) even though the URL "looked" close enough.
 *   3. The file extension and any query string on the final segment.
 *
 * Falls back to returning the input unchanged if it doesn't look like a
 * Cloudinary delivery URL (so a bare public_id can be passed straight through).
 */
function isCloudinaryTransformSegment(segment: string): boolean {
  if (/^v\d+$/.test(segment)) return true
  // A transformation segment is one or more comma-joined `letters_value`
  // params (Cloudinary's short transformation codes: vc_, f_, q_, sp_,
  // c_, w_, h_, g_, …). A real public_id segment never matches this shape.
  return segment.split(',').every((part) => /^[a-z]{1,4}_[\w:.+-]*$/i.test(part))
}

export function extractCloudinaryPublicId(url: string): string {
  const uploadMatch = url.match(/\/upload\/(.+)$/)
  if (!uploadMatch) return url

  const pathAfterUpload = uploadMatch[1].split(/[?#]/)[0]
  const segments = pathAfterUpload.split('/')

  // Skip leading transformation/version segments — stop at the first
  // segment that isn't one, since transformations only ever appear as a
  // contiguous block right after `/upload/`. `length - 1` guard ensures
  // the final (filename) segment is never itself treated as a
  // transformation, even if it happens to match the shape.
  let i = 0
  while (i < segments.length - 1 && isCloudinaryTransformSegment(segments[i])) i++

  const idSegments = segments.slice(i)
  if (idSegments.length === 0) return url

  const last = idSegments[idSegments.length - 1]
  const dotIndex = last.lastIndexOf('.')
  idSegments[idSegments.length - 1] = dotIndex > 0 ? last.slice(0, dotIndex) : last

  return idSegments.join('/')
}

export function cloudinaryHlsUrl(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/sp_auto/${publicId}.m3u8`
}

export function cloudinaryMp4Url(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/vc_h264/f_mp4/q_auto:good/${publicId}.mp4`
}

export function cloudinaryWebmUrl(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/vc_vp9/f_webm/q_auto:good/${publicId}.webm`
}

export function cloudinaryPosterUrl(
  publicId: string,
  width    = 1920,
  quality  = 'good',
  stamp    = 0,
): string {
  // Root cause of the poster/video crop mismatch: this used to extract the
  // still directly from the RAW source (`c_fill,g_auto,w_${width},so_0`),
  // a completely separate transformation pipeline from the one the <video>
  // element actually plays (`vc_h264/f_mp4/...` in cloudinaryMp4Url). Two
  // independent pipelines can apply the source's rotation/orientation
  // metadata differently, so the still and the video ended up with
  // different effective aspect ratios — which then get object-fit:cover'd
  // differently, producing a visible jump when the video takes over.
  //
  // Also, `c_fill,g_auto` was a no-op the whole time: Cloudinary's `fill`
  // crop mode only actually crops when BOTH width and height are given —
  // with only a width it silently falls back to a plain aspect-preserving
  // resize, so no gravity-based cropping was ever happening.
  //
  // Fix: derive the still from the SAME processed asset the video plays
  // (`vc_h264` first), so orientation/aspect ratio are guaranteed to match
  // pixel-for-pixel, then extract the frame and resize by width only.
  const base =
    `https://res.cloudinary.com/${CLOUD}/video/upload/` +
    `vc_h264/so_0/f_jpg/q_auto:${quality},w_${width}/${publicId}.jpg`
  return stamp > 0 ? `${base}?v=${stamp}` : base
}

// ─── Video delivery (hero + product/portfolio/preview players) ───────────────
//
// Every delivery URL is built by `variantUrl` from cloudinaryVariantSpec.js —
// the SAME module the Vercel function (api/cloudinary-eager.js) uses to decide
// which variants to pre-create after an upload. So whatever URL the site asks
// for already exists on Cloudinary's CDN, and nobody waits for a transcode.
//
// There is deliberately NO `f_auto` any more: Cloudinary only creates f_auto
// variants when a browser asks for them (once per browser family), which means
// they can never be pre-created. Instead the format is chosen here, in
// `preferredVideoFormat()`, with the same codec families f_auto would pick:
// WebM/VP9 (Chrome, Edge, Firefox, Android), HEVC (Safari/iOS), H.264 fallback.
//
// The hero (and ONLY the hero) additionally strips the audio track (ac_none)
// and, on a portrait phone, crops the landscape video to the visible strip.

let _format: VideoFormat | null = null

/**
 * The best format THIS browser can play. Cached for the page's lifetime.
 * Order: HEVC on Apple devices (hardware decode, smallest files there) →
 * VP9 WebM wherever it plays → H.264 MP4 for everything else.
 */
export function preferredVideoFormat(): VideoFormat {
  if (_format) return _format
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return 'h264'

  const el = document.createElement('video')
  const can = (type: string) => {
    try {
      const r = el.canPlayType(type)
      return r === 'probably' || r === 'maybe'
    } catch {
      return false
    }
  }

  const ua = navigator.userAgent || ''
  const isApple =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1) ||
    (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Android|Edg|OPR/.test(ua))

  if (isApple && can('video/mp4; codecs="hvc1.1.6.L93.B0"')) _format = 'hevc'
  else if (can('video/webm; codecs="vp9"')) _format = 'webm'
  else _format = 'h264'
  return _format
}

/** Cropped variants exist for the phone sizes only (see CROP_TIERS). */
function isCropTier(tier: HeroVideoTier): tier is 'small' | 'mobile' {
  return tier in CROP_TIERS
}

/** Nearest aspect-ratio bucket to the current viewport (portrait phones). */
export function heroCropBucket(): string {
  const fallback = '9-16'
  if (typeof window === 'undefined') return fallback
  const w = window.innerWidth
  const h = window.innerHeight
  if (!w || !h) return fallback
  const ratio = w / h
  let best = CROP_BUCKETS[0]
  for (const b of CROP_BUCKETS) {
    if (Math.abs(Math.log(ratio / b.ratio)) < Math.abs(Math.log(ratio / best.ratio))) best = b
  }
  return best.id
}

/**
 * Picks the hero delivery tier from the CURRENT connection and viewport.
 * Evaluated when a URL is built (never at import time, so this module stays
 * side-effect-free). Playback, prefetch and the load-before-switch preload all
 * go through the same builders, so they resolve to the same URL on the
 * same device and share one cached response.
 */
export function heroVideoTier(): HeroVideoTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'medium'

  const conn =
    (navigator as any).connection ??
    (navigator as any).mozConnection ??
    (navigator as any).webkitConnection
  const type = conn?.effectiveType
  if (conn?.saveData === true || type === 'slow-2g' || type === '2g' || type === '3g') {
    return 'small'
  }

  const w = window.innerWidth
  const h = window.innerHeight
  // Same test the app uses for "portrait phone" (see isPortraitMobileNow).
  if (w < 768 && h > w) return 'mobile'

  return w > 1600 ? 'large' : 'medium'
}

/**
 * Players sit in a small 16:9 box and start on a tap, so portrait phones keep
 * the lighter 720 tier (only the full-screen hero gets the sharper `mobile` one).
 */
export function playerVideoTier(): HeroVideoTier {
  const tier = heroVideoTier()
  return tier === 'mobile' ? 'small' : tier
}

export interface HeroSourceOptions {
  /**
   * Crop the landscape video to the strip a portrait phone actually shows.
   * Pass true ONLY for a landscape video on a portrait phone (not for the
   * dedicated vertical cut, which is already vertical).
   */
  crop?: boolean
}

/**
 * Ordered list of hero URLs to try. The first is the best one; each following
 * entry is a fallback used if the browser can't load the previous one.
 * A failed FORMAT (e.g. HEVC not playable) must not cost the other savings, so
 * H.264 is tried with the same crop / tier / no-audio / q_auto first:
 *   1. preferred format, cropped   (only when `crop` and the tier has a crop)
 *   2. H.264, cropped              (same crop, only the codec differs)
 *   3. preferred format, uncropped (in case Cloudinary rejects the crop)
 *   4. H.264, uncropped            (works everywhere)
 * Duplicates are removed (e.g. when the preferred format already is H.264).
 */
export function cloudinaryHeroSources(
  publicId: string,
  tier: HeroVideoTier = heroVideoTier(),
  opts: HeroSourceOptions = {},
): string[] {
  const format = preferredVideoFormat()
  const formats: VideoFormat[] = format === 'h264' ? ['h264'] : [format, 'h264']
  const urls: string[] = []
  if (opts.crop && isCropTier(tier)) {
    const crop = heroCropBucket()
    for (const f of formats) urls.push(variantUrl(publicId, { role: 'hero', tier, format: f, crop }))
  }
  for (const f of formats) urls.push(variantUrl(publicId, { role: 'hero', tier, format: f }))
  return urls
}

/** Hero loop: the best URL for this device (see cloudinaryHeroSources). */
export function cloudinaryHeroMp4Url(
  publicId: string,
  tier: HeroVideoTier = heroVideoTier(),
  opts: HeroSourceOptions = {},
): string {
  return cloudinaryHeroSources(publicId, tier, opts)[0]
}

/**
 * Product / portfolio / preview players: same tiers as the hero, but WITH
 * audio — the visitor starts these videos themselves, with sound.
 * Ordered like cloudinaryHeroSources, minus the crop.
 */
export function cloudinaryPlayerSources(
  publicId: string,
  tier: HeroVideoTier = playerVideoTier(),
): string[] {
  const format = preferredVideoFormat()
  const urls = [variantUrl(publicId, { role: 'player', tier, format })]
  if (format !== 'h264') urls.push(variantUrl(publicId, { role: 'player', tier, format: 'h264' }))
  return urls
}

export function cloudinaryPlayerVideoUrl(
  publicId: string,
  tier: HeroVideoTier = playerVideoTier(),
): string {
  return cloudinaryPlayerSources(publicId, tier)[0]
}
