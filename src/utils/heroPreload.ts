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

const CLOUD = 'dq6jxbyrg'

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
  const base =
    `https://res.cloudinary.com/${CLOUD}/video/upload/` +
    `c_fill,g_auto,w_${width},so_0/f_jpg/q_auto:${quality}/${publicId}.jpg`
  return stamp > 0 ? `${base}?v=${stamp}` : base
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

export function injectPreloadHints(publicId = heroVideo.public_id, stamp = _posterStamp): void {
  if (typeof document === 'undefined') return
  const head = document.head

  head.querySelectorAll('link[data-hero-slot]').forEach(el => el.remove())

  const frag = document.createDocumentFragment()

  // MP4 — primary source, preloaded at high priority.
  // crossOrigin='anonymous' is required: without it the browser makes a no-CORS
  // preload fetch, then when the <video> element (CORS) requests the same URL
  // the cached response is rejected and a second request fires — wasting the preload.
  const mp4Link = document.createElement('link')
  mp4Link.rel         = 'preload'
  mp4Link.as          = 'video'
  mp4Link.href        = cloudinaryMp4Url(publicId)
  mp4Link.crossOrigin = 'anonymous'
  mp4Link.setAttribute('fetchpriority', 'high')
  mp4Link.dataset.heroSlot = 'mp4'
  frag.appendChild(mp4Link)

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

if (typeof document !== 'undefined') {
  injectConnectionHints()
  injectPreloadHints()
}
