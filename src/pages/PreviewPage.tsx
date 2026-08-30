/**
 * PreviewPage.tsx
 *
 * Client-facing page for flai.dk/preview/[ID].
 *
 * VIDEO: embeds YouTube's own iframe player (`youtube.com/embed/ID`) against
 * an unlisted video the admin uploaded by hand. This replaced an earlier
 * design that embedded Google Drive's `/preview` iframe — that was
 * unreliable-to-broken specifically on mobile, and outright broken inside
 * in-app browsers (Zoho Mail, Gmail, Outlook, etc.): those wrap the page in
 * a locked-down WebView that blocks the cross-origin storage Google's Drive
 * player needed and often can't delegate fullscreen/autoplay permissions
 * into a nested third-party iframe. A first-party proxy was tried as a
 * mobile-only fix next, but that traded the problem for ongoing Flai
 * bandwidth cost. YouTube's embed is the industry-standard solution for
 * exactly this (robust across desktop, mobile, and in-app browsers) and
 * needs no backend involvement at all — it's a plain iframe.
 *
 * The video is sized dynamically (in JS, not pure CSS) so it always fits
 * the viewport that's actually left over below the fixed NavBar: it scales
 * to the available width, unless that would make it taller than the
 * available height, in which case it scales to the available height
 * instead — classic "contain" behavior, recalculated on every resize.
 *
 * PHOTOS: unchanged — a single image, or a full folder gallery, still via
 * Google Drive. The grid uses Google's `thumbnailLink` CDN (fast, zero cost
 * to Flai) and the lightbox loads a larger version through
 * /api/drive-preview?mode=image, which is long-cached at Vercel's edge
 * after the first request.
 *
 * The page also carries the site's normal NavBar + Footer, rather than
 * being fully standalone chrome-less like /panorama.
 */

import EditableContent from '../components/EditableContent';
import React, { useEffect, useRef, useState, useCallback, Suspense, lazy } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { PreviewLink } from '../types/index';
import SEO from '../components/SEO';
import NavBar from '../components/NavBar';
import {
  Loader2, AlertCircle, X, ChevronLeft, ChevronRight, Images,
} from 'lucide-react';

const Footer = lazy(() => import('../components/Footer'));

interface FolderItem {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  gridThumb: string | null;
}

type MetaResult =
  | { type: 'image'; id: string; name: string; width: number | null; height: number | null; gridThumb: string | null }
  | { type: 'folder'; id: string; name: string; count: number; items: FolderItem[] }
  | { type: 'unsupported' };

// Gap (px) reserved above the video — clears the fixed NavBar (matches
// the `pt-20` used elsewhere on this page). The video is top-aligned
// right below this gap and grows down/right until it hits either the
// sides or BOTTOM_OFFSET px above the bottom of the viewport.
const TOP_OFFSET = 80;
const BOTTOM_OFFSET = 35;
const VIDEO_ASPECT = 16 / 9;

const PreviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [link, setLink] = useState<PreviewLink | null>(null);
  const [meta, setMeta] = useState<MetaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // ── Dynamic video sizing ────────────────────────────────────────────
  // Scales the player to fill the available width, unless that would push
  // it taller than the available viewport height — in which case it scales
  // to the available height instead. Recomputed on every window resize so
  // dragging the browser window bigger/smaller keeps it perfectly fitted.
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const videoIframeRef = useRef<HTMLIFrameElement>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number }>(() => {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    const availableWidth = window.innerWidth;
    const availableHeight = window.innerHeight - TOP_OFFSET - BOTTOM_OFFSET;
    let width = availableWidth;
    let height = width / VIDEO_ASPECT;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * VIDEO_ASPECT;
    }
    return { width: Math.round(width), height: Math.round(height) };
  });

  useEffect(() => {
    if (link?.type !== 'video' || !link.youtube_id) return;

    // Tracks the last WIDTH we actually sized against. Mobile browsers
    // (iOS Safari especially) resize the *height* of the viewport as
    // their address bar/toolbar collapses and re-expands while the user
    // scrolls — with no real orientation or window-size change involved.
    // Reacting to that made the video visibly grow when scrolling down
    // and shrink back when scrolling up. The device's actual width never
    // changes from that toolbar animation — only a real rotation or
    // window resize changes it — so recomputation is gated on width:
    // pure height-only events (i.e. scroll-driven toolbar movement) are
    // ignored, while width changes (rotation, resize, zoom) or an
    // explicit `force` (first mount, orientation events) always go through.
    let lastWidth: number | null = null;

    const computeSize = (force = false) => {
      const availableWidth = videoWrapRef.current?.clientWidth ?? window.innerWidth;
      const roundedWidth = Math.round(availableWidth);

      if (!force && lastWidth !== null && roundedWidth === lastWidth) return;
      lastWidth = roundedWidth;

      const availableHeight = window.innerHeight - TOP_OFFSET - BOTTOM_OFFSET;

      let width = availableWidth;
      let height = width / VIDEO_ASPECT;

      // Width-first fit overflows the available height — switch to
      // height-first fit instead.
      if (height > availableHeight) {
        height = availableHeight;
        width = height * VIDEO_ASPECT;
      }

      // Round so the container's derived height (TOP_OFFSET + height +
      // BOTTOM_OFFSET, see below) can't drift by fractional pixels between
      // recomputes — that drift is what re-triggers the ResizeObserver
      // below on every pass and shows up as scrollbar/scroll-position jitter.
      setVideoSize((prev) => {
        const next = { width: Math.round(width), height: Math.round(height) };
        return prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };

    let rafId: number | null = null;
    // Batches rapid-fire events (dragging a window edge, rotating a
    // phone, devtools' device toolbar) into one recompute per animation
    // frame instead of one per pixel — the latter is what was causing the
    // scroll glitches: dozens of container-height writes a second while
    // resizing, each shifting the page's scroll position slightly.
    const scheduleCompute = (force = false) => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => computeSize(force));
    };

    computeSize(true);
    const handleResize = () => scheduleCompute(false);
    window.addEventListener('resize', handleResize);
    // visualViewport catches genuine viewport-width changes (pinch zoom,
    // split-screen resize) that some mobile browsers don't reflect in
    // window's own 'resize' event. Still gated by width in computeSize,
    // so toolbar-driven height wobble during scroll is ignored here too.
    window.visualViewport?.addEventListener('resize', handleResize);

    // A real rotation always changes the width, but different mobile
    // browsers commit the new window dimensions at different points in
    // the rotation animation — some as late as several hundred ms after
    // 'orientationchange' fires. Re-measuring a few times over that
    // window (each forced, so it isn't skipped by the width-gate above
    // even if an early read still shows the pre-rotation width) makes
    // sure the video ends up sized for wherever the dimensions actually
    // land, instead of getting stuck on a stale read.
    const orientationTimers: ReturnType<typeof setTimeout>[] = [];
    const handleOrientation = () => {
      [50, 200, 450, 800].forEach((delay) => {
        orientationTimers.push(setTimeout(() => computeSize(true), delay));
      });
    };
    window.addEventListener('orientationchange', handleOrientation);
    const orientationMedia = window.screen?.orientation;
    orientationMedia?.addEventListener?.('change', handleOrientation);

    // Belt-and-suspenders: ResizeObserver catches size changes 'resize'
    // can miss entirely — ancestor/layout shifts, or environments where
    // window 'resize' doesn't fire reliably (some in-app/WebView browsers).
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && videoWrapRef.current) {
      resizeObserver = new ResizeObserver(() => scheduleCompute(false));
      resizeObserver.observe(videoWrapRef.current);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      orientationTimers.forEach((t) => clearTimeout(t));
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
      orientationMedia?.removeEventListener?.('change', handleOrientation);
      resizeObserver?.disconnect();
    };
  }, [link?.type, link?.youtube_id]);

  // ── Rotate-to-fullscreen (mobile only) ──────────────────────────────
  // Flipping a phone to landscape reads as "I want to watch this" — so
  // send the iframe straight into YouTube's own fullscreen player instead
  // of leaving the user to tap the expand button themselves. Flipping back
  // to portrait exits fullscreen again the same way.
  //
  // Caveat: browsers only grant Fullscreen API requests off a direct user
  // gesture (tap/click) — a rotation isn't one. Chrome on Android is
  // lenient enough that this reliably works within its "sticky
  // activation" window after any recent tap; iOS Safari is stricter about
  // iframe fullscreen and will often refuse it outright. Either way the
  // request fails silently rather than erroring, and the user can always
  // fall back to YouTube's own fullscreen button in the player.
  useEffect(() => {
    if (link?.type !== 'video' || !link.youtube_id) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    // Gate to touch devices — desktops/laptops don't rotate, and a mouse
    // user resizing their window into a wide shape shouldn't be yanked
    // into fullscreen.
    if (!window.matchMedia('(pointer: coarse)').matches) return;

    const landscapeQuery = window.matchMedia('(orientation: landscape)');
    let wasLandscape = landscapeQuery.matches;

    const enterFullscreen = () => {
      const iframe = videoIframeRef.current;
      if (!iframe || document.fullscreenElement) return;
      const request =
        iframe.requestFullscreen?.bind(iframe) ??
        (iframe as unknown as { webkitRequestFullscreen?: () => Promise<void> | void }).webkitRequestFullscreen?.bind(iframe);
      try {
        const result = request?.();
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(() => {});
        }
      } catch {
        // Fullscreen request refused (no recent gesture, unsupported on
        // this browser, etc.) — nothing to do, fail silently.
      }
    };

    const exitFullscreen = () => {
      if (document.fullscreenElement !== videoIframeRef.current) return;
      try {
        const result = document.exitFullscreen?.();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // Already left fullscreen some other way — nothing to do.
      }
    };

    const handleFlip = () => {
      const nowLandscape = landscapeQuery.matches;
      if (nowLandscape === wasLandscape) return;
      wasLandscape = nowLandscape;
      if (nowLandscape) {
        // Let the rotation's layout/reflow settle before requesting
        // fullscreen — matches the delayed re-measures in the sizing
        // effect above, for the same reason.
        setTimeout(enterFullscreen, 250);
      } else {
        exitFullscreen();
      }
    };

    landscapeQuery.addEventListener?.('change', handleFlip);
    window.addEventListener('orientationchange', handleFlip);

    return () => {
      landscapeQuery.removeEventListener?.('change', handleFlip);
      window.removeEventListener('orientationchange', handleFlip);
    };
  }, [link?.type, link?.youtube_id]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!id) { setError('Intet preview-ID angivet'); setLoading(false); return; }
      try {
        setLoading(true);

        const { data: linkRow, error: linkErr } = await supabase
          .from('preview_links')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (linkErr) throw linkErr;
        if (!linkRow) throw new Error('Dette preview blev ikke fundet');
        if (!linkRow.is_active) throw new Error('Dette preview er ikke længere aktivt');
        if (cancelled) return;
        setLink(linkRow as PreviewLink);

        // Best-effort view tracking — never blocks rendering.
        supabase
          .from('preview_links')
          .update({ view_count: (linkRow.view_count || 0) + 1, last_viewed_at: new Date().toISOString() })
          .eq('id', id)
          .then(() => {});

        // Video needs no backend lookup — it's just a YouTube ID we already
        // have on the link row. Only photos go via the Drive-backed API.
        if (linkRow.type === 'photos') {
          const metaRes = await fetch(`/api/drive-preview?id=${encodeURIComponent(linkRow.drive_id)}&mode=meta`);
          const metaJson = await metaRes.json();
          if (!metaRes.ok) throw new Error(metaJson.error || 'Kunne ikke hente indhold fra Google Drive');
          if (cancelled) return;
          setMeta(metaJson as MetaResult);
        }
      } catch (err) {
        console.error('Error loading preview:', err);
        const message = err instanceof Error ? err.message : 'Der opstod en fejl';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [id]);

  const items: FolderItem[] =
    meta?.type === 'folder' ? meta.items
    : meta?.type === 'image' ? [{ id: meta.id, name: meta.name, width: meta.width, height: meta.height, gridThumb: meta.gridThumb }]
    : [];

  // Request a lightbox image sized for the viewport at the device's actual pixel
  // density, so photos look sharp on retina/high-DPI screens instead of a fixed
  // 1920px regardless of screen size. Capped at 2400 to match the API's max.
  const lightboxWidth = Math.min(
    2400,
    Math.round((typeof window !== 'undefined' ? window.innerWidth : 1920) * (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1))
  );

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const showPrev = useCallback(() => setLightboxIndex(i => (i === null ? null : (i - 1 + items.length) % items.length)), [items.length]);
  const showNext = useCallback(() => setLightboxIndex(i => (i === null ? null : (i + 1) % items.length)), [items.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showPrev();
      if (e.key === 'ArrowRight') showNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, closeLightbox, showPrev, showNext]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-neutral-900">
        <NavBar />
        <div className="flex-1 flex items-center justify-center pt-20">
          <Loader2 className="animate-spin text-neutral-500" size={32} />
        </div>
        <Suspense fallback={null}><Footer /></Suspense>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen flex flex-col bg-neutral-900">
        <NavBar />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-20">
          <AlertCircle className="text-red-400 mb-4" size={40} />
          <p className="text-neutral-300 max-w-sm">
            <EditableContent contentKey="preview-page-error" fallback={error || 'Preview ikke fundet'} />
          </p>
        </div>
        <Suspense fallback={null}><Footer /></Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col">
      <SEO title={link.title} noIndex />
      <NavBar />

      {/* ── Video ─────────────────────────────────────────────────────────── */}
      {link.type === 'video' && link.youtube_id && (
        <div
          ref={videoWrapRef}
          className="w-full bg-neutral-900 flex items-start justify-center overflow-hidden"
          style={{
            paddingTop: TOP_OFFSET,
            paddingBottom: BOTTOM_OFFSET,
            // Shrink-wraps to the video's actual height instead of always
            // reserving the full viewport. On narrow/portrait screens the
            // video is width-constrained and ends up shorter than the
            // available height — without this, that leftover space just
            // sits empty between the video and the footer below it. Note
            // this can never exceed 100vh: when the video IS
            // height-constrained, videoSize.height already equals
            // `100vh - TOP_OFFSET - BOTTOM_OFFSET`, so the sum below caps
            // out at exactly 100vh in that case.
            height: videoSize.height ? TOP_OFFSET + videoSize.height + BOTTOM_OFFSET : '100vh',
          }}
        >
          <div
            style={{
              width: videoSize.width || '100%',
              height: videoSize.height || undefined,
              maxWidth: '100%',
              maxHeight: `calc(100vh - ${TOP_OFFSET + BOTTOM_OFFSET}px)`,
            }}
          >
            <iframe
              ref={videoIframeRef}
              src={`https://www.youtube-nocookie.com/embed/${link.youtube_id}`}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={link.title}
            />
          </div>
        </div>
      )}

      {link.type === 'video' && !link.youtube_id && (
        <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm px-6 text-center py-20 pt-20">
          Videoen kunne ikke indlæses. Kontakt afsenderen af linket.
        </div>
      )}

      {/* ── Photos ────────────────────────────────────────────────────────── */}
      {link.type === 'photos' && (
        <div className="flex-1 p-4 sm:p-6 pt-20">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
              Ingen billeder fundet.
            </div>
          ) : (
            <div className="grid gap-3 max-w-6xl mx-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gridAutoRows: 'max-content' }}>
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : '1 / 1' }}
                  className="relative w-full rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 hover:border-primary/60 transition-colors group"
                >
                  {item.gridThumb ? (
                    <img
                      src={item.gridThumb}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Images size={20} className="text-neutral-600" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && items[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
          >
            <X size={28} />
          </button>

          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); showPrev(); }}
                className="absolute left-2 sm:left-4 p-2 text-white/70 hover:text-white transition-colors z-10"
              >
                <ChevronLeft size={32} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); showNext(); }}
                className="absolute right-2 sm:right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}

          <img
            key={items[lightboxIndex].id}
            src={`/api/drive-preview?id=${encodeURIComponent(items[lightboxIndex].id)}&mode=image&w=${lightboxWidth}`}
            alt={items[lightboxIndex].name}
            className="max-w-[92vw] max-h-[88vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {items.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
              {lightboxIndex + 1} / {items.length}
            </div>
          )}
        </div>
      )}

      <Suspense fallback={null}><Footer /></Suspense>
    </div>
  );
};

export default PreviewPage;
