/**
 * PreviewPage.tsx
 *
 * Client-facing page for flai.dk/preview/[ID].
 *
 * VIDEO: embeds Google Drive's own player (`/file/d/ID/preview`) directly —
 * one click, on Google's own default play button, no custom overlay. This is
 * Google's officially supported embed mechanism — it streams adaptively
 * straight from Google's CDN with native seeking, so playback never touches
 * Flai's server and has no file-size ceiling.
 *
 * The iframe is wrapped in a box that's measured and sized in JS (see the
 * ResizeObserver effect below) to match the video's real aspect ratio,
 * letterboxed with our own black bars, instead of stretched full-bleed.
 * `object-fit` has no effect on <iframe> elements (browsers explicitly don't
 * apply it there), so this is the only lever we have — but it works because
 * it leaves Google's own poster/player nothing extra to crop into: the box
 * we hand it already matches the content's real shape. Without this, Google's
 * own poster center-crops portrait/vertical videos to fill a landscape box,
 * which looks zoomed-in until played.
 *
 * Two things were deliberately tried and reverted here, worth knowing if this
 * ever needs revisiting:
 *   - A custom poster + play button layered on top of the iframe (another way
 *     to avoid Google's cropped poster) meant two clicks — ours, then
 *     Google's own button underneath. Reverted in favor of a single click.
 *   - Appending `?autoplay=1` to the iframe URL is an undocumented parameter
 *     that reliably produced a broken black-screen state in Safari. Removed
 *     for reliability.
 *
 * PHOTOS: a single image, or a full folder gallery. The grid uses Google's
 * `thumbnailLink` CDN (fast, zero cost to Flai) and the lightbox loads a
 * larger version through /api/drive-preview?mode=image, which is
 * long-cached at Vercel's edge after the first request.
 */

import EditableContent from '../components/EditableContent';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { PreviewLink } from '../types/index';
import SEO from '../components/SEO';
import {
  Loader2, AlertCircle, X, ChevronLeft, ChevronRight, Images,
} from 'lucide-react';

interface FolderItem {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  gridThumb: string | null;
}

type MetaResult =
  | { type: 'video'; id: string; name: string; width: number | null; height: number | null; poster: string | null }
  | { type: 'image'; id: string; name: string; width: number | null; height: number | null; gridThumb: string | null }
  | { type: 'folder'; id: string; name: string; count: number; items: FolderItem[] }
  | { type: 'unsupported' };

const PreviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [link, setLink] = useState<PreviewLink | null>(null);
  const [meta, setMeta] = useState<MetaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [videoBoxSize, setVideoBoxSize] = useState<{ width: number; height: number } | null>(null);

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

        const metaRes = await fetch(`/api/drive-preview?id=${encodeURIComponent(linkRow.drive_id)}&mode=meta`);
        const metaJson = await metaRes.json();
        if (!metaRes.ok) throw new Error(metaJson.error || 'Kunne ikke hente indhold fra Google Drive');
        if (cancelled) return;
        setMeta(metaJson as MetaResult);
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

  // Size the video box to the content's real aspect ratio, computed from the
  // actual measured container space rather than left to CSS auto-sizing —
  // aspect-ratio on a box with both width and height left auto is fragile
  // depending on flex/grid stretch defaults, and can end up wrong specifically
  // for landscape videos in a narrow/portrait viewport. Measuring guarantees
  // correct "contain" behavior (letterboxed either direction) in every case.
  useEffect(() => {
    if (!(link?.type === 'video' && meta?.type === 'video')) return;
    const container = videoContainerRef.current;
    if (!container) return;

    const ratio = meta.width && meta.height ? meta.width / meta.height : 16 / 9;
    let lastWidth = 0;
    let debounceTimer: number | undefined;

    const computeAndSet = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      const containerRatio = clientWidth / clientHeight;
      const width = containerRatio > ratio ? clientHeight * ratio : clientWidth;
      const height = containerRatio > ratio ? clientHeight : clientWidth / ratio;
      setVideoBoxSize({ width, height });
      lastWidth = clientWidth;
    };

    computeAndSet();

    // Mobile-only bug fix: tapping the embedded Google player collapses the
    // browser's address bar/toolbar, which changes the viewport height (and
    // therefore this container's height) at the exact moment the tap lands.
    // That resized the iframe out from under the user's finger, making
    // Google's own controls feel broken/unresponsive — a purely mobile
    // symptom, since desktop browser chrome never collapses on interaction.
    // Fix: only ever re-measure on a genuine *width* change (real resize or
    // orientation change) and ignore height-only fluctuations, debounced so
    // a burst of resize events from the toolbar animation settles once.
    const observer = new ResizeObserver(() => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        const { clientWidth } = container;
        if (Math.abs(clientWidth - lastWidth) < 2) return; // height-only jitter — ignore
        computeAndSet();
      }, 150);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (debounceTimer) window.clearTimeout(debounceTimer);
    };
  }, [link?.type, meta]);

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
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <Loader2 className="animate-spin text-neutral-500" size={32} />
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-center px-6">
        <AlertCircle className="text-red-400 mb-4" size={40} />
        <p className="text-neutral-300 max-w-sm">
          <EditableContent contentKey="preview-page-error" fallback={error || 'Preview ikke fundet'} />
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-neutral-950 flex flex-col">
      <SEO title={link.title} noIndex />

      {/* ── Video ─────────────────────────────────────────────────────────── */}
      {link.type === 'video' && meta?.type === 'video' && (
        <div ref={videoContainerRef} className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {/* The iframe itself doesn't respect object-fit (browsers explicitly
              don't apply it to <iframe>), so instead we measure the available
              space and size THIS wrapper in JS to the video's real aspect
              ratio, letterboxed with our own black bars. That leaves Google's
              own poster/player nothing to crop — the box we hand it already
              matches the content's real shape, landscape or portrait. Falls
              back to 16:9 until measured, or if Drive didn't report the
              video's dimensions. */}
          <div
            className="relative"
            style={videoBoxSize ? { width: videoBoxSize.width, height: videoBoxSize.height } : { width: '100%', height: '100%' }}
          >
            <iframe
              src={`https://drive.google.com/file/d/${link.drive_id}/preview`}
              className="absolute inset-0 w-full h-full border-0"
              style={{ touchAction: 'manipulation' }}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              title={link.title}
            />
          </div>
        </div>
      )}

      {link.type === 'video' && meta?.type !== 'video' && (
        <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm px-6 text-center">
          Videoen kunne ikke indlæses. Kontakt afsenderen af linket.
        </div>
      )}

      {/* ── Photos ────────────────────────────────────────────────────────── */}
      {link.type === 'photos' && (
        <div className="flex-1 p-4 sm:p-6">
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
    </div>
  );
};

export default PreviewPage;
