/**
 * cloudinaryVariantSpec.js
 *
 * ONE source of truth for every video variant Flai delivers from Cloudinary.
 *
 * It is plain ESM JavaScript (not TypeScript) on purpose, so that BOTH sides
 * can import the very same file:
 *   - the browser (src/utils/cloudinaryUrls.ts builds the delivery URLs from it)
 *   - the Vercel function (api/cloudinary-eager.js builds the list of variants
 *     to pre-create from it)
 * Because both use `variantPath()`, the URL the site requests and the variant
 * Cloudinary pre-creates are the same string — they cannot drift apart.
 *
 * Why no `f_auto`: Cloudinary only creates an f_auto variant when a browser
 * asks for it, once per browser family, so it can never be pre-created. The
 * site therefore picks the format itself (see preferredVideoFormat in
 * cloudinaryUrls.ts) and every format below can be generated up front.
 */

export const CLOUD = 'dq6jxbyrg'

/** Delivery formats. `ext` is the URL extension, `path` the codec/format part. */
export const VIDEO_FORMATS = {
  webm: { ext: 'webm', path: 'vc_vp9/f_webm' },   // Chrome, Edge, Firefox, Android
  hevc: { ext: 'mp4',  path: 'vc_h265/f_mp4' },   // Safari / iOS (hardware decode)
  h264: { ext: 'mp4',  path: 'vc_h264/f_mp4' },   // universal fallback
}

/** Order variants are pre-created in: most common first. */
export const FORMAT_ORDER = ['webm', 'hevc', 'h264']

/** Width-limited tiers (never upscaled, thanks to c_limit). */
export const HERO_TIERS = {
  /** Data Saver and 2g/3g connections only — deliberately small and soft. */
  small:  { width: 720,  quality: 'eco'  },
  /** Portrait phones (when the video is NOT cropped). */
  mobile: { width: 1080, quality: 'good' },
  /** Phone landscape, tablets, laptops and most desktops. */
  medium: { width: 1280, quality: 'good' },
  /** Wide desktops (> 1600 CSS px). */
  large:  { width: 1920, quality: 'good' },
}

/** Players start on a tap in a small 16:9 box, so they never use `mobile`. */
export const PLAYER_TIER_NAMES = ['small', 'medium', 'large']

/**
 * Portrait-phone crop. On a portrait phone the hero is screen-sized with
 * object-fit: cover, so a landscape video only ever shows a centre strip.
 * These variants crop that strip out on Cloudinary, so the hidden left/right
 * parts are never downloaded.
 *
 * Sized by HEIGHT (the strip's height is what the screen actually displays).
 * c_lfill never upscales, so a small source just stays small.
 *
 * Tune `height` here to trade sharpness for bytes; the site and the
 * pre-creation list both follow automatically.
 */
export const CROP_TIERS = {
  small:  { height: 540, quality: 'eco'  },
  mobile: { height: 864, quality: 'good' },
}

/** Aspect-ratio buckets. The nearest one to the phone's viewport is used. */
export const CROP_BUCKETS = [
  { id: '3-4',  ar: '3:4',  ratio: 3 / 4  },   // small / folded phones, small tablets
  { id: '9-16', ar: '9:16', ratio: 9 / 16 },   // older & compact phones
  { id: '9-20', ar: '9:20', ratio: 9 / 20 },   // modern tall phones (19.5:9 – 20:9)
]

/**
 * The Cloudinary transformation for one variant, WITHOUT the public_id.
 * @param {{role:'hero'|'player', tier:string, format:'webm'|'hevc'|'h264', crop?:string}} spec
 *   `crop` is a CROP_BUCKETS id (hero only).
 */
export function variantPath({ role, tier, format, crop }) {
  const fmt = VIDEO_FORMATS[format]
  if (!fmt) throw new Error(`Unknown video format: ${format}`)

  if (crop) {
    const bucket = CROP_BUCKETS.find((b) => b.id === crop)
    const t = CROP_TIERS[tier]
    if (!bucket || !t) throw new Error(`Unknown crop variant: ${tier}/${crop}`)
    return `c_lfill,ar_${bucket.ar},h_${t.height}/ac_none/${fmt.path}/q_auto:${t.quality}`
  }

  const t = HERO_TIERS[tier]
  if (!t) throw new Error(`Unknown tier: ${tier}`)
  return `c_limit,w_${t.width}/${role === 'hero' ? 'ac_none/' : ''}${fmt.path}/q_auto:${t.quality}`
}

export function variantUrl(publicId, spec) {
  const ext = VIDEO_FORMATS[spec.format].ext
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${variantPath(spec)}/${publicId}.${ext}`
}

/**
 * Every variant to pre-create for a video.
 * @param {{landscape?: boolean}} [opts] landscape=false skips the crop variants
 *   (a vertical source is already vertical, nothing to crop). Unknown → true.
 */
export function listVariantSpecs(opts = {}) {
  const landscape = opts.landscape !== false
  const specs = []
  for (const format of FORMAT_ORDER) {
    for (const tier of Object.keys(HERO_TIERS)) specs.push({ role: 'hero', tier, format })
    for (const tier of PLAYER_TIER_NAMES)       specs.push({ role: 'player', tier, format })
    if (landscape) {
      for (const tier of Object.keys(CROP_TIERS)) {
        for (const b of CROP_BUCKETS) specs.push({ role: 'hero', tier, format, crop: b.id })
      }
    }
  }
  return specs
}

/** Same list as Cloudinary `eager` transformation strings (deduplicated). */
export function listEagerTransformations(opts = {}) {
  return [...new Set(listVariantSpecs(opts).map(variantPath))]
}
