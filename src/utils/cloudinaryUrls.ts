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

export const CLOUD = 'dq6jxbyrg'

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

// ─── Hero video delivery ──────────────────────────────────────────────────────
//
// The autoplaying hero is a muted, looping background — it never needs the
// source resolution or an audio track. `cloudinaryMp4Url` above applies NO size
// cap, so every device (a phone included) used to download the video at
// whatever resolution was uploaded. That is the single biggest driver of
// Cloudinary bandwidth credits, so the hero (and ONLY the hero — the product /
// portfolio players keep `cloudinaryMp4Url`, they play with sound on demand)
// uses this builder instead:
//   • c_limit,w_N   → never wider than the tier below (and never upscales)
//   • ac_none       → strips the audio track (the element is muted anyway)
//   • q_auto:<q>    → eco on the small tier, good everywhere else
//
// Every tier is a separate derived asset on Cloudinary, so keep the tier list
// short: each (video × tier) is transcoded once, on its first request.
const HERO_TIERS = {
  /** Data Saver and 2g/3g connections only — deliberately small and soft. */
  small:  { width: 720,  quality: 'eco'  },
  /**
   * Portrait phones. A phone screen is ~1170 physical pixels wide, so 720 was
   * stretched ~1.6x and `eco` added blockiness on top — the hero looked soft.
   * 1080 wide at `good` is sharp on a phone without paying for a 1920 file.
   */
  mobile: { width: 1080, quality: 'good' },
  /** Phone landscape, tablets, laptops and most desktops. */
  medium: { width: 1280, quality: 'good' },
  /** Wide desktops (> 1600 CSS px). */
  large:  { width: 1920, quality: 'good' },
} as const

export type HeroVideoTier = keyof typeof HERO_TIERS

/**
 * Picks the hero delivery tier from the CURRENT connection and viewport.
 * Evaluated when a URL is built (never at import time, so this module stays
 * side-effect-free). Playback, prefetch and the load-before-switch preload all
 * go through `cloudinaryHeroMp4Url`, so they resolve to the same URL on the
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

// ─── Optimized delivery (hero + product/portfolio/preview players) ───────────
//
// Both builders below share ONE pipeline:
//   • c_limit,w_N  → never wider than the device tier (and never upscales)
//   • f_auto       → Cloudinary picks the most efficient codec the requesting
//                    browser can play (VP9 WebM / AV1 / HEVC MP4 on Safari, with
//                    H.264 MP4 as the fallback) instead of forcing H.264 for
//                    everybody. This is typically 30-50 % smaller at the same
//                    visual quality. f_auto and q_auto must be separate
//                    slash-delimited components (not comma-joined).
//   • q_auto:<q>   → eco on the small tier, good everywhere else
//
// No vc_h264 any more: pinning the codec is exactly what blocked f_auto.
// Each (video × tier × delivered format) is transcoded once, on its first
// request, and cached on Cloudinary's CDN afterwards.

function optimizedVideoUrl(publicId: string, tier: HeroVideoTier, audio: boolean): string {
  const { width, quality } = HERO_TIERS[tier]
  return (
    `https://res.cloudinary.com/${CLOUD}/video/upload/` +
    `c_limit,w_${width}/` +
    (audio ? '' : 'ac_none/') +
    `f_auto/q_auto:${quality}/${publicId}.mp4`
  )
}

/** Hero loop: tiered, auto-format, audio stripped (the element is muted). */
export function cloudinaryHeroMp4Url(publicId: string, tier: HeroVideoTier = heroVideoTier()): string {
  return optimizedVideoUrl(publicId, tier, false)
}

/**
 * Product / portfolio / preview players: same tiers and auto-format as the
 * hero, but WITH audio — the visitor starts these videos themselves, with sound.
 */
export function cloudinaryPlayerVideoUrl(publicId: string, tier: HeroVideoTier = playerVideoTier()): string {
  return optimizedVideoUrl(publicId, tier, true)
}

/**
 * Players sit in a small 16:9 box and start on a tap, so portrait phones keep
 * the lighter 720 tier (only the full-screen hero gets the sharper `mobile` one).
 */
export function playerVideoTier(): HeroVideoTier {
  const tier = heroVideoTier()
  return tier === 'mobile' ? 'small' : tier
}
