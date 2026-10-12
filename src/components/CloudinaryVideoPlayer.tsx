/**
 * CloudinaryVideoPlayer
 *
 * Cloudinary alternative to the YouTube iframe, used by Portfolio, Products,
 * the product cards, PreviewPage and the home sections.
 *
 * It plays video EXACTLY the way HeroVideoSection does:
 *   • source  = cloudinaryMp4Url(publicId)   (vc_h264 / f_mp4 / q_auto:good)
 *   • poster  = cloudinaryPosterUrl(...)     (480 / 960 / 1920 srcSet, derived
 *               from the same processed asset so the crop always matches)
 *   • src is assigned imperatively in a stable ref callback, together with the
 *     same muted / playsinline / webkit-playsinline / crossOrigin attributes
 *   • same error / stall recovery: reload the src with capped exponential
 *     backoff and resume from where playback was
 *   • honours slow connections / data-saver (preload none)
 *
 * The one difference from the hero: NO AUTOPLAY. The poster is shown with a
 * play button; the visitor starts the video themselves (with sound and the
 * normal browser controls). Only one player plays at a time on a page.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { cloudinaryMp4Url, cloudinaryPosterUrl } from '../utils/cloudinaryUrls';

const RECONNECT_MAX_ATTEMPTS = 4;
const RECONNECT_STALL_GRACE_MS = 6000;
const PLAY_EVENT = 'flai-cloudinary-video-play';

// Same connection heuristics as heroPreload.getConnectionInfo (copied so this
// component doesn't import heroPreload, whose module init injects hero preloads).
function getConnectionInfo(): { isSlow: boolean; saveData: boolean } {
  if (typeof navigator === 'undefined') return { isSlow: false, saveData: false };
  const conn =
    (navigator as any).connection ??
    (navigator as any).mozConnection ??
    (navigator as any).webkitConnection;
  return {
    isSlow: conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g',
    saveData: conn?.saveData === true,
  };
}

let _playerCounter = 0;

export interface CloudinaryVideoPlayerProps {
  /** Bare Cloudinary public_id (e.g. "my_video" or "folder/my_video"). */
  publicId: string;
  /** Accessible label for the video. */
  title?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
  /**
   * When true the wrapper has no built-in 16:9 aspect ratio and simply fills
   * its parent (w-full h-full) — used by PreviewPage, which sizes the box
   * itself. Default false → 16:9.
   */
  fill?: boolean;
  /** How the poster/video fit their box. Default 'cover'. */
  objectFit?: 'cover' | 'contain';
  /** Round the corners (matches the YouTube iframes it replaces). Default true. */
  rounded?: boolean;
}

const CloudinaryVideoPlayer: React.FC<CloudinaryVideoPlayerProps> = ({
  publicId,
  title = 'Video',
  className = '',
  fill = false,
  objectFit = 'cover',
  rounded = true,
}) => {
  const playerId = useRef(`cld-${++_playerCounter}`).current;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  const { isSlow, saveData } = useMemo(getConnectionInfo, []);
  // Never pre-fetch more than metadata, and nothing at all on slow / data-saver
  // connections — the visitor hasn't asked for this video yet.
  const preloadVal = isSlow || saveData ? 'none' : 'metadata';

  const videoSrc = useMemo(() => cloudinaryMp4Url(publicId), [publicId]);
  const videoSrcRef = useRef(videoSrc);
  videoSrcRef.current = videoSrc;

  const posterUrl = useMemo(() => cloudinaryPosterUrl(publicId, 1920, 'good'), [publicId]);
  const poster480 = useMemo(() => cloudinaryPosterUrl(publicId, 480, 'eco'), [publicId]);
  const poster960 = useMemo(() => cloudinaryPosterUrl(publicId, 960, 'eco'), [publicId]);
  const posterSrcSet = `${poster480} 480w, ${poster960} 960w, ${posterUrl} 1920w`;

  // Reset when the video changes (e.g. product image carousel, admin preview).
  useEffect(() => {
    setStarted(false);
    setFailed(false);
  }, [publicId]);

  // ── Ref callback — same attribute set + imperative src as HeroVideoSection ──
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.setAttribute('x-webkit-airplay', 'allow');
    // Fetch in CORS mode (Cloudinary's CDN sends Access-Control-Allow-Origin: *),
    // identical to the hero, so the same cached response is reused.
    el.crossOrigin = 'anonymous';
    el.src = videoSrcRef.current;
  }, []);

  // Keep the element's src in sync if publicId changes while it stays mounted.
  useEffect(() => {
    const el = videoRef.current;
    if (el && el.getAttribute('src') !== videoSrc) {
      el.src = videoSrc;
      el.load();
    }
  }, [videoSrc]);

  // ── Only one Cloudinary player at a time ───────────────────────────────────
  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const el = videoRef.current;
      if (id !== playerId && el && !el.paused) el.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, [playerId]);

  // ── Error / stall recovery (same strategy as the hero, minus autoplay) ─────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let attempts = 0;
    let reconnecting = false;
    let reconnectTimer: number | undefined;
    let stallTimer: number | undefined;

    const reconnect = () => {
      if (destroyed || reconnecting) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (attempts >= RECONNECT_MAX_ATTEMPTS) {
        setFailed(true);
        return;
      }
      reconnecting = true;
      attempts += 1;
      const delay = Math.min(500 * 2 ** (attempts - 1), 8000);
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        if (destroyed) { reconnecting = false; return; }
        const resumeAt = isFinite(video.currentTime) ? video.currentTime : 0;
        const wasPlaying = !video.paused;

        const onMeta = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          if (destroyed) return;
          const dur = video.duration;
          if (resumeAt > 0.25 && (!isFinite(dur) || resumeAt < dur - 0.25)) {
            try { video.currentTime = resumeAt; } catch { /* ignore */ }
          }
        };
        const onData = () => {
          video.removeEventListener('loadeddata', onData);
          reconnecting = false;
          if (!destroyed && wasPlaying) video.play().catch(() => {});
        };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
        video.addEventListener('loadeddata', onData, { once: true });
        video.pause();
        video.src = videoSrcRef.current;
        video.load();
      }, delay);
    };

    const armStall = () => {
      if (destroyed || reconnecting) return;
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        if (destroyed || video.paused || video.ended) return;
        reconnect();
      }, RECONNECT_STALL_GRACE_MS);
    };

    const onError = () => { if (video.error) reconnect(); };
    const clearStall = () => { window.clearTimeout(stallTimer); attempts = 0; };

    video.addEventListener('error', onError);
    video.addEventListener('stalled', armStall);
    video.addEventListener('waiting', armStall);
    video.addEventListener('playing', clearStall);
    video.addEventListener('progress', clearStall);

    return () => {
      destroyed = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(stallTimer);
      video.removeEventListener('error', onError);
      video.removeEventListener('stalled', armStall);
      video.removeEventListener('waiting', armStall);
      video.removeEventListener('playing', clearStall);
      video.removeEventListener('progress', clearStall);
    };
  }, [publicId]);

  // ── User starts the video (this is the only way playback begins) ───────────
  const handleStart = useCallback((e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    // A click is a user gesture, so playing with sound is allowed.
    video.muted = false;
    video.volume = 1;
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: playerId }));
    video.play().catch(() => {
      // Some in-app browsers refuse unmuted playback — fall back to muted
      // (the visitor can unmute via the controls) rather than a dead button.
      video.muted = true;
      video.play().catch(() => setStarted(false));
    });
  }, [playerId]);

  const radius = rounded ? 'rounded-lg' : '';
  const sizing = fill ? 'w-full h-full' : 'w-full aspect-video';
  const fitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover';

  return (
    <div
      className={`relative ${sizing} ${radius} overflow-hidden bg-black ${className}`}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <video
        key={publicId}
        ref={setVideoRef}
        // No autoPlay — playback only begins from handleStart().
        controls={started}
        playsInline
        preload={preloadVal}
        controlsList="nodownload"
        aria-label={title}
        className={`absolute inset-0 w-full h-full ${fitClass} bg-black`}
        onPlay={() => {
          setStarted(true);
          window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: playerId }));
        }}
      />

      {/* Poster + play button (shown until the visitor starts the video) */}
      {!started && (
        <button
          type="button"
          onClick={handleStart}
          aria-label={`Afspil video: ${title}`}
          className="absolute inset-0 w-full h-full group cursor-pointer focus:outline-none"
        >
          <img
            src={posterUrl}
            srcSet={posterSrcSet}
            sizes="(max-width: 768px) 100vw, 50vw"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className={`absolute inset-0 w-full h-full ${fitClass}`}
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          />
          <span className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center justify-center w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 group-hover:scale-110 transition-transform">
              <Play size={28} className="text-white ml-1" fill="currentColor" />
            </span>
          </span>
        </button>
      )}

      {failed && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 text-neutral-200 text-xs text-center py-1.5 px-2 pointer-events-none">
          Videoen kunne ikke indlæses lige nu. Prøv igen om lidt.
        </div>
      )}
    </div>
  );
};

export default CloudinaryVideoPlayer;

/**
 * Small poster-only tile (no <video>) for grids, thumbnails and admin lists.
 */
export const CloudinaryVideoThumb: React.FC<{
  publicId: string;
  className?: string;
  iconSize?: number;
}> = ({ publicId, className = '', iconSize = 20 }) => (
  <div className={`relative w-full h-full bg-neutral-800 overflow-hidden ${className}`}>
    <img
      src={cloudinaryPosterUrl(publicId, 480, 'eco')}
      alt=""
      loading="lazy"
      className="absolute inset-0 w-full h-full object-cover opacity-80"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="flex items-center justify-center rounded-full bg-black/60 p-1.5">
        <Play size={iconSize} className="text-white ml-0.5" fill="currentColor" />
      </span>
    </div>
  </div>
);
