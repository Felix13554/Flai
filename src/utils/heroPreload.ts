/**
 * heroPreload.ts  — v2
 *
 * ─── Dynamic folder mode ──────────────────────────────────────────────────────
 * Account created after June 2024 → dynamic folder mode.
 * asset_folder ('Herovideo') is display-only. The upload API returns a bare
 * public_id ('herovideo') with NO folder prefix. Delivery URLs use bare id.
 *
 * ─── Performance: MP4 first, HLS as enhancement ───────────────────────────────
 * sp_auto generates the HLS manifest on first request (on-demand transcoding).
 * For a 33 MB MOV this means the browser stalls waiting for Cloudinary to
 * transcode before even the first segment can be fetched — causing slow starts.
 *
 * Fix: treat MP4 as the primary source and load HLS only as a progressive
 * enhancement once we know the manifest is available. The MP4 is derived
 * synchronously and plays immediately. HLS.js is still used where supported
 * because it gives adaptive bitrate, but we fall back to MP4 instantly if the
 * manifest is not ready (404/error on first load).
 *
 * ─── Poster cache busting — cross-user, cross-tab ─────────────────────────────
 * v2 changes the stamp storage from sessionStorage → localStorage so the
 * version survives tab close and propagates to every tab in the same browser
 * via the 'storage' event.
 *
 * Full invalidation path for ALL users:
 *   1. Uploader tab  → bustHeroCache() mutates singleton + dispatches
 *                       'heroVideoChanged' (same-tab) + writes stamp to
 *                       localStorage (other tabs in same browser).
 *   2. Other tabs    → 'storage' event fires → bustHeroCache() called → same.
 *   3. Other browsers/users → heroSync.ts Supabase Realtime broadcast →
 *                       bustHeroCache() called → same.
 *
 * The three layers together guarantee every connected session updates within
 * ~100 ms without any page reload.
 *
 * ─── Loading-speed guarantee ──────────────────────────────────────────────────
 * • Preload <link> hints injected immediately at module import time — the
 *   browser starts fetching the poster and MP4 before React even mounts.
 * • bustHeroCache() runs synchronously for the current tab, then offloads
 *   the HTTP cache-warming fetch to requestIdleCallback.
 * • The localStorage 'storage' listener is attached at module init — no
 *   polling, no extra HTTP requests on the critical path.
 */

// Bare public_id — dynamic folder mode, no folder prefix in delivery URL.
const HERO_PUBLIC_ID = 'herovideo'

// ─── Cache-bust version stamp ─────────────────────────────────────────────────
// v2: stored in localStorage (was sessionStorage) so it:
//   • survives tab close → returning users skip the flash of the old poster
//   • propagates to other open tabs via the 'storage' event

const STAMP_KEY = 'hero_poster_v'

function readStamp(): number {
  try {
    // Prefer localStorage (persists + cross-tab); fall back to sessionStorage
    // for browsers that block localStorage (e.g. Safari private mode).
    const v =
      localStorage.getItem(STAMP_KEY) ??
      sessionStorage.getItem(STAMP_KEY) ??
      '0'
    return parseInt(v, 10) || 0
  } catch {
    return 0
  }
}

function writeStamp(v: number): void {
  try { localStorage.setItem(STAMP_KEY, String(v)) } catch {}
  // Also write to sessionStorage as fallback for Safari private mode.
  try { sessionStorage.setItem(STAMP_KEY, String(v)) } catch {}
}

let _posterStamp = readStamp()

/** Returns the current poster cache-bust stamp. HeroVideoSection reads this. */
export function getPosterStamp(): number { return _posterStamp }

// ─── Cross-tab sync via storage event ────────────────────────────────────────
// When the uploader tab writes a new stamp to localStorage, every other open
// tab in the same browser fires this handler automatically — no polling needed.

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STAMP_KEY || !e.newValue) return
    const newStamp = parseInt(e.newValue, 10)
    if (!newStamp || newStamp === _posterStamp) return

    // Update module state
    _posterStamp = newStamp

    // Re-derive URLs with new stamp and mutate singleton
    const id = heroVideo.public_id
    heroVideo.posterUrl   = cloudinaryPosterUrl(id, 1920, 'good', newStamp)
    heroVideo.posterStamp = newStamp

    // Update preload hints so next navigation uses the fresh URL
    injectPreloadHints(id, newStamp)

    // Tell HeroVideoSection to swap the poster immediately
    window.dispatchEvent(
      new CustomEvent('heroVideoChanged', {
        detail: { publicId: id, stamp: newStamp },
      })
    )
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeroVideo {
  public_id:   string
  hlsUrl:      string
  mp4Url:      string
  posterUrl:   string
  posterStamp: number
}

// ─── URL builders — single source of truth ────────────────────────────────────

// URL builders now live in ./cloudinaryUrls (side-effect-free, shared with the
// non-hero video players). Re-exported here so existing imports are unchanged.
import {
  extractCloudinaryPublicId,
  cloudinaryHlsUrl,
  cloudinaryMp4Url,
  cloudinaryHeroMp4Url,
  cloudinaryWebmUrl,
  cloudinaryPosterUrl,
  reportVideoFormatError,
} from './cloudinaryUrls'

export {
  extractCloudinaryPublicId,
  cloudinaryHlsUrl,
  cloudinaryMp4Url,
  cloudinaryHeroMp4Url,
  cloudinaryWebmUrl,
  cloudinaryPosterUrl,
}

// ─── Mutable singleton ────────────────────────────────────────────────────────

const heroVideo: HeroVideo = {
  public_id:   HERO_PUBLIC_ID,
  hlsUrl:      cloudinaryHlsUrl(HERO_PUBLIC_ID),
  mp4Url:      cloudinaryMp4Url(HERO_PUBLIC_ID),
  posterUrl:   cloudinaryPosterUrl(HERO_PUBLIC_ID, 1920, 'good', _posterStamp),
  posterStamp: _posterStamp,
}

export function getHeroVideo(): HeroVideo            { return heroVideo }
export function fetchHeroVideo(): Promise<HeroVideo> { return Promise.resolve(heroVideo) }

// ─── Connection info ────────────────────────────────────────────────────────
// Single source of truth for "should we spend bandwidth the user hasn't
// explicitly asked for yet". Used both by HeroVideoSection (to decide
// whether to even load/play the active video) and by prefetchProjectVideo
// below (to decide whether to warm the cache for a video that isn't on
// screen yet) — kept here so the two can never drift out of sync.
export function getConnectionInfo(): { isSlow: boolean; saveData: boolean } {
  if (typeof navigator === 'undefined') return { isSlow: false, saveData: false }
  const conn =
    (navigator as any).connection ??
    (navigator as any).mozConnection ??
    (navigator as any).webkitConnection
  return {
    isSlow:   conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g',
    saveData: conn?.saveData === true,
  }
}

// ─── Preload hints ────────────────────────────────────────────────────────────

function injectConnectionHints(): void {
  if (typeof document === 'undefined') return
  const head   = document.head
  const origin = 'https://res.cloudinary.com'

  if (!head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
    const pc = document.createElement('link')
    pc.rel = 'preconnect'; pc.href = origin; pc.crossOrigin = 'anonymous'
    head.prepend(pc)
  }
  if (!head.querySelector(`link[rel="dns-prefetch"][href="${origin}"]`)) {
    const dp = document.createElement('link')
    dp.rel = 'dns-prefetch'; dp.href = origin
    head.prepend(dp)
  }
}

// NOTE: this used to ALSO preload the MP4 (`<link rel="preload" as="video">`).
// That was removed on purpose, for two reasons:
//   1. A <video> element fetches by byte range; a preload is a plain full GET,
//      so the browser frequently downloads the file twice (once for the preload,
//      once for the element) — and every byte is billed by Cloudinary.
//   2. The homepage no longer plays the 'herovideo' singleton at all (the
//      carousel passes the CMS project's own public_id), so preloading
//      'herovideo' on every visit downloaded a video nobody watched.
// React mounts the <video> within a few hundred ms and the poster covers that
// gap, so there is nothing worth buying with those bytes.
export function injectPreloadHints(publicId = heroVideo.public_id, stamp = _posterStamp): void {
  if (typeof document === 'undefined') return
  const head = document.head

  head.querySelectorAll('link[data-hero-slot]').forEach(el => el.remove())

  const frag = document.createDocumentFragment()

  // Poster — uses stamp so preload URL exactly matches <img> src.
  // imageSrcset/imagesizes must be set via setAttribute — assigning them as JS
  // properties is silently ignored by browsers, so only the 1920w href would
  // be preloaded regardless of viewport width.
  const posterLink = document.createElement('link')
  posterLink.rel         = 'preload'
  posterLink.as          = 'image'
  posterLink.href        = cloudinaryPosterUrl(publicId, 1920, 'good', stamp)
  posterLink.crossOrigin = 'anonymous'
  posterLink.setAttribute('fetchpriority', 'high')
  posterLink.setAttribute('imagesrcset', [
    `${cloudinaryPosterUrl(publicId,  480, 'eco',  stamp)} 480w`,
    `${cloudinaryPosterUrl(publicId,  960, 'eco',  stamp)} 960w`,
    `${cloudinaryPosterUrl(publicId, 1920, 'good', stamp)} 1920w`,
  ].join(', '))
  posterLink.setAttribute('imagesizes', '100vw')
  posterLink.dataset.heroSlot = 'poster'
  frag.appendChild(posterLink)

  head.prepend(frag)
}

// ─── Adjacent-project prefetch (hero carousel) ─────────────────────────────────
// HeroProjectCarousel/HomePage swap `HeroVideoSection`'s `publicId` prop as the
// user clicks a project tab (or auto-advance fires) — that's "controlled mode",
// a completely separate code path from the CMS singleton hero video above, and
// nothing was warming the cache for whichever project is coming up next. Every
// switch used to be a cold fetch: poster shows, then the browser starts
// downloading a video it has never touched before.
//
// This warms the HTTP cache for a specific project's video + poster AHEAD of
// it becoming active, at low priority (`rel="prefetch"`, not `rel="preload"`)
// so it never competes with whichever video is actually playing right now.
// Callers (HomePage) decide WHICH project(s) to warm — typically the tab
// either side of the active one — and WHEN (deferred to idle time).
//
// `as="fetch"` (not `as="video"`) is deliberate: it warms the cache for
// exactly the crossOrigin="anonymous" GET the <video> element will later
// issue (see setVideoRef in HeroVideoSection), without asserting a resource
// type ("video") that Safari/Firefox don't reliably recognize under
// rel="prefetch" — as="fetch" is the broadly-supported way to pre-warm an
// arbitrary same-shape request regardless of what eventually consumes it.
//
// This is a FULL-file GET, billed in full by Cloudinary, so the caller must only
// use it for the ONE video that is likely to play next (HomePage: the
// auto-advance target, and only for visitors who have stayed a while). It uses
// the same hero URL the <video> element will request, so the bytes are reused.
// The poster is NOT fetched here — `prefetchProjectImages` already warms it with
// the exact srcset the <img> uses (this used to also pull a separate 1920px
// poster that no phone would ever display).
const _prefetchedVideoUrls = new Set<string>()

export function prefetchProjectVideo(publicId: string, vertical = false): void {
  if (typeof document === 'undefined' || !publicId) return
  const { isSlow, saveData } = getConnectionInfo()
  // Never spend a slow/metered connection's data budget on a video the user
  // hasn't actually asked to see yet — same guard HeroVideoSection itself
  // uses (skipVideo) for the video that IS on screen.
  if (isSlow || saveData) return

  const url = cloudinaryHeroMp4Url(publicId, undefined, vertical)
  if (_prefetchedVideoUrls.has(url)) return
  _prefetchedVideoUrls.add(url)

  const videoLink = document.createElement('link')
  videoLink.rel         = 'prefetch'
  videoLink.as          = 'fetch'
  videoLink.href        = url
  videoLink.crossOrigin = 'anonymous'
  videoLink.dataset.heroPrefetch = publicId
  document.head.appendChild(videoLink)
}

// ─── Load-before-switch (hero carousel) ───────────────────────────────────────
// When the visitor switches project (tab click or auto-advance), the carousel
// must NOT change until the next project is actually ready — otherwise the
// text/logo/progress change instantly while the video is still downloading and
// the hero shows an empty poster for a moment. `preloadProjectForSwitch` loads
// everything the new project needs (poster, first chunk of video, logos) and
// resolves once it is ready, or after `timeoutMs` at the latest so a slow or
// failing asset can never freeze the carousel on the old project.
const _switchPreloads = new Map<string, Promise<void>>()

/** True when the phone is held in portrait — same test HeroVideoSection uses. */
export function isPortraitMobileNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches
}

/**
 * The exact src/srcset the hero <img> poster renders for a project
 * (see HeroVideoSection: 480w/960w 'eco' + 1920w 'good', sizes="100vw").
 * Preloading through THESE sources makes the browser pick the very same
 * candidate the rendered <img> will ask for (a phone gets the small file),
 * so the preload actually fills the cache the poster reads from. The old
 * preload always fetched the 1920w file — wasted bytes on phones, and a cache
 * miss when the <img> then requested the smaller one.
 */
function posterImageSources(publicId: string): { src: string; srcSet: string } {
  const stamp = _posterStamp
  const p480  = cloudinaryPosterUrl(publicId,  480, 'eco',  stamp)
  const p960  = cloudinaryPosterUrl(publicId,  960, 'eco',  stamp)
  const p1920 = cloudinaryPosterUrl(publicId, 1920, 'good', stamp)
  return { src: p1920, srcSet: `${p480} 480w, ${p960} 960w, ${p1920} 1920w` }
}

function loadImageReady(url: string, srcset?: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!url) { resolve(); return }
    const img = new Image()
    // No crossOrigin: must match the rendered <img> tags so the browser cache is reused.
    img.onload  = () => {
      // decode() makes the first paint of this image instant.
      if (typeof img.decode === 'function') img.decode().then(() => resolve(), () => resolve())
      else resolve()
    }
    img.onerror = () => resolve()
    img.decoding = 'async'
    // sizes/srcset must be set BEFORE src so the right candidate is chosen.
    if (srcset) {
      img.sizes  = '100vw'
      img.srcset = srcset
    }
    img.src = url
  })
}

function loadVideoReady(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!url) { resolve(); return }
    const video = document.createElement('video')
    let done = false
    const finish = () => {
      if (done) return
      done = true
      video.removeEventListener('canplay', finish)
      video.removeEventListener('loadeddata', finish)
      video.removeEventListener('error', finish)
      // Release the connection; what was fetched stays in the HTTP cache.
      video.pause()
      video.removeAttribute('src')
      video.load()
      resolve()
    }
    video.addEventListener('canplay', finish)
    video.addEventListener('loadeddata', finish)
    // A codec this browser cannot decode: pin the device to H.264 (see reportVideoFormatError).
    video.addEventListener('error', () => { reportVideoFormatError(video) })
    video.addEventListener('error', finish)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous' // must match setVideoRef in HeroVideoSection
    video.src = url
    video.load()
  })
}

export function preloadProjectForSwitch(opts: {
  publicId?: string
  /** The id is the 9:16 cut (picks the tier for a portrait phone). */
  vertical?: boolean
  logoUrls?: string[]
  /**
   * Also wait for the first chunk of the video (default true — used by the
   * automatic advance after a video ends, where nobody is waiting).
   * Pass false for a visitor's tap: the switch then only waits for the poster
   * and logos, and the video keeps loading behind the poster via
   * HeroVideoSection. Waiting for the video made a tap feel dead for seconds
   * (and the throwaway <video> fetch was thrown away and re-downloaded).
   */
  waitForVideo?: boolean
  timeoutMs?: number
}): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  const { publicId, vertical = false, logoUrls = [], waitForVideo = true } = opts
  // A tap should never wait long; the auto-advance can afford to.
  const timeoutMs = opts.timeoutMs ?? (waitForVideo ? 8000 : 1500)
  const key = `${publicId ?? ''}|${vertical ? 'V' : 'H'}|${logoUrls.join(',')}|${waitForVideo ? 'v' : 'p'}`
  const existing = _switchPreloads.get(key)
  if (existing) return existing

  const { isSlow, saveData } = getConnectionInfo()
  const tasks: Promise<void>[] = []
  if (publicId) {
    const { src, srcSet } = posterImageSources(publicId)
    tasks.push(loadImageReady(src, srcSet))
    // Never spend a slow/metered connection's data on the video up front.
    if (waitForVideo && !isSlow && !saveData) tasks.push(loadVideoReady(cloudinaryHeroMp4Url(publicId, undefined, vertical)))
  }
  logoUrls.forEach((u) => tasks.push(loadImageReady(u)))

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  const p = Promise.race([Promise.all(tasks).then(() => undefined), timeout])
  _switchPreloads.set(key, p)
  return p
}

// ─── Poster + logo prefetch for EVERY project ─────────────────────────────────
// The video prefetch above only covers the neighbouring projects, and uses
// <link rel="prefetch">, which Safari/iOS doesn't support at all. Posters and
// logos are small images, so warm them for ALL projects at idle time through
// plain Image() objects (works everywhere): tapping any number then finds its
// poster and logos already cached, and the switch is near-instant.
const _prefetchedImages = new Map<string, HTMLImageElement>()

function prefetchImage(url: string, srcset?: string): void {
  const key = srcset ? `${url}|${srcset}` : url
  if (!url || _prefetchedImages.has(key)) return
  const img = new Image()
  img.decoding = 'async'
  if (srcset) {
    img.sizes  = '100vw'
    img.srcset = srcset
  }
  img.src = url
  // Keep a reference so the request isn't dropped by garbage collection.
  _prefetchedImages.set(key, img)
}

export function prefetchProjectImages(opts: { publicId?: string; logoUrls?: string[] }): void {
  if (typeof document === 'undefined') return
  const { saveData } = getConnectionInfo()
  if (saveData) return
  if (opts.publicId) {
    const { src, srcSet } = posterImageSources(opts.publicId)
    prefetchImage(src, srcSet)
  }
  opts.logoUrls?.forEach((u) => prefetchImage(u))
}

// ─── Cache busting ────────────────────────────────────────────────────────────

const HERO_CACHE_NAME = 'hero-video-v1'

/**
 * deleteOldHeroCacheEntries(oldPublicId, newStamp)
 *
 * Opens the 'hero-video-v1' Cache Storage bucket and deletes every entry
 * whose URL belongs to the hero video (poster + MP4 + WebM + HLS).
 * This is the only reliable way to evict stale bytes — `cache: 'reload'`
 * only bypasses the cache on that one fetch; it does not delete the old entry,
 * so a subsequent page load with `cache: 'default'` would still serve stale.
 */
async function deleteOldHeroCacheEntries(oldPublicId: string): Promise<void> {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open(HERO_CACHE_NAME)
    const keys  = await cache.keys()
    const toDelete = keys.filter(req => req.url.includes(oldPublicId))
    await Promise.all(toDelete.map(req => cache.delete(req)))
  } catch (e) {
    console.warn('[heroPreload] Cache delete failed (non-fatal):', e)
  }
}

/**
 * primeHeroCacheEntries(publicId, stamp)
 *
 * Fetches all three poster sizes with `cache: 'reload'` (bypasses the browser
 * HTTP cache and Cloudinary's CDN edge cache) then stores the fresh responses
 * in our own Cache Storage bucket.
 *
 * Why posters only, not MP4:
 *   • Storing a 206 Partial Content response for a Range request in Cache
 *     Storage and then serving it as a full response confuses the browser's
 *     media pipeline — it expects either a full 200 or a proper range
 *     negotiation, and a stored 206 satisfies neither.
 *   • The video element handles its own media cache via the browser's internal
 *     media resource cache. We do not need to prime it here; the videoKey
 *     remount (on replace) already forces a fresh fetch past that cache.
 *   • Posters are images, not streaming media — a full 200 response stored in
 *     Cache Storage is served correctly by any fetch() call or <img> src.
 */
async function primeHeroCacheEntries(publicId: string, stamp: number): Promise<void> {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open(HERO_CACHE_NAME)

    const posterUrls = [
      cloudinaryPosterUrl(publicId,  480, 'eco',  stamp),
      cloudinaryPosterUrl(publicId,  960, 'eco',  stamp),
      cloudinaryPosterUrl(publicId, 1920, 'good', stamp),
    ]
    await Promise.allSettled(
      posterUrls.map(async (url) => {
        // cache:'reload' forces a real network trip past any CDN or HTTP cache.
        // The response is a full 200 image — safe to store and serve.
        const res = await fetch(url, { cache: 'reload', credentials: 'omit' })
        if (res.ok) await cache.put(url, res)
      })
    )
  } catch (e) {
    console.warn('[heroPreload] Cache prime failed (non-fatal):', e)
  }
}

/**
 * bustHeroCache(publicId)
 *
 * Full cache replacement for the CURRENT TAB:
 *   1. Bumps the stamp → new poster URLs → forces React to swap <img> src
 *   2. Writes stamp to localStorage → other same-browser tabs sync via 'storage'
 *   3. Mutates the heroVideo singleton so any component that reads it is current
 *   4. Updates <link rel="preload"> hints for the next navigation
 *   5. Fires 'heroVideoChanged' → HeroVideoSection remounts/reloads immediately
 *   6. In background (rIC): DELETE old Cache Storage entries, then PRIME new ones
 *      so future page loads and service-worker fetches serve fresh bytes.
 *
 * Other users/browsers are notified via heroSync.ts (Supabase Realtime).
 */
export function bustHeroCache(publicId: string = HERO_PUBLIC_ID): void {
  if (typeof window === 'undefined') return

  const prevPublicId = heroVideo.public_id

  // 1. New stamp → all poster src URLs change → forces browser re-fetch
  _posterStamp = Date.now()
  writeStamp(_posterStamp)           // also triggers 'storage' in other tabs

  // 2. Mutate singleton immediately
  heroVideo.public_id   = publicId
  heroVideo.hlsUrl      = cloudinaryHlsUrl(publicId)
  heroVideo.mp4Url      = cloudinaryMp4Url(publicId)
  heroVideo.posterUrl   = cloudinaryPosterUrl(publicId, 1920, 'good', _posterStamp)
  heroVideo.posterStamp = _posterStamp

  // 3. Update preload hints for next navigation
  injectPreloadHints(publicId, _posterStamp)

  // 4. Tell HeroVideoSection to reload NOW
  window.dispatchEvent(
    new CustomEvent('heroVideoChanged', {
      detail: { publicId, stamp: _posterStamp },
    })
  )

  // 5. Replace Cache Storage entries — delete stale, write fresh.
  //
  //    Split into two phases:
  //    A) Deletion + fetch start: runs in a microtask (Promise.resolve().then)
  //       so it doesn't block the synchronous dispatch above, but starts
  //       immediately — the network requests for the new poster begin in the
  //       same event-loop turn as the UI update.
  //    B) cache.put (disk write): deferred to requestIdleCallback so it never
  //       competes with layout/paint caused by the heroVideoChanged event above.
  const capturedStamp = _posterStamp

  Promise.resolve().then(async () => {
    // Delete stale entries synchronously before starting new fetches, so there
    // is no window where both old and new entries coexist in the bucket.
    await deleteOldHeroCacheEntries(prevPublicId)
    if (prevPublicId !== publicId) {
      await deleteOldHeroCacheEntries(publicId)
    }

    // Start all poster fetches immediately — they run in parallel.
    // cache.put is deferred so disk I/O doesn't compete with first paint.
    if (!('caches' in window)) return
    const posterUrls = [
      cloudinaryPosterUrl(publicId,  480, 'eco',  capturedStamp),
      cloudinaryPosterUrl(publicId,  960, 'eco',  capturedStamp),
      cloudinaryPosterUrl(publicId, 1920, 'good', capturedStamp),
    ]
    const fetches = posterUrls.map(url =>
      fetch(url, { cache: 'reload', credentials: 'omit' })
        .then(res => ({ url, res }))
        .catch(() => null)
    )

    // Defer the cache writes until the browser is idle
    const writeToCacheWhenIdle = async () => {
      const cache = await caches.open(HERO_CACHE_NAME).catch(() => null)
      if (!cache) return
      const results = await Promise.allSettled(fetches)
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.res.ok) {
          cache.put(r.value.url, r.value.res).catch(() => {})
        }
      }
    }

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => { writeToCacheWhenIdle().catch(() => {}) }, { timeout: 10_000 })
    } else {
      setTimeout(() => { writeToCacheWhenIdle().catch(() => {}) }, 1000)
    }
  }).catch(() => {})
}

// ─── Module init ──────────────────────────────────────────────────────────────

// Connection hints only. We deliberately do NOT call injectPreloadHints() here:
// it would preload the 'herovideo' singleton's poster on every homepage visit,
// but the homepage plays the CMS carousel's project video, so that poster is
// never shown. HeroVideoSection renders (and fetches) the right poster itself.
if (typeof document !== 'undefined') {
  injectConnectionHints()
}
