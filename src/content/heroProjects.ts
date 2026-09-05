/**
 * heroProjects.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Data shape + parsing for the homepage hero's project carousel
 * (<HeroProjectCarousel>). The real content is CMS-managed, stored as a
 * bare JSON array under the "content" content-key (Indholdsstyring →
 * general → Content) — same pattern as the testimonials-review-2 key
 * elsewhere on the homepage. Each object needs number/industry/
 * clientLogoUrl/cloudinaryVideoUrl, plus an optional "website" (the
 * client's own site — when set, clicking their logo in the hero opens it
 * in a new tab). HomePage.tsx reads that key and falls back to
 * `heroProjectsContent` below only when it's empty or fails to parse, so
 * the hero is never blank.
 *
 * NOTE: this file was accidentally overwritten with a full copy of
 * HeroVideoSection.tsx at some point, which broke the production build
 * (esbuild can't parse JSX in a .ts file) without touching anything else
 * in the repo. This is a reconstruction of the module from how it's
 * actually consumed in HeroProjectCarousel.tsx and HomePage.tsx. The
 * *shape* (field names/types) is recovered with confidence from those call
 * sites; the single fallback item's copy/logo below is a safe placeholder
 * — swap it for the real default project whenever convenient, since in
 * practice the CMS "content" key almost always overrides it anyway.
 */

/** One project tab in the hero carousel. */
export interface HeroProjectItem {
  /** Rendered as the tab's visible label (e.g. "01") — also used as the
   *  React key, so it must be unique within a given content array. */
  number: string
  /** Client's industry — shown as the big heading for the active project. */
  industry: string
  /** Client logo image shown in place of a client-name heading. */
  clientLogoUrl: string
  /** Cloudinary video for this project — either a bare public_id or a full
   *  Cloudinary delivery URL (HomePage runs it through
   *  extractCloudinaryPublicId either way before handing it to
   *  <HeroVideoSection publicId={...}>). */
  cloudinaryVideoUrl: string
  /** Optional — the client's own website. When present, the client logo in
   *  the hero becomes a link that opens this in a new tab. When absent
   *  (older CMS entries), the logo just renders as before, unlinked. */
  website?: string
}

export interface HeroProjectsContent {
  content: HeroProjectItem[]
}

function isValidHeroProjectItem(item: unknown): item is HeroProjectItem {
  const p = item as HeroProjectItem
  return (
    !!p &&
    typeof p.number === 'string' &&
    typeof p.industry === 'string' &&
    typeof p.clientLogoUrl === 'string' &&
    typeof p.cloudinaryVideoUrl === 'string' &&
    (p.website === undefined || typeof p.website === 'string')
  )
}

/**
 * Parses the CMS "content" key (a bare JSON array of project objects).
 * Falls back to `fallback` whenever the raw string is empty, isn't valid
 * JSON, isn't an array, or ends up with zero valid items after filtering —
 * so the hero always has at least one project to show.
 */
export function parseHeroProjectsContent(
  raw: string,
  fallback: HeroProjectItem[],
): HeroProjectItem[] {
  if (!raw.trim()) return fallback
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return fallback
    const valid = parsed.filter(isValidHeroProjectItem)
    return valid.length > 0 ? valid : fallback
  } catch {
    return fallback
  }
}

// ─── Fallback content ───────────────────────────────────────────────────────
// Used only until the CMS "content" key is configured (or if it's ever
// cleared/broken) — see the note at the top of this file re: swapping this
// placeholder for a real default project.
export const heroProjectsContent: HeroProjectsContent = {
  content: [
    {
      number: '01',
      industry: 'Dronefotografering & -optagelser',
      clientLogoUrl: '/Logo.webp',
      cloudinaryVideoUrl: '',
      website: 'https://flai.dk',
    },
  ],
}
