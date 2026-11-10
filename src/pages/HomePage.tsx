import '../utils/heroPreload'
import CloudinaryVideoPlayer from '../components/CloudinaryVideoPlayer'
import { initHeroSync } from '../utils/heroSync'
import { extractCloudinaryPublicId, prefetchProjectVideo, prefetchProjectImages, preloadProjectForSwitch, isPortraitMobileNow } from '../utils/heroPreload'
import { heroProgress } from '../utils/heroProgress'
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

    /** Result video: plays through the same Cloudinary video-set pipeline as the
     * rest of the site (CloudinaryVideoPlayer: device-tiered pre-made file, set
     * poster, no transformations, nothing fetched until play). */
    function ResultVideo({ src, label }: { src: string; label: string }) {
      return (
        <CloudinaryVideoPlayer
          publicId={extractCloudinaryPublicId(src)}
          title={label}
          fill
          rounded={false}
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
  const { getContent, isSiteContentLoaded, homeSections: dbSections, isHomeSectionsLoaded, portfolioImages, isPortfolioLoaded } = useData();
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
            'https://res.cloudinary.com/epjomksm/video/upload/scan-pork--fs.mp4',
          projectSlug: 'Specialister i salg af smågrise',
          website: 'https://scan-pork.com/',
        },
        {
          number: '02',
          industry: 'Leverandør til print, skilte- og bilindpakningsfirmaer',
          clientLogoUrl:
            'https://vikiallo.dk/wp-content/uploads/vikiallo-white-LOGO@2x.png',
          cloudinaryVideoUrl:
            'https://res.cloudinary.com/epjomksm/video/upload/vikiallo--fs.mp4',
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

  // Playback progress (0–1) of the active project's video lives in an external
  // store (utils/heroProgress), NOT in React state here: it ticks ~4×/sec, and
  // as state it re-rendered this whole page on every tick, which made the hero
  // (and taps on the project numbers) laggy on phones. Only the small progress
  // line under the active number subscribes to it. Reset whenever the active
  // project changes so the new video's tab doesn't briefly show the old
  // video's leftover progress before its own timeupdate ticks arrive.
  useEffect(() => {
    heroProgress.set(0);
  }, [activeProjectIndex]);

  // Project the visitor has asked for but that isn't shown yet (still loading).
  // Drives an immediate "loading" pulse on the tapped number.
  const [pendingProjectIndex, setPendingProjectIndex] = useState<number | null>(null);

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

  // Trykkes der, før portfolio-data er hentet, venter vi på den i stedet for at
  // redirecte — og åbner kortet, så snart den er der.
  const [seeProjectPending, setSeeProjectPending] = useState(false);

  const redirectToPortfolio = useCallback(() => {
    navigate('/portfolio', activeProjectName ? { state: { scrollToProject: activeProjectName } } : undefined);
  }, [navigate, activeProjectName]);

  const handleSeeProject = useCallback(() => {
    if (activePortfolioTask) {
      setProjectModalOpen(true);
    } else if (!isPortfolioLoaded) {
      setSeeProjectPending(true);
    } else {
      // Reserve: data er hentet, men der findes intet kort med projektets navn.
      redirectToPortfolio();
    }
  }, [activePortfolioTask, isPortfolioLoaded, redirectToPortfolio]);

  useEffect(() => {
    if (!seeProjectPending || !isPortfolioLoaded) return;
    setSeeProjectPending(false);
    if (activePortfolioTask) setProjectModalOpen(true);
    else redirectToPortfolio();
  }, [seeProjectPending, isPortfolioLoaded, activePortfolioTask, redirectToPortfolio]);
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

  // `waitForVideo` is false for a visitor's tap (see preloadProjectForSwitch):
  // the switch then waits only for the poster + logos (short timeout) and the
  // video loads behind the poster, instead of the tap doing nothing for
  // seconds. The automatic advance after a video ends still waits for the
  // video's first chunk, since nobody is waiting on that one.
  const requestProject = useCallback((index: number, opts?: { waitForVideo?: boolean }) => {
    const item = heroProjectItems[index];
    if (!item || index === activeProjectIndexRef.current) {
      switchTokenRef.current += 1; // cancel any pending switch to elsewhere
      setPendingProjectIndex(null);
      return;
    }
    const token = ++switchTokenRef.current;
    setPendingProjectIndex(index); // instant feedback on the tapped number
    const desktopId = extractCloudinaryPublicId(item.cloudinaryVideoUrl);
    const mobileId = item.cloudinaryVideoUrlMobile
      ? extractCloudinaryPublicId(item.cloudinaryVideoUrlMobile)
      : undefined;
    // Same choice HeroVideoSection makes: the vertical cut only on a phone in portrait.
    const useVertical = isPortraitMobileNow() && !!mobileId;
    const videoId = useVertical ? mobileId : desktopId;
    preloadProjectForSwitch({
      publicId: videoId || undefined,
      vertical: useVertical,
      logoUrls: getHeroProjectLogos(item).map((l) => l.url),
      waitForVideo: opts?.waitForVideo ?? false,
    }).then(() => {
      if (switchTokenRef.current === token) {
        setActiveProjectIndex(index);
        setPendingProjectIndex(null);
      }
    });
  }, [heroProjectItems]);

  const handleProjectVideoEnded = useCallback(() => {
    if (heroProjectItems.length > 1) {
      requestProject((activeProjectIndexRef.current + 1) % heroProjectItems.length, { waitForVideo: true });
    }
  }, [heroProjectItems.length, requestProject]);

  // Warm the poster + logos of EVERY project once the hero content is known,
  // at idle time. Images are tiny next to the videos, and (unlike the video
  // <link rel="prefetch"> below) this works on Safari/iOS too, so tapping any
  // number finds its poster already cached and the switch is near-instant.
  useEffect(() => {
    if (heroProjectItems.length <= 1) return;
    const run = () => {
      heroProjectItems.forEach((item) => {
        const desktopId = extractCloudinaryPublicId(item.cloudinaryVideoUrl);
        const mobileId = item.cloudinaryVideoUrlMobile
          ? extractCloudinaryPublicId(item.cloudinaryVideoUrlMobile)
          : undefined;
        prefetchProjectImages({
          publicId: (isPortraitMobileNow() && mobileId ? mobileId : desktopId) || undefined,
          logoUrls: getHeroProjectLogos(item).map((l) => l.url),
        });
      });
    };
    const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : null;
    const idleId = ric ? ric(run, { timeout: 3000 }) : window.setTimeout(run, 1200);
    return () => {
      if (ric && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId as number);
      else window.clearTimeout(idleId as number);
    };
  }, [heroProjectItems]);

  // Warm the cache for the ONE video the auto-advance will switch to next, so
  // that switch is instant. This is a full-file download that Cloudinary bills
  // in full, so it is deliberately narrow:
  //   • only the next project (not both neighbours — a tap already shows the
  //     poster instantly and the video loads behind it),
  //   • only the variant that will play on THIS device (the vertical cut on a
  //     portrait phone, otherwise the horizontal one — it used to fetch both),
  //   • only once the visitor has stayed on the current project for a while,
  //     so people who bounce after a few seconds never trigger it,
  //   • never while the tab is hidden.
  // prefetchProjectVideo itself also skips slow / Data Saver connections.
  useEffect(() => {
    if (heroProjectItems.length <= 1) return;
    const next = heroProjectItems[(activeProjectIndex + 1) % heroProjectItems.length];
    if (!next) return;

    const portraitPhone = isPortraitMobileNow();
    const nextDesktopId = extractCloudinaryPublicId(next.cloudinaryVideoUrl);
    const nextMobileId = next.cloudinaryVideoUrlMobile
      ? extractCloudinaryPublicId(next.cloudinaryVideoUrlMobile)
      : undefined;
    const nextVertical = portraitPhone && !!nextMobileId;
    const nextId = nextVertical ? nextMobileId : nextDesktopId;
    const currentId =
      portraitPhone && activeProjectMobilePublicId ? activeProjectMobilePublicId : activeProjectPublicId;
    if (!nextId || nextId === currentId) return;

    let idleId: number | undefined;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      const run = () => prefetchProjectVideo(nextId, nextVertical);
      idleId =
        typeof requestIdleCallback === 'function'
          ? requestIdleCallback(run, { timeout: 4000 })
          : window.setTimeout(run, 0);
    }, 12000);

    return () => {
      window.clearTimeout(timer);
      if (idleId !== undefined) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
        else window.clearTimeout(idleId);
      }
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
          onProgress={heroProgress.set}
          // Pauset, mens portfolio-kortet er åbent oven på hero'en.
          paused={projectModalOpen}
        >
          <div className="flex flex-col h-full w-full">
            <div className="flex-1" />
            <HeroProjectCarousel
              data={{ content: heroProjectItems }}
              activeIndex={activeProjectIndex}
              onChangeIndex={requestProject}
              pendingIndex={pendingProjectIndex}
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
              <EditableContent contentKey="hero-button-primary" fallback="Se Tjenester" />
            </button>
            <button onClick={() => navigate('/portfolio')} className="btn-secondary text-lg px-8 py-4 flex items-center justify-center">
              <EditableContent contentKey="hero-button-secondary" fallback="Se Projekter" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
