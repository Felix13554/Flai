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
 * needs no backend involvement at all — it's a plain `aspect-video` iframe,
 * no per-video dimension lookup or manual letterboxing required, since
 * YouTube's player already letterboxes/pillarboxes itself correctly.
 *
 * PHOTOS: unchanged — a single image, or a full folder gallery, still via
 * Google Drive. The grid uses Google's `thumbnailLink` CDN (fast, zero cost
 * to Flai) and the lightbox loads a larger version through
 * /api/drive-preview?mode=image, which is long-cached at Vercel's edge
 * after the first request.
 *
 * The video embed runs full viewport width (no max-width cap). The page
 * also carries the site's normal NavBar + Footer, rather than being fully
 * standalone chrome-less like /panorama.
 */

import EditableContent from '../components/EditableContent';
import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react';
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

const PreviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [link, setLink] = useState<PreviewLink | null>(null);
  const [meta, setMeta] = useState<MetaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
      <div className="min-h-screen flex flex-col bg-neutral-950">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-neutral-500" size={32} />
        </div>
        <Suspense fallback={null}><Footer /></Suspense>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen flex flex-col bg-neutral-950">
        <NavBar />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
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
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      <SEO title={link.title} noIndex />
      <NavBar />

      {/* ── Video ─────────────────────────────────────────────────────────── */}
      {link.type === 'video' && link.youtube_id && (
        <div className="w-full bg-black">
          <div className="w-full aspect-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${link.youtube_id}`}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={link.title}
            />
          </div>
        </div>
      )}

      {link.type === 'video' && !link.youtube_id && (
        <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm px-6 text-center py-20">
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

      <Suspense fallback={null}><Footer /></Suspense>
    </div>
  );
};

export default PreviewPage;
