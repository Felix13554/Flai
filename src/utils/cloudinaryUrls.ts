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


// ─── Video sets (made locally, uploaded from a zip) ───────────────────────────
//
// tools/video-versions makes every version on the Mac and packs it in a zip:
// 3 widths × 3 codecs = 9 videos (+ 2 posters). Admin unpacks the zip in the
// browser and uploads each file as a plain Cloudinary asset. A plain asset
// delivered in its own format with NO transformation is not a derived asset, so
// it costs no transformation credits — only storage and bandwidth.
//
// A video is a "set" when its public_id ends in VIDEO_SET_MARKER. The id alone
// tells every player which files exist, so no lookup is needed, and ids without
// the marker keep using the transformation URLs further down (legacy videos).
//
// Naming (dynamic folder mode: bare ids, no slashes):
//   <slug>--fs                 = the 1920 H.264 file (also the admin library entry)
//   <slug>--fs_<w>_<codec>     = every other video, w ∈ 720|1280|1920, codec ∈ vp9|hevc|h264
//   <slug>--fs_poster_<w>      = poster JPG (image asset), w ∈ 960|1920
// Keep this in sync with tools/video-versions/flai-video-versions.sh.
export const VIDEO_SET_MARKER = '--fs'
export type VideoSetCodec = 'vp9' | 'hevc' | 'h264'
export const VIDEO_SET_CODECS: readonly VideoSetCodec[] = ['vp9', 'hevc', 'h264']
export const VIDEO_SET_WIDTHS = [720, 1280, 1920] as const
export const VIDEO_SET_POSTER_WIDTHS = [960, 1920] as const
const VIDEO_SET_EXT: Record<VideoSetCodec, string> = { vp9: 'webm', hevc: 'mp4', h264: 'mp4' }
const VIDEO_SET_DERIVED_RE = /--fs_(?:\d+_(?:vp9|hevc|h264)|poster_\d+)$/

/** True for the root id of a video set (what the site stores as the video's id). */
export function isVideoSetId(publicId: string): boolean {
  return !!publicId && publicId.endsWith(VIDEO_SET_MARKER)
}

/** True for the helper assets of a set (every file except the root). */
export function isVideoSetDerivedId(publicId: string): boolean {
  return VIDEO_SET_DERIVED_RE.test(publicId || '')
}

/** "my clip" → "my_clip--fs" (idempotent). */
export function videoSetRootId(slug: string): string {
  const clean = slug.trim().replace(/[^A-Za-z0-9_-]/g, '_').replace(/-+$/, '') || 'video'
  return clean.endsWith(VIDEO_SET_MARKER) ? clean : `${clean}${VIDEO_SET_MARKER}`
}

export function videoSetFileId(root: string, width: number, codec: VideoSetCodec): string {
  return width === 1920 && codec === 'h264' ? root : `${root}_${width}_${codec}`
}

export function videoSetPosterId(root: string, width: number): string {
  return `${root}_poster_${width}`
}

export function videoSetVideoUrl(root: string, width: number, codec: VideoSetCodec): string {
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${videoSetFileId(root, width, codec)}.${VIDEO_SET_EXT[codec]}`
}

export function videoSetPosterUrl(root: string, width: number, stamp = 0): string {
  const base = `https://res.cloudinary.com/${CLOUD}/image/upload/${videoSetPosterId(root, width)}.jpg`
  return stamp > 0 ? `${base}?v=${stamp}` : base
}

/** Every public_id a set consists of (videos first, posters last) — for delete. */
export function videoSetAllIds(root: string): { videos: string[]; posters: string[] } {
  const videos: string[] = []
  for (const w of VIDEO_SET_WIDTHS) for (const c of VIDEO_SET_CODECS) videos.push(videoSetFileId(root, w, c))
  return { videos, posters: VIDEO_SET_POSTER_WIDTHS.map((w) => videoSetPosterId(root, w)) }
}

// ─── Codec choice (per browser, decided once) ─────────────────────────────────
//
// Smallest file the browser can play well:
//   • Safari / every iOS browser → HEVC (hardware decoded on Apple silicon, ~half the bytes of H.264)
//   • everything else that plays VP9 → VP9 WebM (Chrome, Edge, Firefox, Android)
//   • anything else → H.264, which plays everywhere
// This is the choice Cloudinary's f_auto made, now made in the browser.
//
// If a file of the chosen codec then fails to decode or load, reportVideoFormatError()
// pins this device to H.264 for good (localStorage), so a broken codec never costs
// a visitor more than one failed attempt.
const CODEC_FLOOR_KEY = 'flai:video-codec-floor'
let _codec: VideoSetCodec | null = null

function isAppleWebKit(): boolean {
  const ua = navigator.userAgent || ''
  if (/iP(hone|ad|od)/.test(ua)) return true                                   // all iOS browsers use WebKit
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true  // iPadOS asking for desktop
  return /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/.test(ua)
}

function detectVideoCodec(): VideoSetCodec {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return 'h264'
  try {
    if (localStorage.getItem(CODEC_FLOOR_KEY) === 'h264') return 'h264'
  } catch { /* storage blocked — fine */ }
  try {
    const v = document.createElement('video')
    const can = (type: string) => v.canPlayType(type) === 'probably'
    if (isAppleWebKit() && can('video/mp4; codecs="hvc1"')) return 'hevc'
    if (can('video/webm; codecs="vp9"')) return 'vp9'
  } catch { /* fall through */ }
  return 'h264'
}

export function pickVideoCodec(): VideoSetCodec {
  if (_codec === null) _codec = detectVideoCodec()
  return _codec
}

/**
 * Call from a <video> `error` handler BEFORE rebuilding the URL. If the file was a
 * VP9/HEVC one and the browser could not decode/load it (MEDIA_ERR_DECODE or
 * MEDIA_ERR_SRC_NOT_SUPPORTED), every URL built from now on is H.264.
 * Returns true when it switched, so the caller can retry straight away.
 */
export function reportVideoFormatError(video?: { error?: { code?: number } | null }): boolean {
  const code = video?.error?.code
  if (code !== undefined && code !== 3 && code !== 4) return false  // network errors are not codec errors
  if (pickVideoCodec() === 'h264') return false
  _codec = 'h264'
  try { localStorage.setItem(CODEC_FLOOR_KEY, 'h264') } catch { /* ignore */ }
  return true
}

export function cloudinaryHlsUrl(publicId: string): string {
  // Sets have no HLS stream: the best plain file stands in (used for admin preview/copy).
  if (isVideoSetId(publicId)) return videoSetVideoUrl(publicId, 1920, 'h264')
  return `https://res.cloudinary.com/${CLOUD}/video/upload/sp_auto/${publicId}.m3u8`
}

export function cloudinaryMp4Url(publicId: string): string {
  if (isVideoSetId(publicId)) return videoSetVideoUrl(publicId, 1920, 'h264')
  return `https://res.cloudinary.com/${CLOUD}/video/upload/vc_h264/f_mp4/q_auto:good/${publicId}.mp4`
}

export function cloudinaryWebmUrl(publicId: string): string {
  if (isVideoSetId(publicId)) return videoSetVideoUrl(publicId, 1920, 'vp9')
  return `https://res.cloudinary.com/${CLOUD}/video/upload/vc_vp9/f_webm/q_auto:good/${publicId}.webm`
}

export function cloudinaryPosterUrl(
  publicId: string,
  requestedWidth = 1920,
  _quality       = 'good',
  stamp          = 0,
): string {
  // COST: every distinct poster URL is its own derived asset on Cloudinary
  // (and, because it starts from `vc_h264`, a video transformation). Callers
  // used to ask for 320 / 480 / 960 / 1920 wide, i.e. up to four posters per
  // video. Whatever width is requested is now snapped to one of TWO sizes, so a
  // video never has more than two posters: 960 eco (phones, admin thumbnails,
  // srcset candidates up to 960w) and 1920 good (everything wider). `_quality`
  // is kept only so existing call sites compile; the bucket decides it.
  const small   = requestedWidth <= 960
  const width   = small ? 960 : 1920
  // Video sets carry their two posters as plain image assets: no transformation.
  if (isVideoSetId(publicId)) return videoSetPosterUrl(publicId, width, stamp)
  const quality = small ? 'eco' : 'good'
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
// Two different costs are in play, and they pull in opposite directions:
//   • bandwidth credits  → smaller files per view (resolution cap, codec, q_auto)
//   • transformation credits → FEWER DISTINCT URLs per video, because every
//     distinct (video × transformation chain × delivered format) is a separate
//     derived asset that Cloudinary transcodes — and bills — once.
//
// This file is tuned to keep the second number as small as possible while still
// capping the first:
//   • ONE delivered format (H.264 MP4, plays everywhere). `f_auto` used to be
//     here; it makes Cloudinary build a separate asset per browser family
//     (WebM/VP9 for Chrome+Firefox, HEVC or H.264 for Safari, AV1 …), so each
//     size below was really 2–4 transcodes.
//   • ONE URL per size, shared by hero and players. The hero used `ac_none`
//     (no audio) and the players kept audio, which made every size two assets.
//     The audio track of a short loop is a few percent of the bytes, so the
//     hero now just plays the same file as the players (the element is muted).
//   • THREE sizes (720 / 1280 / 1920). The old `mobile` (810) and the
//     `eco` quality on `small` are folded into the 720 `good` asset.
//
// So a video is at most 3 derived assets (it was up to ~20), plus 2 posters.
// Tune a width here → also change TIERS in api/_lib/cloudinaryWarm.js.
const HERO_TIERS = {
  /** Portrait phones, Data Saver and 2g/3g. 720 wide = a 720x1280 vertical frame. */
  small:  { width: 720,  quality: 'good' },
  /**
   * Same numbers as `small` ON PURPOSE: identical params give an identical URL,
   * i.e. the very same derived asset (no extra transformation). The name stays
   * so heroVideoTier()/playerVideoTier() callers keep working unchanged.
   */
  mobile: { width: 720,  quality: 'good' },
  /** Phone landscape, tablets, laptops and most desktops. */
  medium: { width: 1280, quality: 'good' },
  /** Wide desktops (> 1600 CSS px). */
  large:  { width: 1920, quality: 'good' },
} as const

export type HeroVideoTier = keyof typeof HERO_TIERS

/**
 * Widths/qualities of the f_auto URLs that were warmed up before the cost cut
 * (see git history of this file before e8774bc). Used ONLY for videos that have no
 * Flai-versions set. Video sets use HERO_TIERS above.
 */
const LEGACY_TIERS: Record<HeroVideoTier, { width: number; quality: string }> = {
  small:  { width: 720,  quality: 'eco'  },
  mobile: { width: 810,  quality: 'good' },
  medium: { width: 1280, quality: 'good' },
  large:  { width: 1920, quality: 'good' },
}

// ─── Stall-driven downgrade (downgrade-only, per page session) ────────────────
//
// The Network Information API only exists in Chromium (iPhones/Safari and
// Firefox report nothing), and `effectiveType` is a coarse guess. The reliable
// signal that a connection can't keep up with the chosen tier is the video
// itself stalling and having to reconnect. After STALLS_BEFORE_DOWNGRADE such
// reconnects, every URL built from then on (the current video's retry, the
// next carousel video, prefetches, the product/portfolio players) uses the
// small tier.
//
// This can ONLY move toward lower bandwidth: a fast connection never raises a
// tier, so a phone on 5G still gets its phone-sized file, never a bigger one.
// It resets on a full page reload, so a one-off bad moment isn't permanent.
const STALLS_BEFORE_DOWNGRADE = 2
let _stallReconnects = 0
let _forceSmallTier = false

/**
 * Call when playback had to reconnect because of a stall (not a hard error).
 * Returns true the moment this tips the session over to the small tier, so the
 * caller can reload with the lighter URL.
 */
export function reportVideoStall(): boolean {
  if (_forceSmallTier) return false
  _stallReconnects += 1
  if (_stallReconnects >= STALLS_BEFORE_DOWNGRADE) {
    _forceSmallTier = true
    return true
  }
  return false
}

/**
 * Picks the hero delivery tier from the CURRENT connection and viewport.
 * Evaluated when a URL is built (never at import time, so this module stays
 * side-effect-free). Playback, prefetch and the load-before-switch preload all
 * go through `cloudinaryHeroMp4Url`, so they resolve to the same URL on the
 * same device and share one cached response.
 */
export function heroVideoTier(): HeroVideoTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'medium'
  if (_forceSmallTier) return 'small'

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
// Both builders below return the SAME URL for the same tier, built as:
//   • vc_h264      → pinned codec, f_mp4 → pinned container: one delivered format
//   • c_limit,w_N  → never wider than the device tier (and never upscales)
//   • q_auto:<q>   → quality (all tiers are `good`, see HERO_TIERS)
//
// Each (video × tier) is transcoded once, on its first request, and cached on
// Cloudinary's CDN afterwards. Keep this chain identical to variantUrl() in
// api/_lib/cloudinaryWarm.js, or the warm-up builds assets nobody requests.

function optimizedVideoUrl(publicId: string, tier: HeroVideoTier, audio: boolean): string {
  // Video set: the pre-made file for this width in this browser's best codec.
  // No transformation involved, so nothing is billed on delivery.
  if (isVideoSetId(publicId)) {
    return videoSetVideoUrl(publicId, HERO_TIERS[tier].width, pickVideoCodec())
  }
  // No set (older upload, or a single file): the f_auto URLs this site used before
  // the cost cut. Cloudinary picks the format per browser (VP9 WebM / HEVC / H.264),
  // and these exact URLs are the ones that were already warmed up for old videos, so
  // they are served from the CDN instead of being transcoded again. Keep the chain
  // byte-for-byte identical to the old one, or it becomes a new (billed) asset.
  const { width, quality } = LEGACY_TIERS[tier]
  return (
    `https://res.cloudinary.com/${CLOUD}/video/upload/` +
    `c_limit,w_${width}/` +
    (audio ? '' : 'ac_none/') +
    `f_auto/q_auto:${quality}/${publicId}.mp4`
  )
}

/** Hero loop: video sets use the pre-made file; older videos the audio-free f_auto URL. */
export function cloudinaryHeroMp4Url(publicId: string, tier: HeroVideoTier = heroVideoTier()): string {
  return optimizedVideoUrl(publicId, tier, false)
}

/**
 * Product / portfolio / preview players: video sets use the pre-made file; older
 * videos the f_auto URL WITH audio (the visitor starts these with sound).
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
