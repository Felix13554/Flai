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
