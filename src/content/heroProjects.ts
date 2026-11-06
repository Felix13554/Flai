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
  /** Optional — a separate Cloudinary video for MOBILE (portrait/small
   *  screen) viewports, same public_id-or-full-URL format as
   *  `cloudinaryVideoUrl`. When set, mobile visitors see this vertical cut
   *  instead of the desktop/horizontal one; when omitted, mobile falls back
   *  to `cloudinaryVideoUrl` exactly as before this field existed. */
  cloudinaryVideoUrlMobile?: string
  /** Optional — the client's own website. When present, the client logo in
   *  the hero becomes a link that opens this in a new tab. When absent
   *  (older CMS entries), the logo just renders as before, unlinked. */
  website?: string
  /** Optional — logo size as a percentage against two references measured
   *  live in the hero: 0 = the same height as the "Udvalgt projekt" label
   *  above it (the logo's original/default size), 100 = the same height as
   *  the industry heading text below it. Not capped at 100 — e.g. 200 =
   *  double the height of the 100 value, 300 = triple, etc. Only clamped
   *  at 0 (can't go negative). Omitted or invalid → treated as 0 (original
   *  size), so older CMS entries without this field render exactly as
   *  before. */
  logoSize?: number
  /** Optional — a second client logo, shown next to the first one. Left out
   *  or empty → no second logo. Has its own `logoSize2`, which works exactly
   *  like `logoSize` (same scale, same reference heights), so two logos with
   *  the same value (e.g. both 100) are rendered at the same height. */
  clientLogoUrl2?: string
  /** Size of the second logo — same 0…∞ scale as `logoSize`. Omitted or
   *  invalid → 0. */
  logoSize2?: number
  /** Optional — a third client logo (see `clientLogoUrl2`). */
  clientLogoUrl3?: string
  /** Size of the third logo — same scale as `logoSize`. Omitted or
   *  invalid → 0. */
  logoSize3?: number
  /** Optional — a longer description of the project. Shown in the "Se mere"
   *  container (HeroProjectModal) under the project title (`industry`).
   *  Left out or empty → the container just shows the title and the video. */
  description?: string
  /** Optional — navnet på projektet på Projekter-siden (præcis som titlen
   *  der står på projektet under /portfolio; store/små bogstaver er ligegyldige).
   *  Når der trykkes på knappen i hero'en, går besøgende til Projekter-siden
   *  og scroller ned til det projekt. Tom/mangler → går bare til Projekter-siden. */
  project?: string
}

export interface HeroProjectsContent {
  content: HeroProjectItem[]
}

/** A project can show at most this many logos (clientLogoUrl, …2, …3). */
export const MAX_HERO_LOGOS = 3

export interface HeroProjectLogo {
  /** 1-based position (1 = clientLogoUrl, 2 = clientLogoUrl2, …). */
  position: number
  url: string
  /** Logo size in percent — already sanitised (a number ≥ 0). */
  size: number
}

function sanitizeLogoSize(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(raw, 0) : 0
}

/**
 * The logos a project should show, in order, each with its own size.
 * Entries without a URL are skipped, so projects that only use the first
 * logo (all older CMS entries) return a single logo and render as before.
 */
export function getHeroProjectLogos(item: HeroProjectItem): HeroProjectLogo[] {
  const slots: Array<{ url: unknown; size: unknown }> = [
    { url: item.clientLogoUrl, size: item.logoSize },
    { url: item.clientLogoUrl2, size: item.logoSize2 },
    { url: item.clientLogoUrl3, size: item.logoSize3 },
  ]
  const logos: HeroProjectLogo[] = []
  slots.forEach((slot, i) => {
    if (typeof slot.url !== 'string' || !slot.url.trim()) return
    logos.push({ position: i + 1, url: slot.url, size: sanitizeLogoSize(slot.size) })
  })
  return logos
}

const HERO_LOGO_KEYS = ['clientLogoUrl', 'logoSize', 'clientLogoUrl2', 'logoSize2', 'clientLogoUrl3', 'logoSize3']

/**
 * For the CMS editor: the "Formular" view only shows keys that already exist
 * in the JSON, so older projects would never show the extra logo fields.
 * This adds any missing logo fields (empty URL / size 0) right after
 * `clientLogoUrl`, plus an empty `description` (the "Se mere" text) at the
 * end of each project, and leaves everything else untouched. Returns the input
 * unchanged if it isn't a hero-project array.
 */
export function withHeroLogoFields(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every(
      (p) => p && typeof p === 'object' && !Array.isArray(p) && typeof (p as Record<string, unknown>).cloudinaryVideoUrl === 'string',
    )
  ) {
    return raw
  }

  const defaults: Record<string, unknown> = {
    clientLogoUrl: '',
    logoSize: 0,
    clientLogoUrl2: '',
    logoSize2: 0,
    clientLogoUrl3: '',
    logoSize3: 0,
  }
  const normalized = (parsed as Array<Record<string, unknown>>).map((item) => {
    const out: Record<string, unknown> = {}
    const addLogoFields = () => {
      HERO_LOGO_KEYS.forEach((k) => {
        out[k] = k in item ? item[k] : defaults[k]
      })
    }
    let added = false
    Object.entries(item).forEach(([k, v]) => {
      if (HERO_LOGO_KEYS.includes(k)) {
        if (!added) {
          addLogoFields()
          added = true
        }
        return
      }
      out[k] = v
    })
    if (!added) addLogoFields()
    // Same idea for the "Se mere" description: make the field show up in the
    // form for older projects that don't have it saved yet.
    if (!('description' in out)) out.description = ''
    if (!('project' in out)) out.project = ''
    return out
  })
  return JSON.stringify(normalized, null, 2)
}

function isValidHeroProjectItem(item: unknown): item is HeroProjectItem {
  const p = item as HeroProjectItem
  return (
    !!p &&
    typeof p.number === 'string' &&
    typeof p.industry === 'string' &&
    typeof p.clientLogoUrl === 'string' &&
    typeof p.cloudinaryVideoUrl === 'string' &&
    (p.cloudinaryVideoUrlMobile === undefined || typeof p.cloudinaryVideoUrlMobile === 'string') &&
    (p.website === undefined || typeof p.website === 'string') &&
    (p.logoSize === undefined || typeof p.logoSize === 'number') &&
    (p.clientLogoUrl2 === undefined || typeof p.clientLogoUrl2 === 'string') &&
    (p.logoSize2 === undefined || typeof p.logoSize2 === 'number') &&
    (p.clientLogoUrl3 === undefined || typeof p.clientLogoUrl3 === 'string') &&
    (p.logoSize3 === undefined || typeof p.logoSize3 === 'number') &&
    (p.description === undefined || typeof p.description === 'string') &&
    (p.project === undefined || typeof p.project === 'string')
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
      number: '',
      industry: '',
      clientLogoUrl: '',
      cloudinaryVideoUrl: '',
      website: '',
    },
  ],
}
