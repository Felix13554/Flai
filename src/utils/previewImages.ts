/**
 * previewImages.ts
 *
 * Connection-aware image sizing + preloading for the client Preview page
 * (src/pages/PreviewPage.tsx).
 *
 * ── Network tier ─────────────────────────────────────────────────────────────
 *
 *   Every size decision goes through getNetTier() → 'slow' | 'medium' | 'fast'.
 *   Signals, strongest first:
 *     1. Data Saver / 2G                      → always 'slow'
 *     2. Real measured throughput             → from our own preloads (see below)
 *     3. navigator.connection (Chrome/Android) → effectiveType / downlink
 *     4. Unknown (Safari has no such API)     → 'medium' until step 2 has data
 *
 *   Measuring beats the Network Information API because Safari/iOS doesn't
 *   expose it at all. Same-origin /api/drive-preview responses expose their
 *   transfer size and download time via Resource Timing, so every preloaded
 *   photo doubles as a speed test. Only the DOWNLOAD phase is timed
 *   (responseStart → responseEnd), so the server's resize time on a cold
 *   image isn't mistaken for a slow connection.
 *
 * ── Preloading ───────────────────────────────────────────────────────────────
 *
 *   A tiny 2-wide queue (high-priority jobs jump ahead of low-priority ones)
 *   warms the browser HTTP cache with lightbox images before they're opened.
 *   Image objects are dropped once loaded — only the HTTP cache keeps the
 *   bytes — so preloading many photos can't pile up decoded bitmaps in RAM.
 *   Each preload also warms Vercel's edge cache, which is what makes the
 *   first open of an image fast for the *next* visitor as well.
 */

export type NetTier = 'slow' | 'medium' | 'fast';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}

const getConnection = (): NetworkInformationLike | undefined =>
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

// ─── Network tier ─────────────────────────────────────────────────────────────

let measuredMbps: number | null = null;

const tierFromMbps = (mbps: number): NetTier => (mbps < 1.5 ? 'slow' : mbps < 5 ? 'medium' : 'fast');

/** Fold one throughput sample into a smoothed estimate. */
function reportThroughput(mbps: number) {
  if (!Number.isFinite(mbps) || mbps <= 0) return;
  const capped = Math.min(mbps, 200);
  measuredMbps = measuredMbps === null ? capped : measuredMbps * 0.6 + capped * 0.4;
}

export function getNetTier(): NetTier {
  const conn = getConnection();
  if (conn?.saveData) return 'slow';
  const type = conn?.effectiveType;
  if (type === 'slow-2g' || type === '2g') return 'slow';
  if (measuredMbps !== null) return tierFromMbps(measuredMbps);
  if (type === '3g') return 'slow';
  if (typeof conn?.downlink === 'number' && conn.downlink > 0) return tierFromMbps(conn.downlink);
  return 'medium';
}

/** True when the visitor asked the browser to save data. */
export const prefersReducedData = (): boolean => !!getConnection()?.saveData;

// ─── Sizes ────────────────────────────────────────────────────────────────────

/** Must match the buckets the API snaps to (api/drive-preview.js). */
export const LIGHTBOX_BUCKETS = [640, 960, 1280, 1600, 1920, 2400];
const LIGHTBOX_CAP: Record<NetTier, number> = { slow: 960, medium: 1600, fast: 2400 };

/**
 * Lightbox image width: what the screen can actually show (92vw × pixel
 * density), capped by connection speed, snapped UP to a shared bucket so
 * preloads and displayed images use identical URLs and cache entries.
 */
export function pickLightboxWidth(tier: NetTier = getNetTier()): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const wanted = Math.round(viewport * 0.92 * dpr);
  const cap = LIGHTBOX_CAP[tier];
  const allowed = LIGHTBOX_BUCKETS.filter((b) => b <= cap);
  return allowed.find((b) => b >= wanted) ?? allowed[allowed.length - 1];
}

const THUMB_STEPS = [320, 480, 640];
const THUMB_CAP: Record<NetTier, number> = { slow: 320, medium: 480, fast: 640 };

/** Grid thumbnail edge size: cells are ~160–260 css px, so 1000px was overkill. */
export function pickGridThumbSize(tier: NetTier = getNetTier()): number {
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
  const need = Math.ceil(260 * dpr);
  const cap = THUMB_CAP[tier];
  return THUMB_STEPS.find((s) => s >= need && s <= cap) ?? cap;
}

/** Google's thumbnailLink carries its size as a trailing `=sNNN`. */
export function sizedGridThumb(url: string | null, size: number): string | null {
  if (!url) return url;
  return /=s\d+$/.test(url) ? url.replace(/=s\d+$/, `=s${size}`) : url;
}

export const lightboxUrl = (id: string, width: number): string =>
  `/api/drive-preview?id=${encodeURIComponent(id)}&mode=image&w=${width}`;

/** How many photos to warm in the background right after the grid loads. */
export function backgroundPreloadCount(tier: NetTier = getNetTier()): number {
  return tier === 'slow' ? 0 : tier === 'medium' ? 4 : 10;
}

/** Offsets (relative to the open photo) to warm while the lightbox is open. */
export function neighborOffsets(tier: NetTier = getNetTier()): number[] {
  return tier === 'slow' ? [1] : tier === 'medium' ? [1, -1, 2] : [1, -1, 2, 3];
}

// ─── Preloader ────────────────────────────────────────────────────────────────

interface Job { url: string; high: boolean }

const MAX_CONCURRENT = 2;
const requested = new Set<string>();
const highQueue: Job[] = [];
const lowQueue: Job[] = [];
let active = 0;

function measure(url: string) {
  if (typeof performance === 'undefined') return;
  const abs = new URL(url, window.location.href).href;
  const entries = performance.getEntriesByName(abs, 'resource') as PerformanceResourceTiming[];
  const entry = entries[entries.length - 1];
  if (!entry || entry.transferSize < 20_000) return; // cache hit or tiny — no signal
  const downloadMs = entry.responseEnd - entry.responseStart;
  if (downloadMs < 5) return;
  reportThroughput((entry.transferSize * 8) / (downloadMs / 1000) / 1e6);
}

function pump() {
  while (active < MAX_CONCURRENT) {
    const job = highQueue.shift() ?? lowQueue.shift();
    if (!job) return;
    active++;
    const img = new Image();
    img.decoding = 'async';
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = job.high ? 'high' : 'low';
    const finish = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      active--;
      if (ok) measure(job.url);
      else requested.delete(job.url); // allow a later retry
      pump();
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = job.url;
  }
}

/** Warm the browser cache for `url`. High-priority jobs jump the queue. */
export function preloadImage(url: string, high = false) {
  if (typeof window === 'undefined') return;
  if (requested.has(url)) {
    // Already queued low but now needed soon — promote it.
    if (high) {
      const i = lowQueue.findIndex((j) => j.url === url);
      if (i !== -1) {
        highQueue.push({ url, high: true });
        lowQueue.splice(i, 1);
        pump();
      }
    }
    return;
  }
  requested.add(url);
  (high ? highQueue : lowQueue).push({ url, high });
  pump();
}

/** Run `cb` once the browser is idle (after `delay` ms). Returns a canceller. */
export function whenIdle(cb: () => void, delay = 600): () => void {
  let idleId: number | undefined;
  const timer = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(cb, { timeout: 2000 });
    } else {
      cb();
    }
  }, delay);
  return () => {
    window.clearTimeout(timer);
    if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId);
    }
  };
}
