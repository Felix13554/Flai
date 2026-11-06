import '../utils/heroPreload'
import { initHeroSync } from '../utils/heroSync'
import { extractCloudinaryPublicId, prefetchProjectVideo, preloadProjectForSwitch, isPortraitMobileNow } from '../utils/heroPreload'
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SEO from '../components/SEO';
import { useNavigate } from 'react-router-dom';
import { Video, Camera, MapPin } from 'lucide-react';
import HeroVideoSection from '../components/HeroVideoSection';
import HeroProjectCarousel from '../components/HeroProjectCarousel';
import PortfolioProjectModal from '../components/PortfolioProjectModal';
import { projectKey } from '../utils/portfolioMedia';
import { heroProjectsContent, parseHeroProjectsContent, getHeroProjectLogos } from '../content/heroProjects';
import EditableContent from '../components/EditableContent';
import HomeSectionCard from '../components/HomeSectionCard';
import { useData } from '../contexts/DataContext';
import { useIpCoverage } from '../hooks/useIpCoverage';

// Initialise the Supabase Realtime subscription that pushes hero-video
// cache-bust events to ALL connected browsers/tabs whenever a new video is
// uploaded. Deferred to requestIdleCallback inside initHeroSync — zero impact
// on LCP or first paint.
initHeroSync()

// ---------------------------------------------------------------------------
// DEPLOYED_HOME_SECTIONS — source of truth for hardcoded/deployed sections.
// This array is rewritten by the deploy-home-sections-to-github edge function.
// HomeSectionsManager imports this directly for frontend-side conflict detection.
// ---------------------------------------------------------------------------

// @@INJECTED_SECTIONS_START@@
// Section: Testimonials (9009b281-e411-445f-8c58-7b2470ce61b3)
const Section_9009b281 = ((
  useState, useEffect, useRef, useMemo, useLayoutEffect
) => {
  // ─── Types ────────────────────────────────────────────────────────────────────
    //
    // ONE content key holds every review as a JSON ARRAY. Items mirror the shape
    // coming from cached_reviews.reviews_data so you can copy-paste straight from
    // the Supabase table without reformatting.
    //
    // Required fields per item:  user.name, rating, snippet
    // Optional fields per item:  user.thumbnail, link, business, result
    //
    // Content key:
    //   testimonials-review-2   -> array of ALL reviews (top of array = shown first)
    //
    // Example value:
    // [
    //   {
    //     "user": { "name": "Mette Christensen", "thumbnail": "https://lh3.googleusercontent.com/a/..." },
    //     "rating": 5,
    //     "snippet": "Fantastisk service! Felix leverede utrolig flotte dronefotos.",
    //     "link": "https://maps.google.com/?cid=...",
    //     "business": "Christensen Ejendomme A/S",
    //     "result": "https://res.cloudinary.com/your-cloud-name/video/upload/v1700000000/drone-result.mp4"
    //   },
    //   {
    //     "user": { "name": "Jonas Berg" },
    //     "rating": 5,
    //     "snippet": "Hurtig, professionel og super kvalitet."
    //   }
    // ]
    //
    // "business" is the only field that does NOT exist in cached_reviews — add it manually if wanted.
    // "link" maps to reviews_data[n].link in the cached_reviews table.
    // If "business" is omitted the label shows "Verificeret Google-anmeldelse".
    // If "business" is set it shows the business name only (replacing the default label).
    //
    // "result" is also not in cached_reviews — add it manually per review to show the
    // finished work in its own separate box underneath that review's card (so
    // reviews without a result stay short, instead of every card being padded
    // out to match the tallest one):
    //   - a YouTube URL (watch/shorts/youtu.be/embed link) -> rendered as an embedded video
    //   - a Cloudinary video URL (res.cloudinary.com/.../video/upload/...) -> rendered
    //     as a native <video> player with controls
    //   - any other URL -> treated as an image and rendered as an <img>
    //   - omitted / empty string -> no result box is rendered at all
    //
    // If a thumbnail URL contains the word "square" anywhere in it, the avatar is
    // rendered as a rounded square instead of being cropped into a circle.
    //
    // Content key for the header rating badge:
    //   testimonials-google-rating
    //
    // Example:
    // { "rating": 4.9, "reviewCount": 127, "link": "https://search.google.com/local/writereview?placeid=..." }
    //
    // If this key is left empty, the badge falls back to the average rating and count
    // of every configured review.
    //
    // ─── Layout ──────────────────────────────────────────────────────────────────
    // All reviews sit in ONE strip (the row is never split in two).
    //
    // The strip is NOT a scroll container. Its position is driven by a CSS
    // transform, so there is nothing to swipe, drag or wheel-scroll sideways —
    // the left/right arrow buttons are the only way to move it. Each click moves
    // the strip by exactly one card (clamped at both ends, no wraparound), and a
    // click always visibly moves something: the last move towards an end may be
    // shorter than a full card, but it is never zero.
    // The arrow pair floats centered horizontally over the row, vertically pinned
    // to the gap between the review card and the result card (see "Arrow
    // placement" below) — same placement on mobile and desktop.
    //
    // ─── Which review is centered ─────────────────────────────────────────────────
    // On first render (and again after every resize / phone rotation) the strip
    // is positioned so that the MIDDLE review sits dead-center on screen:
    //   - odd number of reviews  -> the middle review is centered, at every
    //     screen width (this no longer depends on how many cards happen to fit)
    //   - even number of reviews -> there are two middle reviews. If two cards fit
    //     side by side, the gap between them is centered; otherwise the
    //     right-hand one of the two is.
    // If the person has already clicked their way N cards away from the middle,
    // a resize keeps them N cards away instead of jumping back.
    // When every review fits on screen at once the whole strip is simply
    // centered and the arrows stay disabled.
    // On screens narrower than a card plus 2 x 24px, the cards shrink to fit.
    //
    // ─── Arrow placement ────────────────────────────────────────────────────────────
    // The arrow pair is positioned absolutely within .testi-row-wrap (which is
    // therefore position:relative), centered horizontally with left:50% +
    // translateX(-50%), and pinned vertically to sit in the gap between the
    // review card and the result card via the --testi-review-height CSS custom
    // property (the height of the review cards, measured by the row itself with a
    // ResizeObserver so it stays right when fonts or avatars load late). The
    // result card has a 72px top margin, so there is room for the arrow row to
    // sit visually "between" the two boxes without overlapping either.
    //
    // ─── Result media (video/image) ────────────────────────────────────────────────
    // Review cards and result cards are laid out on one CSS grid: every review
    // card sits in grid row 1 and the "result" (see field docs above), if
    // present, sits directly below its review in row 2 of the same column. Row 1
    // is as tall as the tallest review, so all review cards automatically share
    // one height without any JS; a review without a result simply has nothing
    // in row 2, so it stays short. Both boxes share the column's width and move
    // together, and both are covered by the row viewport's left/right edge fade
    // (.testi-row-viewport's mask-image).
    //
    // Cloudinary videos get a poster (thumbnail) built from the same pipeline the
    // homepage hero uses (see utils/cloudinaryUrls.ts → cloudinaryPosterUrl):
    // transformations, version and extension are stripped from the pasted URL
    // first, so any style of Cloudinary link works (with/without extension, with
    // f_auto/q_auto in the path, …). If a poster can't be loaded the next
    // fallback is tried, and finally the browser's own first frame is used.

    interface ReviewUser {
      name: string;
      thumbnail?: string;
    }

    interface ReviewData {
      user: ReviewUser;
      rating: number;
      snippet: string;
      link?: string;
      /** Not in cached_reviews — add manually when editing the content key */
      business?: string;
      /**
       * Not in cached_reviews — add manually when editing the content key.
       * A YouTube URL renders as an embedded video; a Cloudinary video URL
       * renders as a native video player; any other URL is treated as an image.
       * Empty/omitted renders nothing.
       */
      result?: string;
    }

    interface GoogleRatingData {
      rating: number;
      reviewCount: number;
      link?: string;
    }

    const REVIEWS_KEY = 'testimonials-review-2';
    const RATING_KEY = 'testimonials-google-rating';
    const DEFAULT_GOOGLE_LINK =
      'https://search.google.com/local/writereview?placeid=ChIJq5JklwgFuQ0RREPIKUg0EHs';

    const CARD_GAP_PX = 24;
    /** Minimum breathing room kept on each side of a card on very narrow screens. */
    const CARD_SIDE_MARGIN_PX = 24;
    const SLIDE_ANIMATION_MS = 380;
    /** A move to either end shorter than this is not worth a click of its own, so
     * the strip is simply left where it is instead. */
    const EDGE_TOLERANCE_PX = 24;
    /** Width of the generated Cloudinary still (cards are 380px wide → 2x for retina). */
    const POSTER_WIDTH_PX = 800;

    /** Matches youtube.com/watch, youtu.be, /embed/ and /shorts/ links and
     * captures the 11-character video id. */
    const YOUTUBE_URL_REGEX =
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;

    /** File extensions treated as video when found at the end of a URL path. */
    const VIDEO_FILE_REGEX = /\.(mp4|webm|mov|m4v|ogv)$/i;

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    function isValidReview(item: unknown): item is ReviewData {
      const r = item as ReviewData;
      return !!r?.user?.name && !!r?.snippet;
    }

    /** Parses the content key holding a JSON array of review objects. */
    function parseReviewArray(raw: string): ReviewData[] {
      if (!raw.trim()) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isValidReview);
      } catch {
        return [];
      }
    }

    function parseRating(raw: string): GoogleRatingData | null {
      if (!raw.trim()) return null;
      try {
        const parsed = JSON.parse(raw) as GoogleRatingData;
        if (typeof parsed?.rating !== 'number' || typeof parsed?.reviewCount !== 'number') return null;
        return parsed;
      } catch {
        return null;
      }
    }

    function fallbackRating(reviews: ReviewData[]): GoogleRatingData {
      if (reviews.length === 0) return { rating: 0, reviewCount: 0 };
      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      return { rating: Math.round(avg * 10) / 10, reviewCount: reviews.length };
    }

    function getInitials(name: string): string {
      return name
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }

    function nameToHue(name: string): number {
      return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    }

    /** Thumbnails whose URL contains "square" should be shown uncropped
     * (rounded square) instead of being forced into a circle. */
    function isSquareThumbnail(url?: string): boolean {
      return !!url && url.toLowerCase().includes('square');
    }

    /** Returns a privacy-enhanced YouTube embed URL if the given string is a
     * recognizable YouTube link, otherwise null. */
    function getYouTubeEmbedUrl(url: string): string | null {
      const match = url.match(YOUTUBE_URL_REGEX);
      return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
    }

    /** True for Cloudinary video links, e.g.
     * https://res.cloudinary.com/<cloud>/video/upload/v123/my-clip.mp4
     * Matches either the /video/upload/ path segment or a video file extension. */
    function isCloudinaryVideoUrl(url: string): boolean {
      try {
        const u = new URL(url);
        if (!/(^|\.)cloudinary\.com$/i.test(u.hostname)) return false;
        return u.pathname.includes('/video/upload/') || VIDEO_FILE_REGEX.test(u.pathname);
      } catch {
        return false;
      }
    }

    /** Same shape check as utils/cloudinaryUrls.ts: a version segment (v123) or one
     * or more comma-joined `letters_value` transformation params (vc_h264, f_auto,
     * q_auto:good, c_fill,w_400 …). A real public_id segment never matches. */
    function isCloudinaryTransformSegment(segment: string): boolean {
      if (/^v\d+$/.test(segment)) return true;
      return segment.split(',').every((part) => /^[a-z]{1,4}_[\w:.+-]*$/i.test(part));
    }

    /** Splits a Cloudinary video delivery URL into what is needed to build a clean
     * poster URL: the `…/<cloud>/video/upload/` base and the bare public_id (any
     * transformation segments, version, file extension and query string removed).
     * Returns null for anything that can't be rebuilt safely (e.g. signed URLs). */
    function parseCloudinaryVideo(url: string): { base: string; publicId: string } | null {
      try {
        const u = new URL(url);
        const marker = '/video/upload/';
        const at = u.pathname.indexOf(marker);
        if (at < 0) return null;
        const cloud = u.pathname.slice(1, at);
        if (!cloud || cloud.includes('/')) return null;

        const segments = u.pathname.slice(at + marker.length).split('/');
        // Signed URLs (s--signature--) can't be rebuilt with our own transformations.
        if (segments[0].startsWith('s--')) return null;

        let i = 0;
        while (i < segments.length - 1 && isCloudinaryTransformSegment(segments[i])) i++;
        const idSegments = segments.slice(i);
        const last = idSegments[idSegments.length - 1];
        if (!last) return null;
        const dot = last.lastIndexOf('.');
        idSegments[idSegments.length - 1] = dot > 0 ? last.slice(0, dot) : last;

        return { base: `${u.origin}/${cloud}${marker}`, publicId: idSegments.join('/') };
      } catch {
        return null;
      }
    }

    /** Poster (thumbnail) URLs to try, best first.
     *
     * The old poster was made by swapping the video's file extension for .jpg.
     * That silently failed for links without an extension (Cloudinary's default),
     * and for links with f_auto / q_auto / vc_* in the path (the transformation
     * wins over the extension, so the "poster" came back as a video).
     *
     * 1) the hero's pipeline: still taken from the h264 rendition (same
     *    orientation as the video), frame 0, resized by width only
     * 2) the same without vc_h264, in case the h264 rendition isn't available
     * 3) for non-standard Cloudinary URLs: the old extension swap */
    function getCloudinaryPosterCandidates(url: string): string[] {
      const parts = parseCloudinaryVideo(url);
      if (parts) {
        return [
          `${parts.base}vc_h264/so_0/f_jpg/q_auto:good,w_${POSTER_WIDTH_PX}/${parts.publicId}.jpg`,
          `${parts.base}so_0,f_jpg,w_${POSTER_WIDTH_PX}/${parts.publicId}.jpg`,
        ];
      }
      try {
        const u = new URL(url);
        if (VIDEO_FILE_REGEX.test(u.pathname)) {
          u.pathname = u.pathname.replace(VIDEO_FILE_REGEX, '.jpg');
          return [u.toString()];
        }
      } catch {
        /* not a parseable URL — no poster */
      }
      return [];
    }

    /** `#t=0.001` makes browsers that ignore preload="metadata" (iOS Safari) paint
     * the video's first frame instead of an empty black box. */
    function withFirstFrameHint(url: string): string {
      return url.includes('#') ? url : `${url}#t=0.001`;
    }

    function clamp(value: number, min: number, max: number): number {
      return Math.min(max, Math.max(min, value));
    }

    /** How many whole cards fit in the viewport at once. */
    function computeVisibleCount(cardWidth: number, viewportWidth: number, total: number): number {
      const raw = Math.floor((viewportWidth + CARD_GAP_PX) / (cardWidth + CARD_GAP_PX));
      return clamp(raw, 1, total);
    }

    /** The card position that counts as "the middle", in card units: an integer
     * is that card's index, x.5 is the gap right after card x.
     *   - odd total  -> the middle card, always
     *   - even total -> the gap between the two middle cards if an even number of
     *                   cards fits on screen (so pairs sit symmetrically),
     *                   otherwise the right-hand middle card */
    function middleAnchor(total: number, visibleCount: number): number {
      if (total % 2 === 1) return (total - 1) / 2;
      return visibleCount % 2 === 0 ? (total - 1) / 2 : total / 2;
    }

    interface RowMetrics {
      viewportWidth: number;
      trackWidth: number;
      cardWidth: number;
    }

    interface RowLayout {
      /** translateX (px) to apply to the track */
      x: number;
      /** Cards away from the middle position actually shown (0 = middle). */
      offset: number;
      minOffset: number;
      maxOffset: number;
      /** The middle position, in card units (see middleAnchor). */
      anchor: number;
    }

    /** Works out where the track has to be for a given offset from the middle.
     * Everything is integer pixels measured from layout (never from transformed
     * rects), so it can't drift from one render to the next. */
    function computeRowLayout(m: RowMetrics, total: number, requestedOffset: number): RowLayout {
      const { viewportWidth: vw, trackWidth: tw, cardWidth: cw } = m;
      const step = cw + CARD_GAP_PX;
      if (total <= 0 || vw <= 0 || cw <= 0) {
        return { x: 0, offset: 0, minOffset: 0, maxOffset: 0, anchor: 0 };
      }

      const visible = computeVisibleCount(cw, vw, total);
      const anchor = middleAnchor(total, visible);

      // Centers of the viewport, in track coordinates. The first/last "block" of
      // `visible` cards may be centered at most (so the strip never runs further
      // past its ends than half the space left over by a whole number of cards).
      // If every card fits, min === max and the strip is just centered.
      const block = visible * cw + (visible - 1) * CARD_GAP_PX;
      const minCx = block / 2;
      const maxCx = tw - block / 2;
      const midCx = clamp(anchor * step + cw / 2, minCx, maxCx);

      const toEnd = maxCx - midCx;
      const toStart = midCx - minCx;
      const maxOffset = toEnd < EDGE_TOLERANCE_PX ? 0 : Math.max(1, Math.round(toEnd / step));
      const minOffset = toStart < EDGE_TOLERANCE_PX ? 0 : -Math.max(1, Math.round(toStart / step));
      const offset = clamp(requestedOffset, minOffset, maxOffset);

      // Whole-card steps from the middle; the last step towards an end lands
      // exactly on the end position (so it can be a little shorter or longer).
      let cx = midCx + offset * step;
      if (maxOffset > 0 && offset === maxOffset) cx = maxCx;
      else if (minOffset < 0 && offset === minOffset) cx = minCx;

      return { x: Math.round(vw / 2 - cx), offset, minOffset, maxOffset, anchor };
    }

    // ─── Sub-components ───────────────────────────────────────────────────────────

    function GoogleG({ size = 14 }: { size?: number }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      );
    }

    function StarIcon({ filled = true, size = 14 }: { filled?: boolean; size?: number }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#FBBF24' : '#404040'} stroke="none">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    }

    function ReviewCard({ review, column }: { review: ReviewData; column: number }) {
      const hue = nameToHue(review.user.name);
      // Business name fully replaces the default label when present.
      const metaLabel = review.business || 'Verificeret Google-anmeldelse';
      const googleLink = review.link || DEFAULT_GOOGLE_LINK;
      const isSquare = isSquareThumbnail(review.user.thumbnail);
      // Google avatar links can expire or be rate-limited. When one fails, show
      // the initials instead of leaving a hole where the avatar was.
      const [avatarFailed, setAvatarFailed] = useState(false);
      const showAvatar = !!review.user.thumbnail && !avatarFailed;

      return (
        <div
          className="testi-review-card"
          data-testi-index={column - 1}
          style={{ gridColumn: column, gridRow: 1 }}
        >
          <span className="big-quote" aria-hidden="true">&ldquo;</span>
          <p className="testi-quote-text">{review.snippet}</p>
          <div className="testi-author-row">
            <a
              href={googleLink}
              target="_blank"
              rel="noopener noreferrer"
              className="author-link"
              title="Se anmeldelse på Google"
            >
              {showAvatar ? (
                <img
                  src={review.user.thumbnail}
                  alt={review.user.name}
                  className={`author-avatar${isSquare ? ' author-avatar-square' : ''}`}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <div
                  className="author-avatar-fallback"
                  style={{ backgroundColor: `hsl(${hue}, 35%, 28%)` }}
                >
                  {getInitials(review.user.name)}
                </div>
              )}
              <div className="author-info">
                <div className="testi-stars">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <StarIcon key={i} filled={i <= Math.round(review.rating)} />
                  ))}
                </div>
                <p className="author-name">{review.user.name}</p>
                <p className="author-meta">{metaLabel}</p>
              </div>
            </a>
            <a
              href={googleLink}
              target="_blank"
              rel="noopener noreferrer"
              className="google-badge"
              title="Se anmeldelse på Google"
            >
              <GoogleG size={40} />
            </a>
          </div>
        </div>
      );
    }

    /** Native player for a Cloudinary video, with a poster that falls back
     * gracefully (see getCloudinaryPosterCandidates). */
    function ResultVideo({ src, label }: { src: string; label: string }) {
      const posters = useMemo(() => getCloudinaryPosterCandidates(src), [src]);
      const [posterIndex, setPosterIndex] = useState(0);
      const poster: string | undefined = posters[posterIndex];

      // <video poster> has no error event, so probe the candidate with an <img>
      // and move on to the next one (and finally to none) if it can't be loaded.
      useEffect(() => {
        if (!poster) return;
        let active = true;
        const probe = new Image();
        probe.onerror = () => {
          if (active) setPosterIndex((i) => i + 1);
        };
        probe.src = poster;
        return () => {
          active = false;
          probe.onerror = null;
        };
      }, [poster]);

      return (
        <video
          src={withFirstFrameHint(src)}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          aria-label={label}
        />
      );
    }

    /** Separate box stacked below a review's card, holding that review's
     * "result" media (see field docs at the top of the file). Renders nothing
     * when there's no result, so it adds no height to reviews without one. */
    function ResultCard({ review, column }: { review: ReviewData; column: number }) {
      const trimmedResult = review.result?.trim();
      const youtubeEmbedUrl = trimmedResult ? getYouTubeEmbedUrl(trimmedResult) : null;
      const cloudinaryVideoUrl =
        trimmedResult && !youtubeEmbedUrl && isCloudinaryVideoUrl(trimmedResult) ? trimmedResult : null;
      const resultImageUrl =
        trimmedResult && !youtubeEmbedUrl && !cloudinaryVideoUrl ? trimmedResult : null;

      if (!youtubeEmbedUrl && !cloudinaryVideoUrl && !resultImageUrl) return null;

      return (
        <div
          className="testi-result-card"
          data-testi-index={column - 1}
          style={{ gridColumn: column, gridRow: 2 }}
        >
          {youtubeEmbedUrl ? (
            <iframe
              src={youtubeEmbedUrl}
              title={`Resultat af ${review.user.name}s anmeldelse`}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : cloudinaryVideoUrl ? (
            <ResultVideo
              key={cloudinaryVideoUrl}
              src={cloudinaryVideoUrl}
              label={`Resultat af ${review.user.name}s anmeldelse`}
            />
          ) : (
            <img
              src={resultImageUrl!}
              alt={`Resultat af ${review.user.name}s anmeldelse`}
              loading="lazy"
              onError={(e) => {
                const wrapper = e.currentTarget.parentElement as HTMLElement | null;
                if (wrapper) wrapper.style.display = 'none';
              }}
            />
          )}
        </div>
      );
    }

    function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {direction === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
        </svg>
      );
    }

    function TestimonialRow({ reviews }: { reviews: ReviewData[] }) {
      const total = reviews.length;
      const wrapRef = useRef<HTMLDivElement>(null);
      const viewportRef = useRef<HTMLDivElement>(null);
      const trackRef = useRef<HTMLDivElement>(null);
      const metricsRef = useRef<RowMetrics | null>(null);
      const prevTotalRef = useRef(total);

      const [metrics, setMetrics] = useState<RowMetrics | null>(null);
      // Cards away from the middle review (0 = the middle review is centered).
      const [offset, setOffset] = useState(0);
      // Slide smoothly only for arrow clicks — never for the first placement or
      // for a resize, which should simply snap to the right spot.
      const [animate, setAnimate] = useState(false);

      // Derived on every render from live measurements, so it can't go stale.
      const layout = metrics ? computeRowLayout(metrics, total, offset) : null;
      const layoutRef = useRef<RowLayout | null>(null);
      layoutRef.current = layout;
      const shownOffset = layout ? layout.offset : offset;

      useEffect(() => {
        if (prevTotalRef.current !== total) {
          // A different set of reviews starts from the middle again.
          prevTotalRef.current = total;
          setOffset(0);
          return;
        }
        // After a resize the reachable range can shrink; keep the stored offset
        // equal to what is actually shown so a later click moves from there.
        if (shownOffset !== offset) setOffset(shownOffset);
      }, [total, shownOffset, offset]);

      // Measures the strip before the browser paints and again whenever the
      // viewport (screen size, rotation) or a review card (fonts, wrapping)
      // changes size. All sizes are layout sizes, so CSS transforms (ours, or an
      // entrance animation further up the tree) can't skew them.
      useLayoutEffect(() => {
        const wrap = wrapRef.current;
        const viewport = viewportRef.current;
        const track = trackRef.current;
        if (!wrap || !viewport || !track) return;

        const measure = () => {
          const vw = viewport.clientWidth;
          const firstCard = track.querySelector<HTMLElement>('.testi-review-card');
          if (vw <= 0 || !firstCard) return;

          // Cards shrink on screens too narrow for a full-width card plus margins.
          wrap.style.setProperty('--testi-card-cap', `${Math.max(0, vw - 2 * CARD_SIDE_MARGIN_PX)}px`);
          // All review cards share the height of the tallest (CSS grid row), so
          // the first one is representative. Used to pin the arrows.
          wrap.style.setProperty('--testi-review-height', `${firstCard.offsetHeight}px`);

          const next: RowMetrics = {
            viewportWidth: vw,
            trackWidth: track.offsetWidth,
            cardWidth: firstCard.offsetWidth,
          };
          const prev = metricsRef.current;
          if (
            prev &&
            prev.viewportWidth === next.viewportWidth &&
            prev.trackWidth === next.trackWidth &&
            prev.cardWidth === next.cardWidth
          ) {
            return;
          }
          metricsRef.current = next;
          setAnimate(false);
          setMetrics(next);
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        track.querySelectorAll('.testi-review-card').forEach((card) => observer.observe(card));
        return () => observer.disconnect();
      }, [reviews]);

      const stepBy = (direction: -1 | 1) => {
        const current = layoutRef.current;
        if (!current) return;
        const next = clamp(current.offset + direction, current.minOffset, current.maxOffset);
        if (next === current.offset) return;
        setAnimate(true);
        setOffset(next);
      };

      // Keyboard users tabbing into a card that is off screen: bring it into the
      // middle. Mouse/touch focus is ignored on purpose — sliding the strip
      // between mousedown and mouseup would make the click miss its target.
      const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
        const current = layoutRef.current;
        const target = event.target as HTMLElement;
        if (!current) return;
        try {
          if (!target.matches(':focus-visible')) return;
        } catch {
          return;
        }
        const card = target.closest('[data-testi-index]');
        const index = Number(card?.getAttribute('data-testi-index'));
        if (!card || Number.isNaN(index)) return;
        const next = clamp(Math.round(index - current.anchor), current.minOffset, current.maxOffset);
        if (next === current.offset) return;
        setAnimate(true);
        setOffset(next);
      };

      // Browsers that don't support overflow:clip fall back to overflow:hidden,
      // which can still be scrolled by code (e.g. text-selection auto-scroll).
      const keepUnscrolled = (event: React.UIEvent<HTMLDivElement>) => {
        if (event.currentTarget.scrollLeft !== 0) event.currentTarget.scrollLeft = 0;
      };

      return (
        <div className="testi-row-wrap" ref={wrapRef}>
          <div className="testi-row-arrows">
            <button
              type="button"
              className="testi-arrow testi-arrow-left"
              onClick={() => stepBy(-1)}
              disabled={!layout || layout.offset <= layout.minOffset}
              aria-label="Se forrige anmeldelse"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              className="testi-arrow testi-arrow-right"
              onClick={() => stepBy(1)}
              disabled={!layout || layout.offset >= layout.maxOffset}
              aria-label="Se næste anmeldelse"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>

          <div className="testi-row-viewport" ref={viewportRef} onScroll={keepUnscrolled}>
            <div
              ref={trackRef}
              className="testi-row-track"
              onFocus={handleFocus}
              style={{
                transform: layout ? `translateX(${layout.x}px)` : undefined,
                transition: animate
                  ? `transform ${SLIDE_ANIMATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
                  : 'none',
              }}
            >
              {reviews.map((review, i) => (
                <React.Fragment key={`${review.user.name}-${i}`}>
                  <ReviewCard review={review} column={i + 1} />
                  <ResultCard review={review} column={i + 1} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // ─── Main component ───────────────────────────────────────────────────────────

    const Testimonials: React.FC = () => {
      const { getContent } = useData();

      const reviewsRaw = getContent(REVIEWS_KEY, '');
      const ratingRaw = getContent(RATING_KEY, '');

      // Stable array reference: only re-parses (and therefore only produces a
      // new array identity) when the underlying content STRING actually
      // changes, instead of on every render of this component. The row re-measures
      // itself whenever this identity changes, so it must not change needlessly.
      const allReviews = useMemo(() => parseReviewArray(reviewsRaw), [reviewsRaw]);
      const total = allReviews.length;

      // Declared before the early return below so hooks always run in the same
      // order on every render (rules of hooks).
      const ratingData = useMemo(
        () => parseRating(ratingRaw) ?? fallbackRating(allReviews),
        [ratingRaw, allReviews]
      );

      // No reviews configured at all — render nothing.
      if (total === 0) return null;

      return (
        <section className="py-20">
          <style>{`
            .testi-header {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              gap: 20px;
              margin-bottom: 48px;
              padding: 0 24px;
            }
            .testi-rating-badge {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              background: #1a1a1a;
              border: 1px solid #2a2a2a;
              border-radius: 999px;
              padding: 8px 18px;
              text-decoration: none;
              color: #f0f0f0;
              font-family: 'Inter', sans-serif;
              font-size: 0.85rem;
              font-weight: 600;
            }
            .testi-rating-badge .testi-badge-stars {
              display: flex;
              gap: 1px;
            }
            .testi-header h2 {
              font-family: 'Inter', sans-serif;
              font-size: clamp(1.75rem, 3.5vw, 2.75rem);
              font-weight: 700;
              color: #ffffff;
              margin: 0;
              max-width: 700px;
              line-height: 1.2;
            }
            .testi-rows {
              display: flex;
              flex-direction: column;
              gap: 24px;
            }
            .testi-row-wrap {
              display: flex;
              flex-direction: column;
              position: relative;
              --testi-card-max: 380px;
            }
            .testi-row-arrows {
              position: absolute;
              top: calc(var(--testi-review-height, 0px) + 10px);
              left: 50%;
              transform: translateX(-50%);
              display: flex;
              align-items: center;
              gap: 12px;
              z-index: 5;
            }
            /* The strip is NOT a scroll container, so it can't be swiped, dragged or
               wheel-scrolled sideways. The arrow buttons slide the track instead. */
            .testi-row-viewport {
              overflow: hidden;
              overflow: clip;
              width: 100%;
              -webkit-mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);
              mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);
            }
            /* One grid: review cards in row 1 (all as tall as the tallest), the
               optional result cards in row 2, one column per review. */
            .testi-row-track {
              display: grid;
              grid-auto-flow: column;
              grid-auto-columns: min(var(--testi-card-max, 380px), var(--testi-card-cap, 9999px));
              column-gap: 24px;
              width: max-content;
            }
            .testi-arrow {
              flex-shrink: 0;
              width: 52px;
              height: 52px;
              border-radius: 50%;
              border: 1px solid #2f2f2f;
              background: #1a1a1a;
              color: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              touch-action: manipulation;
              -webkit-tap-highlight-color: transparent;
              transition: background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.1s;
            }
            /* Hover styles only where hover really exists — on touch screens a
               sticky :hover state can make the first tap on a button feel dead. */
            @media (hover: hover) {
              .testi-arrow:hover:not(:disabled) {
                background: #262626;
                border-color: #454545;
              }
            }
            .testi-arrow:active:not(:disabled) {
              transform: scale(0.94);
            }
            .testi-arrow:disabled {
              opacity: 0.25;
              cursor: default;
            }
            .testi-review-card {
              background: #141414;
              border: 1px solid #262626;
              border-radius: 20px;
              padding: 32px;
              width: 100%;
              min-width: 0;
              display: flex;
              flex-direction: column;
            }
            .big-quote {
              font-size: 3.5rem;
              line-height: 0.7;
              color: #3B82F6;
              font-family: Georgia, serif;
              font-weight: 700;
              user-select: none;
              display: block;
              margin-bottom: 8px;
            }
            .testi-quote-text {
              font-family: 'Inter', sans-serif;
              font-size: 1.05rem;
              font-weight: 400;
              color: #f0f0f0;
              line-height: 1.6;
              letter-spacing: -0.01em;
              margin: 0;
              flex: 1;
            }
            .testi-author-row {
              display: flex;
              align-items: center;
              gap: 12px;
              margin-top: 20px;
              padding-top: 16px;
              border-top: 1px solid #262626;
            }
            .author-avatar {
              width: 48px; height: 48px;
              border-radius: 50%;
              object-fit: cover;
              flex-shrink: 0;
            }
            .author-avatar-square {
              border-radius: 0;
            }
            .author-avatar-fallback {
              width: 48px; height: 48px;
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              font-size: 1.05rem; font-weight: 700; color: white;
              flex-shrink: 0;
            }
            .author-link {
              display: flex;
              align-items: center;
              gap: 12px;
              flex: 1;
              min-width: 0;
              text-decoration: none;
            }
            .author-info { flex: 1; min-width: 0; }
            .author-name {
              font-size: 0.88rem;
              font-weight: 700;
              color: #ffffff;
              margin: 0 0 2px 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .author-meta {
              font-size: 0.72rem;
              color: #A3A3A3;
              margin: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .google-badge {
              display: flex;
              align-items: center;
              justify-content: center;
              text-decoration: none;
              background: transparent;
              border: none;
              padding: 0;
              flex-shrink: 0;
            }
            .testi-stars {
              display: flex;
              gap: 2px;
              margin-bottom: 6px;
            }
            .testi-result-card {
              background: #141414;
              border: 1px solid #262626;
              border-radius: 20px;
              overflow: hidden;
              aspect-ratio: 16 / 9;
              width: 100%;
              margin-top: 72px;
              align-self: start;
            }
            .testi-result-card iframe,
            .testi-result-card video,
            .testi-result-card img {
              display: block;
              width: 100%;
              height: 100%;
              border: none;
              object-fit: cover;
            }
            @media (max-width: 768px) {
              .testi-row-wrap { --testi-card-max: 300px; }
              .testi-review-card { padding: 24px; }
              .big-quote { font-size: 2.75rem; }
              .testi-quote-text { font-size: 0.95rem; }
              .testi-row-viewport {
                -webkit-mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);
                mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .testi-row-track { transition: none !important; }
            }
          `}</style>

          <div className="testi-header">
            <a
              href={ratingData.link || DEFAULT_GOOGLE_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="testi-rating-badge"
            >
              <span className="testi-badge-stars">
                {[1, 2, 3, 4, 5].map((i) => (
                  <StarIcon key={i} filled={i <= Math.round(ratingData.rating)} size={13} />
                ))}
              </span>
              <EditableContent contentKey="home-page-bedoemt" fallback="Bedømt" /> {Number.isInteger(ratingData.rating) ? ratingData.rating : ratingData.rating.toFixed(1)}<EditableContent contentKey="home-page-5-paa-google" fallback="/5 på Google" />
            </a>
            <h2><EditableContent contentKey="home-page-andre-glade-kunder" fallback="Andre glade kunder" /></h2>
          </div>

          <div className="testi-rows">
            <TestimonialRow reviews={allReviews} />
          </div>
        </section>
      );
    };
  return Testimonials;
})(
  React.useState, React.useEffect, React.useRef, React.useMemo, React.useLayoutEffect
) as React.ComponentType;

const CODE_SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  '9009b281-e411-445f-8c58-7b2470ce61b3': Section_9009b281,
};
// @@INJECTED_SECTIONS_END@@
export const DEPLOYED_HOME_SECTIONS = [
  {
    "id": "9009b281-e411-445f-8c58-7b2470ce61b3",
    "title": "Testimonials",
    "description": "Interactive TSX Section",
    "image_url": null,
    "order_index": 0,
    "is_active": true,
    "created_at": null,
    "updated_at": null,
    "section_type": "code",
    "code_content": null,
    "code_language": null,
    "code_files": [
      {
        "content": "import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';\nimport { useData } from '../contexts/DataContext';\n// ─── Types ────────────────────────────────────────────────────────────────────\n  //\n  // ONE content key holds every review as a JSON ARRAY. Items mirror the shape\n  // coming from cached_reviews.reviews_data so you can copy-paste straight from\n  // the Supabase table without reformatting.\n  //\n  // Required fields per item:  user.name, rating, snippet\n  // Optional fields per item:  user.thumbnail, link, business, result\n  //\n  // Content key:\n  //   testimonials-review-2   -> array of ALL reviews (top of array = shown first)\n  //\n  // Example value:\n  // [\n  //   {\n  //     \"user\": { \"name\": \"Mette Christensen\", \"thumbnail\": \"https://lh3.googleusercontent.com/a/...\" },\n  //     \"rating\": 5,\n  //     \"snippet\": \"Fantastisk service! Felix leverede utrolig flotte dronefotos.\",\n  //     \"link\": \"https://maps.google.com/?cid=...\",\n  //     \"business\": \"Christensen Ejendomme A/S\",\n  //     \"result\": \"https://res.cloudinary.com/your-cloud-name/video/upload/v1700000000/drone-result.mp4\"\n  //   },\n  //   {\n  //     \"user\": { \"name\": \"Jonas Berg\" },\n  //     \"rating\": 5,\n  //     \"snippet\": \"Hurtig, professionel og super kvalitet.\"\n  //   }\n  // ]\n  //\n  // \"business\" is the only field that does NOT exist in cached_reviews — add it manually if wanted.\n  // \"link\" maps to reviews_data[n].link in the cached_reviews table.\n  // If \"business\" is omitted the label shows \"Verificeret Google-anmeldelse\".\n  // If \"business\" is set it shows the business name only (replacing the default label).\n  //\n  // \"result\" is also not in cached_reviews — add it manually per review to show the\n  // finished work in its own separate box underneath that review's card (so\n  // reviews without a result stay short, instead of every card being padded\n  // out to match the tallest one):\n  //   - a YouTube URL (watch/shorts/youtu.be/embed link) -> rendered as an embedded video\n  //   - a Cloudinary video URL (res.cloudinary.com/.../video/upload/...) -> rendered\n  //     as a native <video> player with controls\n  //   - any other URL -> treated as an image and rendered as an <img>\n  //   - omitted / empty string -> no result box is rendered at all\n  //\n  // If a thumbnail URL contains the word \"square\" anywhere in it, the avatar is\n  // rendered as a rounded square instead of being cropped into a circle.\n  //\n  // Content key for the header rating badge:\n  //   testimonials-google-rating\n  //\n  // Example:\n  // { \"rating\": 4.9, \"reviewCount\": 127, \"link\": \"https://search.google.com/local/writereview?placeid=...\" }\n  //\n  // If this key is left empty, the badge falls back to the average rating and count\n  // of every configured review.\n  //\n  // ─── Layout ──────────────────────────────────────────────────────────────────\n  // All reviews sit in ONE strip (the row is never split in two).\n  //\n  // The strip is NOT a scroll container. Its position is driven by a CSS\n  // transform, so there is nothing to swipe, drag or wheel-scroll sideways —\n  // the left/right arrow buttons are the only way to move it. Each click moves\n  // the strip by exactly one card (clamped at both ends, no wraparound), and a\n  // click always visibly moves something: the last move towards an end may be\n  // shorter than a full card, but it is never zero.\n  // The arrow pair floats centered horizontally over the row, vertically pinned\n  // to the gap between the review card and the result card (see \"Arrow\n  // placement\" below) — same placement on mobile and desktop.\n  //\n  // ─── Which review is centered ─────────────────────────────────────────────────\n  // On first render (and again after every resize / phone rotation) the strip\n  // is positioned so that the MIDDLE review sits dead-center on screen:\n  //   - odd number of reviews  -> the middle review is centered, at every\n  //     screen width (this no longer depends on how many cards happen to fit)\n  //   - even number of reviews -> there are two middle reviews. If two cards fit\n  //     side by side, the gap between them is centered; otherwise the\n  //     right-hand one of the two is.\n  // If the person has already clicked their way N cards away from the middle,\n  // a resize keeps them N cards away instead of jumping back.\n  // When every review fits on screen at once the whole strip is simply\n  // centered and the arrows stay disabled.\n  // On screens narrower than a card plus 2 x 24px, the cards shrink to fit.\n  //\n  // ─── Arrow placement ────────────────────────────────────────────────────────────\n  // The arrow pair is positioned absolutely within .testi-row-wrap (which is\n  // therefore position:relative), centered horizontally with left:50% +\n  // translateX(-50%), and pinned vertically to sit in the gap between the\n  // review card and the result card via the --testi-review-height CSS custom\n  // property (the height of the review cards, measured by the row itself with a\n  // ResizeObserver so it stays right when fonts or avatars load late). The\n  // result card has a 72px top margin, so there is room for the arrow row to\n  // sit visually \"between\" the two boxes without overlapping either.\n  //\n  // ─── Result media (video/image) ────────────────────────────────────────────────\n  // Review cards and result cards are laid out on one CSS grid: every review\n  // card sits in grid row 1 and the \"result\" (see field docs above), if\n  // present, sits directly below its review in row 2 of the same column. Row 1\n  // is as tall as the tallest review, so all review cards automatically share\n  // one height without any JS; a review without a result simply has nothing\n  // in row 2, so it stays short. Both boxes share the column's width and move\n  // together, and both are covered by the row viewport's left/right edge fade\n  // (.testi-row-viewport's mask-image).\n  //\n  // Cloudinary videos get a poster (thumbnail) built from the same pipeline the\n  // homepage hero uses (see utils/cloudinaryUrls.ts → cloudinaryPosterUrl):\n  // transformations, version and extension are stripped from the pasted URL\n  // first, so any style of Cloudinary link works (with/without extension, with\n  // f_auto/q_auto in the path, …). If a poster can't be loaded the next\n  // fallback is tried, and finally the browser's own first frame is used.\n\n  interface ReviewUser {\n    name: string;\n    thumbnail?: string;\n  }\n\n  interface ReviewData {\n    user: ReviewUser;\n    rating: number;\n    snippet: string;\n    link?: string;\n    /** Not in cached_reviews — add manually when editing the content key */\n    business?: string;\n    /**\n     * Not in cached_reviews — add manually when editing the content key.\n     * A YouTube URL renders as an embedded video; a Cloudinary video URL\n     * renders as a native video player; any other URL is treated as an image.\n     * Empty/omitted renders nothing.\n     */\n    result?: string;\n  }\n\n  interface GoogleRatingData {\n    rating: number;\n    reviewCount: number;\n    link?: string;\n  }\n\n  const REVIEWS_KEY = 'testimonials-review-2';\n  const RATING_KEY = 'testimonials-google-rating';\n  const DEFAULT_GOOGLE_LINK =\n    'https://search.google.com/local/writereview?placeid=ChIJq5JklwgFuQ0RREPIKUg0EHs';\n\n  const CARD_GAP_PX = 24;\n  /** Minimum breathing room kept on each side of a card on very narrow screens. */\n  const CARD_SIDE_MARGIN_PX = 24;\n  const SLIDE_ANIMATION_MS = 380;\n  /** A move to either end shorter than this is not worth a click of its own, so\n   * the strip is simply left where it is instead. */\n  const EDGE_TOLERANCE_PX = 24;\n  /** Width of the generated Cloudinary still (cards are 380px wide → 2x for retina). */\n  const POSTER_WIDTH_PX = 800;\n\n  /** Matches youtube.com/watch, youtu.be, /embed/ and /shorts/ links and\n   * captures the 11-character video id. */\n  const YOUTUBE_URL_REGEX =\n    /(?:youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/)|youtu\\.be\\/)([\\w-]{11})/i;\n\n  /** File extensions treated as video when found at the end of a URL path. */\n  const VIDEO_FILE_REGEX = /\\.(mp4|webm|mov|m4v|ogv)$/i;\n\n  // ─── Helpers ─────────────────────────────────────────────────────────────────\n\n  function isValidReview(item: unknown): item is ReviewData {\n    const r = item as ReviewData;\n    return !!r?.user?.name && !!r?.snippet;\n  }\n\n  /** Parses the content key holding a JSON array of review objects. */\n  function parseReviewArray(raw: string): ReviewData[] {\n    if (!raw.trim()) return [];\n    try {\n      const parsed = JSON.parse(raw);\n      if (!Array.isArray(parsed)) return [];\n      return parsed.filter(isValidReview);\n    } catch {\n      return [];\n    }\n  }\n\n  function parseRating(raw: string): GoogleRatingData | null {\n    if (!raw.trim()) return null;\n    try {\n      const parsed = JSON.parse(raw) as GoogleRatingData;\n      if (typeof parsed?.rating !== 'number' || typeof parsed?.reviewCount !== 'number') return null;\n      return parsed;\n    } catch {\n      return null;\n    }\n  }\n\n  function fallbackRating(reviews: ReviewData[]): GoogleRatingData {\n    if (reviews.length === 0) return { rating: 0, reviewCount: 0 };\n    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;\n    return { rating: Math.round(avg * 10) / 10, reviewCount: reviews.length };\n  }\n\n  function getInitials(name: string): string {\n    return name\n      .split(/\\s+/)\n      .filter(Boolean)\n      .map((n) => n[0])\n      .slice(0, 2)\n      .join('')\n      .toUpperCase();\n  }\n\n  function nameToHue(name: string): number {\n    return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;\n  }\n\n  /** Thumbnails whose URL contains \"square\" should be shown uncropped\n   * (rounded square) instead of being forced into a circle. */\n  function isSquareThumbnail(url?: string): boolean {\n    return !!url && url.toLowerCase().includes('square');\n  }\n\n  /** Returns a privacy-enhanced YouTube embed URL if the given string is a\n   * recognizable YouTube link, otherwise null. */\n  function getYouTubeEmbedUrl(url: string): string | null {\n    const match = url.match(YOUTUBE_URL_REGEX);\n    return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;\n  }\n\n  /** True for Cloudinary video links, e.g.\n   * https://res.cloudinary.com/<cloud>/video/upload/v123/my-clip.mp4\n   * Matches either the /video/upload/ path segment or a video file extension. */\n  function isCloudinaryVideoUrl(url: string): boolean {\n    try {\n      const u = new URL(url);\n      if (!/(^|\\.)cloudinary\\.com$/i.test(u.hostname)) return false;\n      return u.pathname.includes('/video/upload/') || VIDEO_FILE_REGEX.test(u.pathname);\n    } catch {\n      return false;\n    }\n  }\n\n  /** Same shape check as utils/cloudinaryUrls.ts: a version segment (v123) or one\n   * or more comma-joined `letters_value` transformation params (vc_h264, f_auto,\n   * q_auto:good, c_fill,w_400 …). A real public_id segment never matches. */\n  function isCloudinaryTransformSegment(segment: string): boolean {\n    if (/^v\\d+$/.test(segment)) return true;\n    return segment.split(',').every((part) => /^[a-z]{1,4}_[\\w:.+-]*$/i.test(part));\n  }\n\n  /** Splits a Cloudinary video delivery URL into what is needed to build a clean\n   * poster URL: the `…/<cloud>/video/upload/` base and the bare public_id (any\n   * transformation segments, version, file extension and query string removed).\n   * Returns null for anything that can't be rebuilt safely (e.g. signed URLs). */\n  function parseCloudinaryVideo(url: string): { base: string; publicId: string } | null {\n    try {\n      const u = new URL(url);\n      const marker = '/video/upload/';\n      const at = u.pathname.indexOf(marker);\n      if (at < 0) return null;\n      const cloud = u.pathname.slice(1, at);\n      if (!cloud || cloud.includes('/')) return null;\n\n      const segments = u.pathname.slice(at + marker.length).split('/');\n      // Signed URLs (s--signature--) can't be rebuilt with our own transformations.\n      if (segments[0].startsWith('s--')) return null;\n\n      let i = 0;\n      while (i < segments.length - 1 && isCloudinaryTransformSegment(segments[i])) i++;\n      const idSegments = segments.slice(i);\n      const last = idSegments[idSegments.length - 1];\n      if (!last) return null;\n      const dot = last.lastIndexOf('.');\n      idSegments[idSegments.length - 1] = dot > 0 ? last.slice(0, dot) : last;\n\n      return { base: `${u.origin}/${cloud}${marker}`, publicId: idSegments.join('/') };\n    } catch {\n      return null;\n    }\n  }\n\n  /** Poster (thumbnail) URLs to try, best first.\n   *\n   * The old poster was made by swapping the video's file extension for .jpg.\n   * That silently failed for links without an extension (Cloudinary's default),\n   * and for links with f_auto / q_auto / vc_* in the path (the transformation\n   * wins over the extension, so the \"poster\" came back as a video).\n   *\n   * 1) the hero's pipeline: still taken from the h264 rendition (same\n   *    orientation as the video), frame 0, resized by width only\n   * 2) the same without vc_h264, in case the h264 rendition isn't available\n   * 3) for non-standard Cloudinary URLs: the old extension swap */\n  function getCloudinaryPosterCandidates(url: string): string[] {\n    const parts = parseCloudinaryVideo(url);\n    if (parts) {\n      return [\n        `${parts.base}vc_h264/so_0/f_jpg/q_auto:good,w_${POSTER_WIDTH_PX}/${parts.publicId}.jpg`,\n        `${parts.base}so_0,f_jpg,w_${POSTER_WIDTH_PX}/${parts.publicId}.jpg`,\n      ];\n    }\n    try {\n      const u = new URL(url);\n      if (VIDEO_FILE_REGEX.test(u.pathname)) {\n        u.pathname = u.pathname.replace(VIDEO_FILE_REGEX, '.jpg');\n        return [u.toString()];\n      }\n    } catch {\n      /* not a parseable URL — no poster */\n    }\n    return [];\n  }\n\n  /** `#t=0.001` makes browsers that ignore preload=\"metadata\" (iOS Safari) paint\n   * the video's first frame instead of an empty black box. */\n  function withFirstFrameHint(url: string): string {\n    return url.includes('#') ? url : `${url}#t=0.001`;\n  }\n\n  function clamp(value: number, min: number, max: number): number {\n    return Math.min(max, Math.max(min, value));\n  }\n\n  /** How many whole cards fit in the viewport at once. */\n  function computeVisibleCount(cardWidth: number, viewportWidth: number, total: number): number {\n    const raw = Math.floor((viewportWidth + CARD_GAP_PX) / (cardWidth + CARD_GAP_PX));\n    return clamp(raw, 1, total);\n  }\n\n  /** The card position that counts as \"the middle\", in card units: an integer\n   * is that card's index, x.5 is the gap right after card x.\n   *   - odd total  -> the middle card, always\n   *   - even total -> the gap between the two middle cards if an even number of\n   *                   cards fits on screen (so pairs sit symmetrically),\n   *                   otherwise the right-hand middle card */\n  function middleAnchor(total: number, visibleCount: number): number {\n    if (total % 2 === 1) return (total - 1) / 2;\n    return visibleCount % 2 === 0 ? (total - 1) / 2 : total / 2;\n  }\n\n  interface RowMetrics {\n    viewportWidth: number;\n    trackWidth: number;\n    cardWidth: number;\n  }\n\n  interface RowLayout {\n    /** translateX (px) to apply to the track */\n    x: number;\n    /** Cards away from the middle position actually shown (0 = middle). */\n    offset: number;\n    minOffset: number;\n    maxOffset: number;\n    /** The middle position, in card units (see middleAnchor). */\n    anchor: number;\n  }\n\n  /** Works out where the track has to be for a given offset from the middle.\n   * Everything is integer pixels measured from layout (never from transformed\n   * rects), so it can't drift from one render to the next. */\n  function computeRowLayout(m: RowMetrics, total: number, requestedOffset: number): RowLayout {\n    const { viewportWidth: vw, trackWidth: tw, cardWidth: cw } = m;\n    const step = cw + CARD_GAP_PX;\n    if (total <= 0 || vw <= 0 || cw <= 0) {\n      return { x: 0, offset: 0, minOffset: 0, maxOffset: 0, anchor: 0 };\n    }\n\n    const visible = computeVisibleCount(cw, vw, total);\n    const anchor = middleAnchor(total, visible);\n\n    // Centers of the viewport, in track coordinates. The first/last \"block\" of\n    // `visible` cards may be centered at most (so the strip never runs further\n    // past its ends than half the space left over by a whole number of cards).\n    // If every card fits, min === max and the strip is just centered.\n    const block = visible * cw + (visible - 1) * CARD_GAP_PX;\n    const minCx = block / 2;\n    const maxCx = tw - block / 2;\n    const midCx = clamp(anchor * step + cw / 2, minCx, maxCx);\n\n    const toEnd = maxCx - midCx;\n    const toStart = midCx - minCx;\n    const maxOffset = toEnd < EDGE_TOLERANCE_PX ? 0 : Math.max(1, Math.round(toEnd / step));\n    const minOffset = toStart < EDGE_TOLERANCE_PX ? 0 : -Math.max(1, Math.round(toStart / step));\n    const offset = clamp(requestedOffset, minOffset, maxOffset);\n\n    // Whole-card steps from the middle; the last step towards an end lands\n    // exactly on the end position (so it can be a little shorter or longer).\n    let cx = midCx + offset * step;\n    if (maxOffset > 0 && offset === maxOffset) cx = maxCx;\n    else if (minOffset < 0 && offset === minOffset) cx = minCx;\n\n    return { x: Math.round(vw / 2 - cx), offset, minOffset, maxOffset, anchor };\n  }\n\n  // ─── Sub-components ───────────────────────────────────────────────────────────\n\n  function GoogleG({ size = 14 }: { size?: number }) {\n    return (\n      <svg width={size} height={size} viewBox=\"0 0 24 24\" fill=\"none\">\n        <path d=\"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z\" fill=\"#4285F4\" />\n        <path d=\"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z\" fill=\"#34A853\" />\n        <path d=\"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z\" fill=\"#FBBC05\" />\n        <path d=\"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z\" fill=\"#EA4335\" />\n      </svg>\n    );\n  }\n\n  function StarIcon({ filled = true, size = 14 }: { filled?: boolean; size?: number }) {\n    return (\n      <svg width={size} height={size} viewBox=\"0 0 24 24\" fill={filled ? '#FBBF24' : '#404040'} stroke=\"none\">\n        <path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\" />\n      </svg>\n    );\n  }\n\n  function ReviewCard({ review, column }: { review: ReviewData; column: number }) {\n    const hue = nameToHue(review.user.name);\n    // Business name fully replaces the default label when present.\n    const metaLabel = review.business || 'Verificeret Google-anmeldelse';\n    const googleLink = review.link || DEFAULT_GOOGLE_LINK;\n    const isSquare = isSquareThumbnail(review.user.thumbnail);\n    // Google avatar links can expire or be rate-limited. When one fails, show\n    // the initials instead of leaving a hole where the avatar was.\n    const [avatarFailed, setAvatarFailed] = useState(false);\n    const showAvatar = !!review.user.thumbnail && !avatarFailed;\n\n    return (\n      <div\n        className=\"testi-review-card\"\n        data-testi-index={column - 1}\n        style={{ gridColumn: column, gridRow: 1 }}\n      >\n        <span className=\"big-quote\" aria-hidden=\"true\">&ldquo;</span>\n        <p className=\"testi-quote-text\">{review.snippet}</p>\n        <div className=\"testi-author-row\">\n          <a\n            href={googleLink}\n            target=\"_blank\"\n            rel=\"noopener noreferrer\"\n            className=\"author-link\"\n            title=\"Se anmeldelse på Google\"\n          >\n            {showAvatar ? (\n              <img\n                src={review.user.thumbnail}\n                alt={review.user.name}\n                className={`author-avatar${isSquare ? ' author-avatar-square' : ''}`}\n                referrerPolicy=\"no-referrer\"\n                onError={() => setAvatarFailed(true)}\n              />\n            ) : (\n              <div\n                className=\"author-avatar-fallback\"\n                style={{ backgroundColor: `hsl(${hue}, 35%, 28%)` }}\n              >\n                {getInitials(review.user.name)}\n              </div>\n            )}\n            <div className=\"author-info\">\n              <div className=\"testi-stars\">\n                {[1, 2, 3, 4, 5].map((i) => (\n                  <StarIcon key={i} filled={i <= Math.round(review.rating)} />\n                ))}\n              </div>\n              <p className=\"author-name\">{review.user.name}</p>\n              <p className=\"author-meta\">{metaLabel}</p>\n            </div>\n          </a>\n          <a\n            href={googleLink}\n            target=\"_blank\"\n            rel=\"noopener noreferrer\"\n            className=\"google-badge\"\n            title=\"Se anmeldelse på Google\"\n          >\n            <GoogleG size={40} />\n          </a>\n        </div>\n      </div>\n    );\n  }\n\n  /** Native player for a Cloudinary video, with a poster that falls back\n   * gracefully (see getCloudinaryPosterCandidates). */\n  function ResultVideo({ src, label }: { src: string; label: string }) {\n    const posters = useMemo(() => getCloudinaryPosterCandidates(src), [src]);\n    const [posterIndex, setPosterIndex] = useState(0);\n    const poster: string | undefined = posters[posterIndex];\n\n    // <video poster> has no error event, so probe the candidate with an <img>\n    // and move on to the next one (and finally to none) if it can't be loaded.\n    useEffect(() => {\n      if (!poster) return;\n      let active = true;\n      const probe = new Image();\n      probe.onerror = () => {\n        if (active) setPosterIndex((i) => i + 1);\n      };\n      probe.src = poster;\n      return () => {\n        active = false;\n        probe.onerror = null;\n      };\n    }, [poster]);\n\n    return (\n      <video\n        src={withFirstFrameHint(src)}\n        poster={poster}\n        controls\n        playsInline\n        preload=\"metadata\"\n        aria-label={label}\n      />\n    );\n  }\n\n  /** Separate box stacked below a review's card, holding that review's\n   * \"result\" media (see field docs at the top of the file). Renders nothing\n   * when there's no result, so it adds no height to reviews without one. */\n  function ResultCard({ review, column }: { review: ReviewData; column: number }) {\n    const trimmedResult = review.result?.trim();\n    const youtubeEmbedUrl = trimmedResult ? getYouTubeEmbedUrl(trimmedResult) : null;\n    const cloudinaryVideoUrl =\n      trimmedResult && !youtubeEmbedUrl && isCloudinaryVideoUrl(trimmedResult) ? trimmedResult : null;\n    const resultImageUrl =\n      trimmedResult && !youtubeEmbedUrl && !cloudinaryVideoUrl ? trimmedResult : null;\n\n    if (!youtubeEmbedUrl && !cloudinaryVideoUrl && !resultImageUrl) return null;\n\n    return (\n      <div\n        className=\"testi-result-card\"\n        data-testi-index={column - 1}\n        style={{ gridColumn: column, gridRow: 2 }}\n      >\n        {youtubeEmbedUrl ? (\n          <iframe\n            src={youtubeEmbedUrl}\n            title={`Resultat af ${review.user.name}s anmeldelse`}\n            loading=\"lazy\"\n            allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\"\n            allowFullScreen\n          />\n        ) : cloudinaryVideoUrl ? (\n          <ResultVideo\n            key={cloudinaryVideoUrl}\n            src={cloudinaryVideoUrl}\n            label={`Resultat af ${review.user.name}s anmeldelse`}\n          />\n        ) : (\n          <img\n            src={resultImageUrl!}\n            alt={`Resultat af ${review.user.name}s anmeldelse`}\n            loading=\"lazy\"\n            onError={(e) => {\n              const wrapper = e.currentTarget.parentElement as HTMLElement | null;\n              if (wrapper) wrapper.style.display = 'none';\n            }}\n          />\n        )}\n      </div>\n    );\n  }\n\n  function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {\n    return (\n      <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n        {direction === 'left' ? <path d=\"M15 18l-6-6 6-6\" /> : <path d=\"M9 18l6-6-6-6\" />}\n      </svg>\n    );\n  }\n\n  function TestimonialRow({ reviews }: { reviews: ReviewData[] }) {\n    const total = reviews.length;\n    const wrapRef = useRef<HTMLDivElement>(null);\n    const viewportRef = useRef<HTMLDivElement>(null);\n    const trackRef = useRef<HTMLDivElement>(null);\n    const metricsRef = useRef<RowMetrics | null>(null);\n    const prevTotalRef = useRef(total);\n\n    const [metrics, setMetrics] = useState<RowMetrics | null>(null);\n    // Cards away from the middle review (0 = the middle review is centered).\n    const [offset, setOffset] = useState(0);\n    // Slide smoothly only for arrow clicks — never for the first placement or\n    // for a resize, which should simply snap to the right spot.\n    const [animate, setAnimate] = useState(false);\n\n    // Derived on every render from live measurements, so it can't go stale.\n    const layout = metrics ? computeRowLayout(metrics, total, offset) : null;\n    const layoutRef = useRef<RowLayout | null>(null);\n    layoutRef.current = layout;\n    const shownOffset = layout ? layout.offset : offset;\n\n    useEffect(() => {\n      if (prevTotalRef.current !== total) {\n        // A different set of reviews starts from the middle again.\n        prevTotalRef.current = total;\n        setOffset(0);\n        return;\n      }\n      // After a resize the reachable range can shrink; keep the stored offset\n      // equal to what is actually shown so a later click moves from there.\n      if (shownOffset !== offset) setOffset(shownOffset);\n    }, [total, shownOffset, offset]);\n\n    // Measures the strip before the browser paints and again whenever the\n    // viewport (screen size, rotation) or a review card (fonts, wrapping)\n    // changes size. All sizes are layout sizes, so CSS transforms (ours, or an\n    // entrance animation further up the tree) can't skew them.\n    useLayoutEffect(() => {\n      const wrap = wrapRef.current;\n      const viewport = viewportRef.current;\n      const track = trackRef.current;\n      if (!wrap || !viewport || !track) return;\n\n      const measure = () => {\n        const vw = viewport.clientWidth;\n        const firstCard = track.querySelector<HTMLElement>('.testi-review-card');\n        if (vw <= 0 || !firstCard) return;\n\n        // Cards shrink on screens too narrow for a full-width card plus margins.\n        wrap.style.setProperty('--testi-card-cap', `${Math.max(0, vw - 2 * CARD_SIDE_MARGIN_PX)}px`);\n        // All review cards share the height of the tallest (CSS grid row), so\n        // the first one is representative. Used to pin the arrows.\n        wrap.style.setProperty('--testi-review-height', `${firstCard.offsetHeight}px`);\n\n        const next: RowMetrics = {\n          viewportWidth: vw,\n          trackWidth: track.offsetWidth,\n          cardWidth: firstCard.offsetWidth,\n        };\n        const prev = metricsRef.current;\n        if (\n          prev &&\n          prev.viewportWidth === next.viewportWidth &&\n          prev.trackWidth === next.trackWidth &&\n          prev.cardWidth === next.cardWidth\n        ) {\n          return;\n        }\n        metricsRef.current = next;\n        setAnimate(false);\n        setMetrics(next);\n      };\n\n      measure();\n      const observer = new ResizeObserver(measure);\n      observer.observe(viewport);\n      track.querySelectorAll('.testi-review-card').forEach((card) => observer.observe(card));\n      return () => observer.disconnect();\n    }, [reviews]);\n\n    const stepBy = (direction: -1 | 1) => {\n      const current = layoutRef.current;\n      if (!current) return;\n      const next = clamp(current.offset + direction, current.minOffset, current.maxOffset);\n      if (next === current.offset) return;\n      setAnimate(true);\n      setOffset(next);\n    };\n\n    // Keyboard users tabbing into a card that is off screen: bring it into the\n    // middle. Mouse/touch focus is ignored on purpose — sliding the strip\n    // between mousedown and mouseup would make the click miss its target.\n    const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {\n      const current = layoutRef.current;\n      const target = event.target as HTMLElement;\n      if (!current) return;\n      try {\n        if (!target.matches(':focus-visible')) return;\n      } catch {\n        return;\n      }\n      const card = target.closest('[data-testi-index]');\n      const index = Number(card?.getAttribute('data-testi-index'));\n      if (!card || Number.isNaN(index)) return;\n      const next = clamp(Math.round(index - current.anchor), current.minOffset, current.maxOffset);\n      if (next === current.offset) return;\n      setAnimate(true);\n      setOffset(next);\n    };\n\n    // Browsers that don't support overflow:clip fall back to overflow:hidden,\n    // which can still be scrolled by code (e.g. text-selection auto-scroll).\n    const keepUnscrolled = (event: React.UIEvent<HTMLDivElement>) => {\n      if (event.currentTarget.scrollLeft !== 0) event.currentTarget.scrollLeft = 0;\n    };\n\n    return (\n      <div className=\"testi-row-wrap\" ref={wrapRef}>\n        <div className=\"testi-row-arrows\">\n          <button\n            type=\"button\"\n            className=\"testi-arrow testi-arrow-left\"\n            onClick={() => stepBy(-1)}\n            disabled={!layout || layout.offset <= layout.minOffset}\n            aria-label=\"Se forrige anmeldelse\"\n          >\n            <ChevronIcon direction=\"left\" />\n          </button>\n          <button\n            type=\"button\"\n            className=\"testi-arrow testi-arrow-right\"\n            onClick={() => stepBy(1)}\n            disabled={!layout || layout.offset >= layout.maxOffset}\n            aria-label=\"Se næste anmeldelse\"\n          >\n            <ChevronIcon direction=\"right\" />\n          </button>\n        </div>\n\n        <div className=\"testi-row-viewport\" ref={viewportRef} onScroll={keepUnscrolled}>\n          <div\n            ref={trackRef}\n            className=\"testi-row-track\"\n            onFocus={handleFocus}\n            style={{\n              transform: layout ? `translateX(${layout.x}px)` : undefined,\n              transition: animate\n                ? `transform ${SLIDE_ANIMATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`\n                : 'none',\n            }}\n          >\n            {reviews.map((review, i) => (\n              <React.Fragment key={`${review.user.name}-${i}`}>\n                <ReviewCard review={review} column={i + 1} />\n                <ResultCard review={review} column={i + 1} />\n              </React.Fragment>\n            ))}\n          </div>\n        </div>\n      </div>\n    );\n  }\n\n  // ─── Main component ───────────────────────────────────────────────────────────\n\n  const Testimonials: React.FC = () => {\n    const { getContent } = useData();\n\n    const reviewsRaw = getContent(REVIEWS_KEY, '');\n    const ratingRaw = getContent(RATING_KEY, '');\n\n    // Stable array reference: only re-parses (and therefore only produces a\n    // new array identity) when the underlying content STRING actually\n    // changes, instead of on every render of this component. The row re-measures\n    // itself whenever this identity changes, so it must not change needlessly.\n    const allReviews = useMemo(() => parseReviewArray(reviewsRaw), [reviewsRaw]);\n    const total = allReviews.length;\n\n    // Declared before the early return below so hooks always run in the same\n    // order on every render (rules of hooks).\n    const ratingData = useMemo(\n      () => parseRating(ratingRaw) ?? fallbackRating(allReviews),\n      [ratingRaw, allReviews]\n    );\n\n    // No reviews configured at all — render nothing.\n    if (total === 0) return null;\n\n    return (\n      <section className=\"py-20\">\n        <style>{`\n          .testi-header {\n            display: flex;\n            flex-direction: column;\n            align-items: center;\n            text-align: center;\n            gap: 20px;\n            margin-bottom: 48px;\n            padding: 0 24px;\n          }\n          .testi-rating-badge {\n            display: inline-flex;\n            align-items: center;\n            gap: 8px;\n            background: #1a1a1a;\n            border: 1px solid #2a2a2a;\n            border-radius: 999px;\n            padding: 8px 18px;\n            text-decoration: none;\n            color: #f0f0f0;\n            font-family: 'Inter', sans-serif;\n            font-size: 0.85rem;\n            font-weight: 600;\n          }\n          .testi-rating-badge .testi-badge-stars {\n            display: flex;\n            gap: 1px;\n          }\n          .testi-header h2 {\n            font-family: 'Inter', sans-serif;\n            font-size: clamp(1.75rem, 3.5vw, 2.75rem);\n            font-weight: 700;\n            color: #ffffff;\n            margin: 0;\n            max-width: 700px;\n            line-height: 1.2;\n          }\n          .testi-rows {\n            display: flex;\n            flex-direction: column;\n            gap: 24px;\n          }\n          .testi-row-wrap {\n            display: flex;\n            flex-direction: column;\n            position: relative;\n            --testi-card-max: 380px;\n          }\n          .testi-row-arrows {\n            position: absolute;\n            top: calc(var(--testi-review-height, 0px) + 10px);\n            left: 50%;\n            transform: translateX(-50%);\n            display: flex;\n            align-items: center;\n            gap: 12px;\n            z-index: 5;\n          }\n          /* The strip is NOT a scroll container, so it can't be swiped, dragged or\n             wheel-scrolled sideways. The arrow buttons slide the track instead. */\n          .testi-row-viewport {\n            overflow: hidden;\n            overflow: clip;\n            width: 100%;\n            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);\n            mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);\n          }\n          /* One grid: review cards in row 1 (all as tall as the tallest), the\n             optional result cards in row 2, one column per review. */\n          .testi-row-track {\n            display: grid;\n            grid-auto-flow: column;\n            grid-auto-columns: min(var(--testi-card-max, 380px), var(--testi-card-cap, 9999px));\n            column-gap: 24px;\n            width: max-content;\n          }\n          .testi-arrow {\n            flex-shrink: 0;\n            width: 52px;\n            height: 52px;\n            border-radius: 50%;\n            border: 1px solid #2f2f2f;\n            background: #1a1a1a;\n            color: #ffffff;\n            display: flex;\n            align-items: center;\n            justify-content: center;\n            cursor: pointer;\n            touch-action: manipulation;\n            -webkit-tap-highlight-color: transparent;\n            transition: background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.1s;\n          }\n          /* Hover styles only where hover really exists — on touch screens a\n             sticky :hover state can make the first tap on a button feel dead. */\n          @media (hover: hover) {\n            .testi-arrow:hover:not(:disabled) {\n              background: #262626;\n              border-color: #454545;\n            }\n          }\n          .testi-arrow:active:not(:disabled) {\n            transform: scale(0.94);\n          }\n          .testi-arrow:disabled {\n            opacity: 0.25;\n            cursor: default;\n          }\n          .testi-review-card {\n            background: #141414;\n            border: 1px solid #262626;\n            border-radius: 20px;\n            padding: 32px;\n            width: 100%;\n            min-width: 0;\n            display: flex;\n            flex-direction: column;\n          }\n          .big-quote {\n            font-size: 3.5rem;\n            line-height: 0.7;\n            color: #3B82F6;\n            font-family: Georgia, serif;\n            font-weight: 700;\n            user-select: none;\n            display: block;\n            margin-bottom: 8px;\n          }\n          .testi-quote-text {\n            font-family: 'Inter', sans-serif;\n            font-size: 1.05rem;\n            font-weight: 400;\n            color: #f0f0f0;\n            line-height: 1.6;\n            letter-spacing: -0.01em;\n            margin: 0;\n            flex: 1;\n          }\n          .testi-author-row {\n            display: flex;\n            align-items: center;\n            gap: 12px;\n            margin-top: 20px;\n            padding-top: 16px;\n            border-top: 1px solid #262626;\n          }\n          .author-avatar {\n            width: 48px; height: 48px;\n            border-radius: 50%;\n            object-fit: cover;\n            flex-shrink: 0;\n          }\n          .author-avatar-square {\n            border-radius: 0;\n          }\n          .author-avatar-fallback {\n            width: 48px; height: 48px;\n            border-radius: 50%;\n            display: flex; align-items: center; justify-content: center;\n            font-size: 1.05rem; font-weight: 700; color: white;\n            flex-shrink: 0;\n          }\n          .author-link {\n            display: flex;\n            align-items: center;\n            gap: 12px;\n            flex: 1;\n            min-width: 0;\n            text-decoration: none;\n          }\n          .author-info { flex: 1; min-width: 0; }\n          .author-name {\n            font-size: 0.88rem;\n            font-weight: 700;\n            color: #ffffff;\n            margin: 0 0 2px 0;\n            white-space: nowrap;\n            overflow: hidden;\n            text-overflow: ellipsis;\n          }\n          .author-meta {\n            font-size: 0.72rem;\n            color: #A3A3A3;\n            margin: 0;\n            white-space: nowrap;\n            overflow: hidden;\n            text-overflow: ellipsis;\n          }\n          .google-badge {\n            display: flex;\n            align-items: center;\n            justify-content: center;\n            text-decoration: none;\n            background: transparent;\n            border: none;\n            padding: 0;\n            flex-shrink: 0;\n          }\n          .testi-stars {\n            display: flex;\n            gap: 2px;\n            margin-bottom: 6px;\n          }\n          .testi-result-card {\n            background: #141414;\n            border: 1px solid #262626;\n            border-radius: 20px;\n            overflow: hidden;\n            aspect-ratio: 16 / 9;\n            width: 100%;\n            margin-top: 72px;\n            align-self: start;\n          }\n          .testi-result-card iframe,\n          .testi-result-card video,\n          .testi-result-card img {\n            display: block;\n            width: 100%;\n            height: 100%;\n            border: none;\n            object-fit: cover;\n          }\n          @media (max-width: 768px) {\n            .testi-row-wrap { --testi-card-max: 300px; }\n            .testi-review-card { padding: 24px; }\n            .big-quote { font-size: 2.75rem; }\n            .testi-quote-text { font-size: 0.95rem; }\n            .testi-row-viewport {\n              -webkit-mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);\n              mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);\n            }\n          }\n          @media (prefers-reduced-motion: reduce) {\n            .testi-row-track { transition: none !important; }\n          }\n        `}</style>\n\n        <div className=\"testi-header\">\n          <a\n            href={ratingData.link || DEFAULT_GOOGLE_LINK}\n            target=\"_blank\"\n            rel=\"noopener noreferrer\"\n            className=\"testi-rating-badge\"\n          >\n            <span className=\"testi-badge-stars\">\n              {[1, 2, 3, 4, 5].map((i) => (\n                <StarIcon key={i} filled={i <= Math.round(ratingData.rating)} size={13} />\n              ))}\n            </span>\n            Bedømt {Number.isInteger(ratingData.rating) ? ratingData.rating : ratingData.rating.toFixed(1)}/5 på Google\n          </a>\n          <h2>Andre glade kunder</h2>\n        </div>\n\n        <div className=\"testi-rows\">\n          <TestimonialRow reviews={allReviews} />\n        </div>\n      </section>\n    );\n  };\n\nexport default Testimonials;",
        "filename": "component.tsx",
        "language": "tsx"
      }
    ],
    "image_url_2": null,
    "image_url_3": null,
    "used_images": null,
    "visual_editor_images": null
  },
  {
    "id": "7ea821e3-ea0d-496d-baa4-9e0e8b69ebb9",
    "title": "Efterbehandling",
    "description": "<p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\"></p><p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\">Jeg lægger en ekstra indsats i hvert projekt – både under optagelserne, og bagefter, når materialet skal klippes sammen. Jeg går grundigt igennem alt optaget materiale og vælger de bedste klip ud. Farverne bliver tilpasset, så de fremstår naturlige.</p><p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\">Det er denne del af arbejdet, der gør forskellen på et almindeligt resultat og et gennemarbejdet produkt. Jeg tager mig den tid, der skal til, for at sikre, at det færdige resultat lever op til kundens forventninger.</p>",
    "image_url": "cloudinary:scan-pork",
    "order_index": 2,
    "is_active": true,
    "created_at": null,
    "updated_at": null,
    "section_type": "standard",
    "code_content": null,
    "code_language": null,
    "code_files": null,
    "image_url_2": null,
    "image_url_3": null,
    "used_images": null,
    "visual_editor_images": null
  },
  {
    "id": "8bdc2c06-1889-4176-99cc-73a4d626f545",
    "title": "Mød Felix",
    "description": "<p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\">Jeg hedder Felix, jeg er 13 år gammel, og ejeren af Flai og virksomhedens dronepilot.</p><p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\">Selvom jeg er ung, tager jeg mine kunder seriøst, og jeg går til hver opgave med faglighed og engagement. Uanset om opgaven er en mindre optagelse eller en større produktion, er mit mål at give kunden en god oplevelse fra første kontakt til afleveret opgave.</p>",
    "image_url": "https://pbqeljimuerxatrtmgsn.supabase.co/storage/v1/object/public/home-sections/Felix.webp",
    "order_index": 2,
    "is_active": true,
    "created_at": null,
    "updated_at": null,
    "section_type": "standard",
    "code_content": null,
    "code_language": null,
    "code_files": null,
    "image_url_2": null,
    "image_url_3": null,
    "used_images": [
      "https://pbqeljimuerxatrtmgsn.supabase.co/storage/v1/object/public/home-sections/Felix.webp"
    ],
    "visual_editor_images": null
  }
];


const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { getContent, isSiteContentLoaded, homeSections: dbSections, isHomeSectionsLoaded, portfolioImages } = useData();
  const { loading: coverageLoading, covered, cityName } = useIpCoverage();

  const heroLogo     = getContent('site-logo',      '/Logo.webp', 'image');
  const heroSubtitle = getContent('hero-subtitle',  'Dronefotografering og -optagelser i Syddanmark. 100% tilfredshedsgaranti.');
  const contactEmail = getContent('contact-email',  'fb@flai.dk');
  const contactPhone = getContent('contact-phone',  '+45 27 29 21 99');

  // Hero project carousel — content comes from the CMS "content" key
  // (Indholdsstyring → general → Content), stored as a bare JSON array —
  // same pattern as the testimonials-review-2 key elsewhere on this page.
  // Falls back to the static mock (heroProjectsContent) only when that CMS
  // key is empty or fails to parse, so the hero is never blank.
  // Handles any number of configured projects — 1, 2, 3, or more — nothing
  // here assumes a fixed count.
  const heroProjectItems = useMemo(
  () => parseHeroProjectsContent(
    getContent(
      'content',
      JSON.stringify([
        {
          number: '01',
          industry: 'Specialister i salg af smågrise',
          clientLogoUrl:
            'https://pbqeljimuerxatrtmgsn.supabase.co/storage/v1/object/public/client-logos/1782478431391-38f16914.webp?square',
          cloudinaryVideoUrl:
            'https://res.cloudinary.com/dq6jxbyrg/video/upload/sp_auto/scan-pork.m3u8',
          projectSlug: 'Specialister i salg af smågrise',
          website: 'https://scan-pork.com/',
        },
        {
          number: '02',
          industry: 'Leverandør til print, skilte- og bilindpakningsfirmaer',
          clientLogoUrl:
            'https://vikiallo.dk/wp-content/uploads/vikiallo-white-LOGO@2x.png',
          cloudinaryVideoUrl:
            'https://res.cloudinary.com/dq6jxbyrg/video/upload/sp_auto/vikiallo.m3u8',
          projectSlug: 'Leverandør til print, skilte- og bilindpakningsfirmaer',
          website: 'https://vikiallo.dk/',
        },
      ])
    ),
    heroProjectsContent.content
  ),
  [getContent]
);

  // Which project's video/content is currently shown. Lifted up here
  // (rather than owned inside the carousel) because the active project's
  // Cloudinary public_id also has to be handed to <HeroVideoSection>, which
  // sits as a sibling wrapper around the carousel.
  const [activeProjectIndex, setActiveProjectIndex] = useState(0);

  // Playback progress (0–1) of the active project's video, used to draw the
  // growing line under its number in the carousel. Reset whenever the active
  // project changes so the new video's tab doesn't briefly show the old
  // video's leftover progress before its own timeupdate ticks arrive.
  const [heroVideoProgress, setHeroVideoProgress] = useState(0);
  useEffect(() => {
    setHeroVideoProgress(0);
  }, [activeProjectIndex]);

  // If the CMS content reloads with fewer projects than before (e.g. admin
  // trims 3 down to 1), clamp back to a valid index instead of pointing at
  // an item that no longer exists.
  useEffect(() => {
    if (activeProjectIndex > heroProjectItems.length - 1) setActiveProjectIndex(0);
  }, [heroProjectItems.length, activeProjectIndex]);

  const activeProject = heroProjectItems[activeProjectIndex];

  // Hero-knappen "Se projekt" sender ikke længere besøgende til Projekter-siden:
  // den åbner portfolio-kortet (PortfolioTaskCard) for projektet med samme navn
  // som `project` i det aktive hero-projekt (CMS "content"-nøglen) i en modal
  // med blurret baggrund oven på forsiden. Hero-videoen pauses, mens den er åben.
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const activeProjectName = activeProject?.project?.trim();
  const activePortfolioTask = useMemo(() => {
    const wanted = projectKey(activeProjectName);
    if (!wanted) return undefined;
    return portfolioImages.find(
      (t) => ((t.media && t.media.length > 0) || t.image_url) && projectKey(t.title) === wanted,
    );
  }, [portfolioImages, activeProjectName]);

  const handleSeeProject = useCallback(() => {
    if (activePortfolioTask) {
      setProjectModalOpen(true);
      return;
    }
    // Reserve: projektet har intet (fundet) portfolio-kort at vise — så er
    // Projekter-siden stadig bedre end en knap, der ikke gør noget.
    navigate('/portfolio', activeProjectName ? { state: { scrollToProject: activeProjectName } } : undefined);
  }, [navigate, activePortfolioTask, activeProjectName]);
  const handleCloseProject = useCallback(() => setProjectModalOpen(false), []);

  // Skifter hero-projektet, mens modalen er åben (fx via auto-advance, hvis videoen
  // skulle nå at slutte), lukkes modalen i stedet for at vise et andet projekt.
  useEffect(() => {
    setProjectModalOpen(false);
  }, [activeProjectIndex]);
  const activeProjectPublicId = activeProject
    ? extractCloudinaryPublicId(activeProject.cloudinaryVideoUrl)
    : undefined;
  // Optional vertical/mobile cut for the active project — falls back to
  // `undefined` (which makes HeroVideoSection just keep using the desktop
  // id on mobile too) whenever the CMS entry hasn't set a mobile video.
  const activeProjectMobilePublicId =
    activeProject?.cloudinaryVideoUrlMobile
      ? extractCloudinaryPublicId(activeProject.cloudinaryVideoUrlMobile)
      : undefined;

  // Advance to the next project only once the current one's video has
  // played all the way through (HeroVideoSection's `onEnded`), instead of
  // switching on a fixed timer that could cut a longer video off early.
  // No-op with 0 or 1 projects, matching HeroProjectCarousel's own guard.
  // Both a tab click and the auto-advance go through `requestProject`: the
  // carousel keeps showing the CURRENT project until the requested one is
  // fully loaded (poster, start of the video, logos), and only then swaps
  // text, logo and video together — so the hero never shows a half-loaded
  // project. `switchTokenRef` makes the latest request win if the visitor
  // clicks again while an earlier one is still loading; the preload has a
  // timeout, so a slow asset can never leave the hero stuck.
  const activeProjectIndexRef = useRef(activeProjectIndex);
  activeProjectIndexRef.current = activeProjectIndex;
  const switchTokenRef = useRef(0);

  const requestProject = useCallback((index: number) => {
    const item = heroProjectItems[index];
    if (!item || index === activeProjectIndexRef.current) {
      switchTokenRef.current += 1; // cancel any pending switch to elsewhere
      return;
    }
    const token = ++switchTokenRef.current;
    const desktopId = extractCloudinaryPublicId(item.cloudinaryVideoUrl);
    const mobileId = item.cloudinaryVideoUrlMobile
      ? extractCloudinaryPublicId(item.cloudinaryVideoUrlMobile)
      : undefined;
    // Same choice HeroVideoSection makes: the vertical cut only on a phone in portrait.
    const videoId = isPortraitMobileNow() && mobileId ? mobileId : desktopId;
    preloadProjectForSwitch({
      publicId: videoId || undefined,
      logoUrls: getHeroProjectLogos(item).map((l) => l.url),
    }).then(() => {
      if (switchTokenRef.current === token) setActiveProjectIndex(index);
    });
  }, [heroProjectItems]);

  const handleProjectVideoEnded = useCallback(() => {
    if (heroProjectItems.length > 1) {
      requestProject((activeProjectIndexRef.current + 1) % heroProjectItems.length);
    }
  }, [heroProjectItems.length, requestProject]);

  // Warm the cache for whichever project tab the visitor is most likely to
  // land on next — the auto-advance target, and the tab on either side of
  // the active one (numbered tabs invite clicking a neighbour) — so
  // switching feels instant instead of every tab click/auto-advance
  // triggering a cold video fetch. Deferred to idle time so it never
  // competes with the currently-active video's own loading/playback, and
  // prefetchProjectVideo itself skips slow/metered connections.
  useEffect(() => {
    if (heroProjectItems.length <= 1) return;
    const neighborIds = new Set<string>();
    [
      (activeProjectIndex + 1) % heroProjectItems.length,
      (activeProjectIndex - 1 + heroProjectItems.length) % heroProjectItems.length,
    ].forEach((i) => {
      const item = heroProjectItems[i];
      if (!item) return;
      const id = extractCloudinaryPublicId(item.cloudinaryVideoUrl);
      if (id && id !== activeProjectPublicId) neighborIds.add(id);
      // Also warm the mobile cut, if this project has one — whichever
      // variant ends up playing (desktop or mobile) is then already cached.
      if (item.cloudinaryVideoUrlMobile) {
        const mobileId = extractCloudinaryPublicId(item.cloudinaryVideoUrlMobile);
        if (mobileId && mobileId !== activeProjectMobilePublicId) neighborIds.add(mobileId);
      }
    });
    if (neighborIds.size === 0) return;

    const run = () => neighborIds.forEach((id) => prefetchProjectVideo(id));
    const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : null;
    const idleId = ric ? ric(run, { timeout: 4000 }) : window.setTimeout(run, 1500);
    return () => {
      if (ric && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId as number);
      else window.clearTimeout(idleId as number);
    };
  }, [activeProjectIndex, heroProjectItems, activeProjectPublicId, activeProjectMobilePublicId]);

  const homeSections = useMemo(() => {
    if (!isHomeSectionsLoaded) return DEPLOYED_HOME_SECTIONS;
    const dbIds = new Set(dbSections.map((s: any) => s.id));
    const hardcodedRemainder = DEPLOYED_HOME_SECTIONS.filter(s => !dbIds.has(s.id));
    return [...dbSections, ...hardcodedRemainder].sort((a, b) => a.order_index - b.order_index);
  }, [dbSections, isHomeSectionsLoaded]);

  return (
    <div className="bg-neutral-900">

      <SEO
        canonical="/"
        description={heroSubtitle}
        schema={{
          '@context': 'https://schema.org',
          '@type': 'LocalBusiness',
          '@id': 'https://flai.dk/#business',
          name: 'Flai',
          description: heroSubtitle,
          url: 'https://flai.dk',
          logo: heroLogo,
          telephone: contactPhone,
          email: contactEmail,
          address: { '@type': 'PostalAddress', addressCountry: 'DK' },
          areaServed: { '@type': 'Country', name: 'Danmark' },
        }}
      />

      {isSiteContentLoaded ? (
        <HeroVideoSection
          publicId={activeProjectPublicId}
          mobilePublicId={activeProjectMobilePublicId}
          // Only wired up with 2+ projects — with a single project (or
          // none) the video should keep looping forever, same as before.
          onEnded={heroProjectItems.length > 1 ? handleProjectVideoEnded : undefined}
          onProgress={setHeroVideoProgress}
          // Pauset, mens portfolio-kortet er åbent oven på hero'en.
          paused={projectModalOpen}
        >
          <div className="flex flex-col h-full w-full">
            <div className="flex-1" />
            <HeroProjectCarousel
              data={{ content: heroProjectItems }}
              activeIndex={activeProjectIndex}
              onChangeIndex={requestProject}
              progress={heroVideoProgress}
              onSeeMore={handleSeeProject}
            />
          </div>
        </HeroVideoSection>
      ) : (
        // Nothing to show yet — the real project content (and which video
        // to play) only exists once the CMS "content" key has loaded.
        // Rendering the old singleton hero video as a placeholder here was
        // exactly the "loading default" that made the swap-over feel like
        // a stutter/restart; a plain empty section (same height, so the
        // page doesn't jump once real content lands) is simpler and reads
        // as "loading", not as content flickering into different content.
        <section
          className="relative w-full overflow-hidden h-screen"
          style={{ backgroundColor: '#111' }}
        />
      )}

      <PortfolioProjectModal
        task={activePortfolioTask}
        open={projectModalOpen}
        onClose={handleCloseProject}
      />

      {homeSections.filter(s => s.is_active).map((section, index) => {
        const isCode = section.section_type === 'code' || section.section_type === 'visual_editor';
        if (isCode) {
          const CodeComp = CODE_SECTION_COMPONENTS[section.id];
          if (!CodeComp) return null;
          return (
            <section key={section.id} className="bg-neutral-800 border-0 outline-none p-0 [&>*>section]:!py-10 md:[&>*>section]:!py-20">
              <div className="w-full">
                <CodeComp />
              </div>
            </section>
          );
        }
        return (
          <HomeSectionCard key={section.id} section={section} index={index} />
        );
      })}

      {homeSections.length === 0 && DEPLOYED_HOME_SECTIONS.length === 0 && isSiteContentLoaded && (
        <section className="py-10 md:py-20 bg-neutral-800">
          <div className="container">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <EditableContent contentKey="drone-section-title" as="h2" className="text-3xl font-bold mb-6 text-white" fallback="DJI Mini 3 Pro Drone" />
                <EditableContent contentKey="drone-section-description" as="p" className="text-neutral-300 mb-8" fallback="Med vores DJI Mini 3 Pro drone leverer vi exceptionel billedkvalitet og stabilitet. Perfekt til ejendomsvisninger, events og personlige projekter." />
                <ul className="space-y-4 text-neutral-300">
                  <li className="flex items-center"><Video className="text-primary mr-3" size={24} /><EditableContent contentKey="drone-feature-video" fallback="4K/60fps videooptagelse" /></li>
                  <li className="flex items-center"><Camera className="text-primary mr-3" size={24} /><EditableContent contentKey="drone-feature-photo" fallback="48MP stillbilleder" /></li>
                  <li className="flex items-center"><MapPin className="text-primary mr-3" size={24} /><EditableContent contentKey="drone-feature-coverage" fallback="Dækker hele områder i Danmark" /></li>
                </ul>
              </div>
              <div className="relative">
                <EditableContent contentKey="drone-section-image" as="img" className="rounded-lg shadow-xl" alt="DJI Mini 3 Pro Drone" fallback="/Drone.png" />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="py-10 md:py-20 bg-neutral-800">
        <div className="container text-center">
          <EditableContent contentKey="cta-title" as="h2" className="text-3xl md:text-4xl font-bold mb-8 text-white" fallback="Klar til en ny verden fra oven?" />
          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-2">
            <button onClick={() => navigate('/products')} className="btn-primary text-lg px-8 py-4">
              <EditableContent contentKey="hero-button-primary" fallback="Se Vores Tjenester" />
            </button>
            <button onClick={() => navigate('/portfolio')} className="btn-secondary text-lg px-8 py-4 flex items-center justify-center">
              <EditableContent contentKey="hero-button-secondary" fallback="Se Vores Arbejde" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
