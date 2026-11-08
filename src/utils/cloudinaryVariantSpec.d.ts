export const CLOUD: string
export type VideoFormat = 'webm' | 'hevc' | 'h264'
export type VideoRole = 'hero' | 'player'
export type HeroVideoTier = 'small' | 'mobile' | 'medium' | 'large'
export interface VariantSpec {
  role: VideoRole
  tier: HeroVideoTier
  format: VideoFormat
  /** CROP_BUCKETS id, hero only */
  crop?: string
}
export const VIDEO_FORMATS: Record<VideoFormat, { ext: string; path: string }>
export const FORMAT_ORDER: VideoFormat[]
export const HERO_TIERS: Record<HeroVideoTier, { width: number; quality: string }>
export const PLAYER_TIER_NAMES: HeroVideoTier[]
export const CROP_TIERS: Record<'small' | 'mobile', { height: number; quality: string }>
export const CROP_BUCKETS: { id: string; ar: string; ratio: number }[]
export function variantPath(spec: VariantSpec): string
export function variantUrl(publicId: string, spec: VariantSpec): string
export function listVariantSpecs(opts?: { landscape?: boolean }): VariantSpec[]
export function listEagerTransformations(opts?: { landscape?: boolean }): string[]
