import '../utils/heroPreload'
import { initHeroSync } from '../utils/heroSync'
import { extractCloudinaryPublicId, prefetchProjectVideo } from '../utils/heroPreload'
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import AiCTA from '../components/AiCTA';
import SEO from '../components/SEO';
import { useNavigate } from 'react-router-dom';
import { Video, Camera, MapPin } from 'lucide-react';
import HeroVideoSection from '../components/HeroVideoSection';
import HeroProjectCarousel from '../components/HeroProjectCarousel';
import { heroProjectsContent, parseHeroProjectsContent } from '../content/heroProjects';
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
  //     "result": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
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
  // ─── Layout rules ────────────────────────────────────────────────────────────
  // Desktop (>768px):
  //   - 8 or fewer reviews  -> single row, all reviews
  //   - more than 8 reviews -> split in half: top half of the array = row 1, bottom half = row 2
  // Mobile (<=768px):
  //   - 6 or fewer reviews  -> single row, all reviews
  //   - more than 6 reviews -> split in half the same way (top half = row 1, bottom half = row 2)
  //
  // Each row is a horizontally scrollable strip. Left/right arrow buttons advance
  // the row by exactly one card per click, clamped at both ends (no wraparound).
  // On touch devices the row can also be swiped natively — no extra JS needed for
  // that, since it's a plain scroll container.
  //
  // ─── Initial scroll position ──────────────────────────────────────────────────
  // Each row centers itself based on how many cards currently fit in the
  // viewport at once:
  //   - odd count fitting (1, 3, 5…)  -> a single card sits dead-center
  //   - even count fitting (2, 4, 6…) -> the gap between two cards sits
  //     dead-center, so cards sit symmetrically in pairs either side of center
  // This is recomputed on every resize (so rotating a phone or resizing a
  // window keeps it balanced) until the person scrolls the row themselves,
  // at which point a manual swipe settles onto the nearest valid position
  // instead of snapping back to the middle. Positioning only ever touches the
  // row's own scrollLeft — never the page's scroll — and arrow clicks move
  // exactly one card at a time.
  //
  // ─── Result media (video/image) ────────────────────────────────────────────────
  // Each review is wrapped in a column (.testi-card-col) that scrolls as one
  // unit. The review card (quote + author) is always shown; the "result" (see
  // field docs above), if present, renders as its own separate box stacked
  // below it in that same column — so it never stretches the review card
  // itself, and reviews without a result stay short. Both boxes share the
  // column's width, and because the whole column is what the row's arrow
  // clicks/centering treat as "one card", the result box moves and fades with
  // its review — it's automatically covered by the row viewport's existing
  // left/right edge fade (.testi-row-viewport's mask-image), no separate fade
  // logic needed.

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
     * A YouTube URL renders as an embedded video; any other URL is treated as
     * an image. Empty/omitted renders nothing.
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
  const SCROLL_ANIMATION_MS = 380;

  /** Matches youtube.com/watch, youtu.be, /embed/ and /shorts/ links and
   * captures the 11-character video id. */
  const YOUTUBE_URL_REGEX =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;

  /** Smoothly animates scrollLeft with a fixed easing curve, so arrow clicks
   * and swipe-driven snap settle with the same feel instead of each browser's
   * own (differing) default for "smooth" scroll vs. touch snap-back.
   * Returns a cancel function so a newer scroll request can stop a stale one
   * from fighting over scrollLeft mid-flight. */
  function animateScrollTo(el: HTMLElement, targetLeft: number, duration = SCROLL_ANIMATION_MS): () => void {
    const startLeft = el.scrollLeft;
    const distance = targetLeft - startLeft;
    let cancelled = false;
    if (Math.abs(distance) < 1) return () => {};

    const startTime = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      el.scrollLeft = startLeft + distance * easeOutCubic(progress);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    return () => {
      cancelled = true;
    };
  }

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
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    return { rating: Math.round(avg * 10) / 10, reviewCount: reviews.length };
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
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

  type CenterMode = 'card' | 'gap';

  /** How many cards fit in the viewport at once decides whether the centered
   * position should land on a card (odd count) or the gap between two cards
   * (even count) — the same balance a physical carousel keeps as it resizes. */
  function modeForVisibleCount(count: number): CenterMode {
    return count % 2 === 0 ? 'gap' : 'card';
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function computeVisibleCount(cardWidth: number, viewportWidth: number, total: number): number {
    const raw = Math.floor((viewportWidth + CARD_GAP_PX) / (cardWidth + CARD_GAP_PX));
    return clamp(raw, 1, total);
  }

  /** The "natural" middle anchor for the full list in the given mode — an
   * integer card index for 'card' mode, or index+0.5 (the gap right after
   * that card) for 'gap' mode. */
  function naturalAnchor(total: number, mode: CenterMode): number {
    const center = (total - 1) / 2;
    if (mode === 'card') {
      return clamp(Math.round(center), 0, total - 1);
    }
    const maxHalf = Math.max(0.5, total - 1.5);
    const half = Number.isInteger(center) ? center + 0.5 : center;
    return clamp(half, 0.5, maxHalf);
  }

  /** Converts a previous anchor to a new mode when the visible-count parity
   * changes (e.g. resizing across a breakpoint), staying near the same spot
   * instead of jumping back to the array's natural center every time. */
  function adjustAnchorForMode(prevAnchor: number | undefined, mode: CenterMode, total: number): number {
    if (prevAnchor === undefined) return naturalAnchor(total, mode);
    if (mode === 'card') {
      return clamp(Math.round(prevAnchor), 0, total - 1);
    }
    const maxHalf = Math.max(0.5, total - 1.5);
    if (!Number.isInteger(prevAnchor)) return clamp(prevAnchor, 0.5, maxHalf);
    let candidate = prevAnchor + 0.5;
    if (candidate > maxHalf) candidate = prevAnchor - 0.5;
    return clamp(candidate, 0.5, maxHalf);
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

  function ReviewCard({ review }: { review: ReviewData }) {
    const hue = nameToHue(review.user.name);
    // Business name fully replaces the default label when present.
    const metaLabel = review.business || 'Verificeret Google-anmeldelse';
    const googleLink = review.link || DEFAULT_GOOGLE_LINK;
    const isSquare = isSquareThumbnail(review.user.thumbnail);

    return (
      <div className="testi-review-card">
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
            {review.user.thumbnail ? (
              <img
                src={review.user.thumbnail}
                alt={review.user.name}
                className={`author-avatar${isSquare ? ' author-avatar-square' : ''}`}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
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

  /** Separate box stacked below a review's card, holding that review's
   * "result" media (see field docs at the top of the file). Renders nothing
   * when there's no result, so it adds no height to reviews without one. */
  function ResultCard({ review }: { review: ReviewData }) {
    const trimmedResult = review.result?.trim();
    const youtubeEmbedUrl = trimmedResult ? getYouTubeEmbedUrl(trimmedResult) : null;
    const resultImageUrl = trimmedResult && !youtubeEmbedUrl ? trimmedResult : null;

    if (!youtubeEmbedUrl && !resultImageUrl) return null;

    return (
      <div className="testi-result-card">
        {youtubeEmbedUrl ? (
          <iframe
            src={youtubeEmbedUrl}
            title={`Resultat af ${review.user.name}s anmeldelse`}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
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
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Logical position: an integer card index in 'card' mode, or index+0.5
    // (the gap right after that card) in 'gap' mode. Kept in a ref since it
    // drives imperative scrolling rather than a re-render.
    const anchorRef = useRef<number | undefined>(undefined);
    const modeRef = useRef<CenterMode>('card');
    const isAutoScrollingRef = useRef(false);
    const hasUserScrolledRef = useRef(false);
    const cancelAutoScrollRef = useRef<(() => void) | null>(null);
    const scrollEndTimeoutRef = useRef<number | undefined>(undefined);
    // Guards against the settle effect re-running its FIRST-mount reset logic
    // more than once for the same `reviews` identity — see effect below.
    const didInitRef = useRef(false);

    const getMetrics = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return null;
      const firstCard = track.firstElementChild as HTMLElement | null;
      if (!firstCard) return null;
      return {
        viewport,
        track,
        cards: Array.from(track.children) as HTMLElement[],
        cardWidth: firstCard.getBoundingClientRect().width,
        viewportWidth: viewport.clientWidth,
      };
    };

    const updateSidePadding = (visibleCount: number) => {
      const m = getMetrics();
      if (!m) return;
      const blockWidth = visibleCount * m.cardWidth + (visibleCount - 1) * CARD_GAP_PX;
      const sidePad = Math.max(0, (m.viewportWidth - blockWidth) / 2);
      m.track.style.setProperty('--testi-side-pad', `${sidePad}px`);
    };

    /** Scrolls — this row's own scrollLeft only, never the page — so the
     * given anchor (a card, or the gap between two cards) sits centered in
     * the viewport. Measures live layout each call rather than relying on a
     * separately-tracked assumption, so it can't drift out of sync. */
    const scrollToAnchor = (anchor: number, mode: CenterMode, animate: boolean) => {
      const m = getMetrics();
      if (!m) return;
      const { viewport, track, cards } = m;
      const trackRect = track.getBoundingClientRect();

      let centerFromTrackLeft: number | null = null;
      if (mode === 'card') {
        const card = cards[Math.round(anchor)];
        if (!card) return;
        const r = card.getBoundingClientRect();
        centerFromTrackLeft = (r.left - trackRect.left) + r.width / 2;
      } else {
        const idx = Math.floor(anchor);
        const cardA = cards[idx];
        const cardB = cards[idx + 1];
        if (!cardA || !cardB) return;
        const ra = cardA.getBoundingClientRect();
        const rb = cardB.getBoundingClientRect();
        const rightOfA = (ra.left - trackRect.left) + ra.width;
        const leftOfB = rb.left - trackRect.left;
        centerFromTrackLeft = (rightOfA + leftOfB) / 2;
      }
      if (centerFromTrackLeft === null) return;

      // centerFromTrackLeft is measured relative to the track (via
      // getBoundingClientRect), so it's already an absolute, scroll-invariant
      // target — NOT relative to the current viewport scroll position.
      // Do not add viewport.scrollLeft here; that double-counts the current
      // offset and was causing runaway overshoot -> clamped to the last card
      // (and arrow clicks inheriting the same overshoot, looking "dead").
      const targetLeft = centerFromTrackLeft - viewport.clientWidth / 2;
      const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const clamped = clamp(targetLeft, 0, maxScroll);

      // Cancel any in-flight animation from a previous call so two scroll
      // requests in quick succession (e.g. a fast double-click, or a settle
      // firing while a user-triggered scroll is still animating) can't fight
      // over scrollLeft and produce a visible "snap to a different spot".
      cancelAutoScrollRef.current?.();
      isAutoScrollingRef.current = true;

      if (animate) {
        cancelAutoScrollRef.current = animateScrollTo(viewport, clamped);
        window.setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, SCROLL_ANIMATION_MS + 50);
      } else {
        viewport.scrollLeft = clamped;
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = false;
        });
      }
    };

    const updateArrowAvailability = (visibleCount: number, total: number, mode: CenterMode) => {
      if (visibleCount >= total) {
        setCanScrollLeft(false);
        setCanScrollRight(false);
        return;
      }
      const anchor = anchorRef.current ?? naturalAnchor(total, mode);
      if (mode === 'card') {
        setCanScrollLeft(anchor > 0);
        setCanScrollRight(anchor < total - 1);
      } else {
        const maxHalf = Math.max(0.5, total - 1.5);
        setCanScrollLeft(anchor > 0.5);
        setCanScrollRight(anchor < maxHalf);
      }
    };

    /** Finds whichever card (or gap between two cards) currently sits
     * closest to the viewport's center — used to softly settle the row after
     * a manual swipe. There's no native CSS scroll-snap here on purpose: it
     * was fighting the arrow-click animation and occasionally made a click
     * jump two cards instead of one, so alignment is handled in JS instead. */
    const nearestAnchor = (mode: CenterMode): number => {
      const m = getMetrics();
      if (!m) return anchorRef.current ?? 0;
      const { viewport, cards } = m;
      const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;

      if (mode === 'card') {
        let best = 0;
        let bestDist = Infinity;
        cards.forEach((card, i) => {
          const r = card.getBoundingClientRect();
          const dist = Math.abs((r.left + r.width / 2) - viewportCenter);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        return best;
      }

      let best = 0.5;
      let bestDist = Infinity;
      for (let i = 0; i < cards.length - 1; i++) {
        const ra = cards[i].getBoundingClientRect();
        const rb = cards[i + 1].getBoundingClientRect();
        const gapCenter = (ra.right + rb.left) / 2;
        const dist = Math.abs(gapCenter - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          best = i + 0.5;
        }
      }
      return best;
    };

    const handleScroll = () => {
      // Ignore scroll events we caused ourselves (programmatic scrollToAnchor).
      if (isAutoScrollingRef.current) return;
      hasUserScrolledRef.current = true;
      window.clearTimeout(scrollEndTimeoutRef.current);
      // Wait for scrolling to actually stop (debounce) before locking onto
      // the nearest card/gap — this is what makes a swipe "lock on" instead
      // of leaving the row wherever momentum scrolling happened to stop.
      scrollEndTimeoutRef.current = window.setTimeout(() => {
        const mode = modeRef.current;
        const total = reviews.length;
        const nearest = nearestAnchor(mode);
        anchorRef.current = nearest;
        scrollToAnchor(nearest, mode, true);
        const m = getMetrics();
        if (m) updateArrowAvailability(computeVisibleCount(m.cardWidth, m.viewportWidth, total), total, mode);
      }, 120);
    };

    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const total = reviews.length;

      // Only reset scroll/anchor state on a genuine first mount of this row
      // (or when the review count actually changes, e.g. switching between
      // the single-row and split-row layouts). Previously this reset ran on
      // every re-run of this effect, and because `reviews` is recreated as a
      // new array on every parent render, that meant ANY unrelated re-render
      // higher up the tree (typing, resizing, other state updates) silently
      // wiped `anchorRef`/`hasUserScrolledRef` and snapped the row back to
      // center — which is what looked like "clicking an arrow instantly
      // resets to the first review" and "swiping never locks on mobile"
      // (the debounced settle in handleScroll would fire, then get its
      // result immediately discarded by the next reset).
      if (!didInitRef.current) {
        hasUserScrolledRef.current = false;
        anchorRef.current = undefined;
        didInitRef.current = true;
      }

      // Re-settle (side padding + centering + arrow state) on every layout
      // change, including the guaranteed initial call ResizeObserver fires
      // right after observe(). Determines from how many cards currently fit
      // whether a card or a gap should be centered, and keeps that balanced
      // as the screen resizes — until the person scrolls the row themselves.
      const settle = () => {
        const m = getMetrics();
        if (!m) return;
        const visibleCount = computeVisibleCount(m.cardWidth, m.viewportWidth, total);
        const mode = modeForVisibleCount(visibleCount);

        updateSidePadding(visibleCount);

        if (!hasUserScrolledRef.current) {
          if (modeRef.current !== mode || anchorRef.current === undefined) {
            anchorRef.current = adjustAnchorForMode(anchorRef.current, mode, total);
          }
          modeRef.current = mode;
          scrollToAnchor(anchorRef.current, mode, false);
        } else {
          modeRef.current = mode;
        }

        updateArrowAvailability(visibleCount, total, mode);
      };

      const resizeObserver = new ResizeObserver(settle);
      resizeObserver.observe(viewport);
      return () => {
        resizeObserver.disconnect();
        cancelAutoScrollRef.current?.();
        window.clearTimeout(scrollEndTimeoutRef.current);
      };
      // Depend on the review count, not the `reviews` array reference itself
      // (that reference changes on every parent render even when the actual
      // review data hasn't). Combined with the didInitRef guard above, this
      // effect's reset logic now truly only runs once per distinct row size.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reviews.length]);

    const scrollByOneCard = (dir: 'left' | 'right') => {
      const total = reviews.length;
      const mode = modeRef.current;
      const current = anchorRef.current ?? naturalAnchor(total, mode);
      const delta = dir === 'left' ? -1 : 1;

      let next = current + delta;
      if (mode === 'card') {
        next = clamp(next, 0, total - 1);
      } else {
        const maxHalf = Math.max(0.5, total - 1.5);
        next = clamp(next, 0.5, maxHalf);
      }

      hasUserScrolledRef.current = true;
      anchorRef.current = next;
      scrollToAnchor(next, mode, true);

      const m = getMetrics();
      if (m) updateArrowAvailability(computeVisibleCount(m.cardWidth, m.viewportWidth, total), total, mode);
    };

    return (
      <div className="testi-row-wrap">
        <button
          type="button"
          className="testi-arrow testi-arrow-left"
          onClick={() => scrollByOneCard('left')}
          disabled={!canScrollLeft}
          aria-label="Se forrige anmeldelse"
        >
          <ChevronIcon direction="left" />
        </button>

        <div className="testi-row-viewport" ref={viewportRef} onScroll={handleScroll}>
          <div ref={trackRef} className="testi-row-track">
            {reviews.map((review, i) => (
              <div className="testi-card-col" key={`${review.user.name}-${i}`}>
                <ReviewCard review={review} />
                <ResultCard review={review} />
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="testi-arrow testi-arrow-right"
          onClick={() => scrollByOneCard('right')}
          disabled={!canScrollRight}
          aria-label="Se næste anmeldelse"
        >
          <ChevronIcon direction="right" />
        </button>
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
    // changes, instead of on every render of this component. This is what
    // fixes the row snapping back to the start on any interaction — see the
    // comment in TestimonialRow's effect for the full explanation.
    const allReviews = useMemo(() => parseReviewArray(reviewsRaw), [reviewsRaw]);
    const total = allReviews.length;

    const rowsContainerRef = useRef<HTMLDivElement>(null);

    // Keeps every review card the same height as the tallest one currently
    // rendered (measured from its natural, unclamped content height) so a
    // short snippet doesn't leave its card looking undersized next to a long
    // one. Recomputed on mount and on window resize, since resizing can
    // change how the quote text wraps (and therefore its natural height).
    useLayoutEffect(() => {
      const container = rowsContainerRef.current;
      if (!container) return;

      const equalize = () => {
        const cards = Array.from(container.querySelectorAll<HTMLElement>('.testi-review-card'));
        if (cards.length === 0) return;
        // Reset to natural height first so we measure real content height,
        // not a height forced by a previous run of this same function.
        cards.forEach((card) => { card.style.height = 'auto'; });
        const tallest = cards.reduce((max, card) => Math.max(max, card.getBoundingClientRect().height), 0);
        cards.forEach((card) => { card.style.height = `${tallest}px`; });
      };

      equalize();

      let frame: number;
      const handleResize = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(equalize);
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(frame);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [total]);

    // No reviews configured at all — render nothing.
    if (total === 0) return null;

    const ratingData = useMemo(
      () => parseRating(ratingRaw) ?? fallbackRating(allReviews),
      [ratingRaw, allReviews]
    );

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
            display: grid;
            grid-template-columns: auto 1fr auto;
            grid-template-areas: "left viewport right";
            align-items: center;
            gap: 12px;
          }
          .testi-row-viewport {
            grid-area: viewport;
          }
          .testi-arrow-left {
            grid-area: left;
          }
          .testi-arrow-right {
            grid-area: right;
          }
          .testi-row-viewport {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scroll-behavior: auto;
            scrollbar-width: none;
            overflow-anchor: none;
            flex: 1;
            min-width: 0;
            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);
            mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);
          }
          .testi-row-viewport::-webkit-scrollbar {
            display: none;
          }
          .testi-row-track {
            display: flex;
            gap: 24px;
            width: max-content;
            min-width: 100%;
            justify-content: center;
            padding: 0 var(--testi-side-pad, 24px);
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
            transition: background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.1s;
          }
          .testi-arrow:hover:not(:disabled) {
            background: #262626;
            border-color: #454545;
          }
          .testi-arrow:active:not(:disabled) {
            transform: scale(0.94);
          }
          .testi-arrow:disabled {
            opacity: 0.25;
            cursor: default;
          }
          .testi-card-col {
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: 380px;
            flex-shrink: 0;
          }
          .testi-review-card {
            background: #141414;
            border: 1px solid #262626;
            border-radius: 20px;
            padding: 32px;
            width: 100%;
            flex-shrink: 0;
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
            flex-shrink: 0;
          }
          .testi-result-card iframe,
          .testi-result-card img {
            display: block;
            width: 100%;
            height: 100%;
            border: none;
            object-fit: cover;
          }
          @media (max-width: 768px) {
            .testi-card-col { width: 300px; }
            .testi-review-card { padding: 24px; }
            .big-quote { font-size: 2.75rem; }
            .testi-quote-text { font-size: 0.95rem; }
            .testi-row-wrap {
              grid-template-columns: 1fr 1fr;
              grid-template-areas:
                "viewport viewport"
                "left right";
              row-gap: 16px;
            }
            .testi-arrow-left { justify-self: end; }
            .testi-arrow-right { justify-self: start; }
            .testi-row-viewport {
              -webkit-mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);
              mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);
            }
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
            Bedømt {Number.isInteger(ratingData.rating) ? ratingData.rating : ratingData.rating.toFixed(1)}/5 på Google
          </a>
          <h2>Andre glade kunder</h2>
        </div>

        <div className="testi-rows" ref={rowsContainerRef}>
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
    "order_index": 1,
    "is_active": true,
    "created_at": null,
    "updated_at": null,
    "section_type": "code",
    "code_content": null,
    "code_language": null,
    "code_files": [
      {
        "content": "import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';\nimport { useData } from '../contexts/DataContext';\n\n// ─── Types ────────────────────────────────────────────────────────────────────\n//\n// ONE content key holds every review as a JSON ARRAY. Items mirror the shape\n// coming from cached_reviews.reviews_data so you can copy-paste straight from\n// the Supabase table without reformatting.\n//\n// Required fields per item:  user.name, rating, snippet\n// Optional fields per item:  user.thumbnail, link, business, result\n//\n// Content key:\n//   testimonials-review-2   -> array of ALL reviews (top of array = shown first)\n//\n// Example value:\n// [\n//   {\n//     \"user\": { \"name\": \"Mette Christensen\", \"thumbnail\": \"https://lh3.googleusercontent.com/a/...\" },\n//     \"rating\": 5,\n//     \"snippet\": \"Fantastisk service! Felix leverede utrolig flotte dronefotos.\",\n//     \"link\": \"https://maps.google.com/?cid=...\",\n//     \"business\": \"Christensen Ejendomme A/S\",\n//     \"result\": \"https://www.youtube.com/watch?v=dQw4w9WgXcQ\"\n//   },\n//   {\n//     \"user\": { \"name\": \"Jonas Berg\" },\n//     \"rating\": 5,\n//     \"snippet\": \"Hurtig, professionel og super kvalitet.\"\n//   }\n// ]\n//\n// \"business\" is the only field that does NOT exist in cached_reviews — add it manually if wanted.\n// \"link\" maps to reviews_data[n].link in the cached_reviews table.\n// If \"business\" is omitted the label shows \"Verificeret Google-anmeldelse\".\n// If \"business\" is set it shows the business name only (replacing the default label).\n//\n// \"result\" is also not in cached_reviews — add it manually per review to show the\n// finished work in its own separate box underneath that review's card (so\n// reviews without a result stay short, instead of every card being padded\n// out to match the tallest one):\n//   - a YouTube URL (watch/shorts/youtu.be/embed link) -> rendered as an embedded video\n//   - any other URL -> treated as an image and rendered as an <img>\n//   - omitted / empty string -> no result box is rendered at all\n//\n// If a thumbnail URL contains the word \"square\" anywhere in it, the avatar is\n// rendered as a rounded square instead of being cropped into a circle.\n//\n// Content key for the header rating badge:\n//   testimonials-google-rating\n//\n// Example:\n// { \"rating\": 4.9, \"reviewCount\": 127, \"link\": \"https://search.google.com/local/writereview?placeid=...\" }\n//\n// If this key is left empty, the badge falls back to the average rating and count\n// of every configured review.\n//\n// ─── Layout rules ────────────────────────────────────────────────────────────\n// Desktop (>768px):\n//   - 8 or fewer reviews  -> single row, all reviews\n//   - more than 8 reviews -> split in half: top half of the array = row 1, bottom half = row 2\n// Mobile (<=768px):\n//   - 6 or fewer reviews  -> single row, all reviews\n//   - more than 6 reviews -> split in half the same way (top half = row 1, bottom half = row 2)\n//\n// Each row is a horizontally scrollable strip. Left/right arrow buttons advance\n// the row by exactly one card per click, clamped at both ends (no wraparound).\n// On touch devices the row can also be swiped natively — no extra JS needed for\n// that, since it's a plain scroll container.\n//\n// ─── Initial scroll position ──────────────────────────────────────────────────\n// Each row centers itself based on how many cards currently fit in the\n// viewport at once:\n//   - odd count fitting (1, 3, 5…)  -> a single card sits dead-center\n//   - even count fitting (2, 4, 6…) -> the gap between two cards sits\n//     dead-center, so cards sit symmetrically in pairs either side of center\n// This is recomputed on every resize (so rotating a phone or resizing a\n// window keeps it balanced) until the person scrolls the row themselves,\n// at which point a manual swipe settles onto the nearest valid position\n// instead of snapping back to the middle. Positioning only ever touches the\n// row's own scrollLeft — never the page's scroll — and arrow clicks move\n// exactly one card at a time.\n//\n// ─── Result media (video/image) ────────────────────────────────────────────────\n// Each review is wrapped in a column (.testi-card-col) that scrolls as one\n// unit. The review card (quote + author) is always shown; the \"result\" (see\n// field docs above), if present, renders as its own separate box stacked\n// below it in that same column — so it never stretches the review card\n// itself, and reviews without a result stay short. Both boxes share the\n// column's width, and because the whole column is what the row's arrow\n// clicks/centering treat as \"one card\", the result box moves and fades with\n// its review — it's automatically covered by the row viewport's existing\n// left/right edge fade (.testi-row-viewport's mask-image), no separate fade\n// logic needed.\n\ninterface ReviewUser {\n  name: string;\n  thumbnail?: string;\n}\n\ninterface ReviewData {\n  user: ReviewUser;\n  rating: number;\n  snippet: string;\n  link?: string;\n  /** Not in cached_reviews — add manually when editing the content key */\n  business?: string;\n  /**\n   * Not in cached_reviews — add manually when editing the content key.\n   * A YouTube URL renders as an embedded video; any other URL is treated as\n   * an image. Empty/omitted renders nothing.\n   */\n  result?: string;\n}\n\ninterface GoogleRatingData {\n  rating: number;\n  reviewCount: number;\n  link?: string;\n}\n\nconst REVIEWS_KEY = 'testimonials-review-2';\nconst RATING_KEY = 'testimonials-google-rating';\nconst DEFAULT_GOOGLE_LINK =\n  'https://search.google.com/local/writereview?placeid=ChIJq5JklwgFuQ0RREPIKUg0EHs';\n\nconst CARD_GAP_PX = 24;\nconst SCROLL_ANIMATION_MS = 380;\n\n/** Matches youtube.com/watch, youtu.be, /embed/ and /shorts/ links and\n * captures the 11-character video id. */\nconst YOUTUBE_URL_REGEX =\n  /(?:youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/)|youtu\\.be\\/)([\\w-]{11})/i;\n\n/** Smoothly animates scrollLeft with a fixed easing curve, so arrow clicks\n * and swipe-driven snap settle with the same feel instead of each browser's\n * own (differing) default for \"smooth\" scroll vs. touch snap-back.\n * Returns a cancel function so a newer scroll request can stop a stale one\n * from fighting over scrollLeft mid-flight. */\nfunction animateScrollTo(el: HTMLElement, targetLeft: number, duration = SCROLL_ANIMATION_MS): () => void {\n  const startLeft = el.scrollLeft;\n  const distance = targetLeft - startLeft;\n  let cancelled = false;\n  if (Math.abs(distance) < 1) return () => {};\n\n  const startTime = performance.now();\n  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);\n\n  const step = (now: number) => {\n    if (cancelled) return;\n    const elapsed = now - startTime;\n    const progress = Math.min(elapsed / duration, 1);\n    el.scrollLeft = startLeft + distance * easeOutCubic(progress);\n    if (progress < 1) requestAnimationFrame(step);\n  };\n  requestAnimationFrame(step);\n\n  return () => {\n    cancelled = true;\n  };\n}\n\n// ─── Helpers ─────────────────────────────────────────────────────────────────\n\nfunction isValidReview(item: unknown): item is ReviewData {\n  const r = item as ReviewData;\n  return !!r?.user?.name && !!r?.snippet;\n}\n\n/** Parses the content key holding a JSON array of review objects. */\nfunction parseReviewArray(raw: string): ReviewData[] {\n  if (!raw.trim()) return [];\n  try {\n    const parsed = JSON.parse(raw);\n    if (!Array.isArray(parsed)) return [];\n    return parsed.filter(isValidReview);\n  } catch {\n    return [];\n  }\n}\n\nfunction parseRating(raw: string): GoogleRatingData | null {\n  if (!raw.trim()) return null;\n  try {\n    const parsed = JSON.parse(raw) as GoogleRatingData;\n    if (typeof parsed?.rating !== 'number' || typeof parsed?.reviewCount !== 'number') return null;\n    return parsed;\n  } catch {\n    return null;\n  }\n}\n\nfunction fallbackRating(reviews: ReviewData[]): GoogleRatingData {\n  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;\n  return { rating: Math.round(avg * 10) / 10, reviewCount: reviews.length };\n}\n\nfunction getInitials(name: string): string {\n  return name\n    .split(' ')\n    .map((n) => n[0])\n    .slice(0, 2)\n    .join('')\n    .toUpperCase();\n}\n\nfunction nameToHue(name: string): number {\n  return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;\n}\n\n/** Thumbnails whose URL contains \"square\" should be shown uncropped\n * (rounded square) instead of being forced into a circle. */\nfunction isSquareThumbnail(url?: string): boolean {\n  return !!url && url.toLowerCase().includes('square');\n}\n\n/** Returns a privacy-enhanced YouTube embed URL if the given string is a\n * recognizable YouTube link, otherwise null. */\nfunction getYouTubeEmbedUrl(url: string): string | null {\n  const match = url.match(YOUTUBE_URL_REGEX);\n  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;\n}\n\ntype CenterMode = 'card' | 'gap';\n\n/** How many cards fit in the viewport at once decides whether the centered\n * position should land on a card (odd count) or the gap between two cards\n * (even count) — the same balance a physical carousel keeps as it resizes. */\nfunction modeForVisibleCount(count: number): CenterMode {\n  return count % 2 === 0 ? 'gap' : 'card';\n}\n\nfunction clamp(value: number, min: number, max: number): number {\n  return Math.min(max, Math.max(min, value));\n}\n\nfunction computeVisibleCount(cardWidth: number, viewportWidth: number, total: number): number {\n  const raw = Math.floor((viewportWidth + CARD_GAP_PX) / (cardWidth + CARD_GAP_PX));\n  return clamp(raw, 1, total);\n}\n\n/** The \"natural\" middle anchor for the full list in the given mode — an\n * integer card index for 'card' mode, or index+0.5 (the gap right after\n * that card) for 'gap' mode. */\nfunction naturalAnchor(total: number, mode: CenterMode): number {\n  const center = (total - 1) / 2;\n  if (mode === 'card') {\n    return clamp(Math.round(center), 0, total - 1);\n  }\n  const maxHalf = Math.max(0.5, total - 1.5);\n  const half = Number.isInteger(center) ? center + 0.5 : center;\n  return clamp(half, 0.5, maxHalf);\n}\n\n/** Converts a previous anchor to a new mode when the visible-count parity\n * changes (e.g. resizing across a breakpoint), staying near the same spot\n * instead of jumping back to the array's natural center every time. */\nfunction adjustAnchorForMode(prevAnchor: number | undefined, mode: CenterMode, total: number): number {\n  if (prevAnchor === undefined) return naturalAnchor(total, mode);\n  if (mode === 'card') {\n    return clamp(Math.round(prevAnchor), 0, total - 1);\n  }\n  const maxHalf = Math.max(0.5, total - 1.5);\n  if (!Number.isInteger(prevAnchor)) return clamp(prevAnchor, 0.5, maxHalf);\n  let candidate = prevAnchor + 0.5;\n  if (candidate > maxHalf) candidate = prevAnchor - 0.5;\n  return clamp(candidate, 0.5, maxHalf);\n}\n\n// ─── Sub-components ───────────────────────────────────────────────────────────\n\nfunction GoogleG({ size = 14 }: { size?: number }) {\n  return (\n    <svg width={size} height={size} viewBox=\"0 0 24 24\" fill=\"none\">\n      <path d=\"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z\" fill=\"#4285F4\" />\n      <path d=\"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z\" fill=\"#34A853\" />\n      <path d=\"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z\" fill=\"#FBBC05\" />\n      <path d=\"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z\" fill=\"#EA4335\" />\n    </svg>\n  );\n}\n\nfunction StarIcon({ filled = true, size = 14 }: { filled?: boolean; size?: number }) {\n  return (\n    <svg width={size} height={size} viewBox=\"0 0 24 24\" fill={filled ? '#FBBF24' : '#404040'} stroke=\"none\">\n      <path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\" />\n    </svg>\n  );\n}\n\nfunction ReviewCard({ review }: { review: ReviewData }) {\n  const hue = nameToHue(review.user.name);\n  // Business name fully replaces the default label when present.\n  const metaLabel = review.business || 'Verificeret Google-anmeldelse';\n  const googleLink = review.link || DEFAULT_GOOGLE_LINK;\n  const isSquare = isSquareThumbnail(review.user.thumbnail);\n\n  return (\n    <div className=\"testi-review-card\">\n      <span className=\"big-quote\" aria-hidden=\"true\">&ldquo;</span>\n      <p className=\"testi-quote-text\">{review.snippet}</p>\n      <div className=\"testi-author-row\">\n        <a\n          href={googleLink}\n          target=\"_blank\"\n          rel=\"noopener noreferrer\"\n          className=\"author-link\"\n          title=\"Se anmeldelse på Google\"\n        >\n          {review.user.thumbnail ? (\n            <img\n              src={review.user.thumbnail}\n              alt={review.user.name}\n              className={`author-avatar${isSquare ? ' author-avatar-square' : ''}`}\n              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}\n            />\n          ) : (\n            <div\n              className=\"author-avatar-fallback\"\n              style={{ backgroundColor: `hsl(${hue}, 35%, 28%)` }}\n            >\n              {getInitials(review.user.name)}\n            </div>\n          )}\n          <div className=\"author-info\">\n            <div className=\"testi-stars\">\n              {[1, 2, 3, 4, 5].map((i) => (\n                <StarIcon key={i} filled={i <= Math.round(review.rating)} />\n              ))}\n            </div>\n            <p className=\"author-name\">{review.user.name}</p>\n            <p className=\"author-meta\">{metaLabel}</p>\n          </div>\n        </a>\n        <a\n          href={googleLink}\n          target=\"_blank\"\n          rel=\"noopener noreferrer\"\n          className=\"google-badge\"\n          title=\"Se anmeldelse på Google\"\n        >\n          <GoogleG size={40} />\n        </a>\n      </div>\n    </div>\n  );\n}\n\n/** Separate box stacked below a review's card, holding that review's\n * \"result\" media (see field docs at the top of the file). Renders nothing\n * when there's no result, so it adds no height to reviews without one. */\nfunction ResultCard({ review }: { review: ReviewData }) {\n  const trimmedResult = review.result?.trim();\n  const youtubeEmbedUrl = trimmedResult ? getYouTubeEmbedUrl(trimmedResult) : null;\n  const resultImageUrl = trimmedResult && !youtubeEmbedUrl ? trimmedResult : null;\n\n  if (!youtubeEmbedUrl && !resultImageUrl) return null;\n\n  return (\n    <div className=\"testi-result-card\">\n      {youtubeEmbedUrl ? (\n        <iframe\n          src={youtubeEmbedUrl}\n          title={`Resultat af ${review.user.name}s anmeldelse`}\n          loading=\"lazy\"\n          allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\"\n          allowFullScreen\n        />\n      ) : (\n        <img\n          src={resultImageUrl!}\n          alt={`Resultat af ${review.user.name}s anmeldelse`}\n          loading=\"lazy\"\n          onError={(e) => {\n            const wrapper = e.currentTarget.parentElement as HTMLElement | null;\n            if (wrapper) wrapper.style.display = 'none';\n          }}\n        />\n      )}\n    </div>\n  );\n}\n\nfunction ChevronIcon({ direction }: { direction: 'left' | 'right' }) {\n  return (\n    <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n      {direction === 'left' ? <path d=\"M15 18l-6-6 6-6\" /> : <path d=\"M9 18l6-6-6-6\" />}\n    </svg>\n  );\n}\n\nfunction TestimonialRow({ reviews }: { reviews: ReviewData[] }) {\n  const viewportRef = useRef<HTMLDivElement>(null);\n  const trackRef = useRef<HTMLDivElement>(null);\n  const [canScrollLeft, setCanScrollLeft] = useState(false);\n  const [canScrollRight, setCanScrollRight] = useState(false);\n\n  // Logical position: an integer card index in 'card' mode, or index+0.5\n  // (the gap right after that card) in 'gap' mode. Kept in a ref since it\n  // drives imperative scrolling rather than a re-render.\n  const anchorRef = useRef<number | undefined>(undefined);\n  const modeRef = useRef<CenterMode>('card');\n  const isAutoScrollingRef = useRef(false);\n  const hasUserScrolledRef = useRef(false);\n  const cancelAutoScrollRef = useRef<(() => void) | null>(null);\n  const scrollEndTimeoutRef = useRef<number | undefined>(undefined);\n  // Guards against the settle effect re-running its FIRST-mount reset logic\n  // more than once for the same `reviews` identity — see effect below.\n  const didInitRef = useRef(false);\n\n  const getMetrics = () => {\n    const viewport = viewportRef.current;\n    const track = trackRef.current;\n    if (!viewport || !track) return null;\n    const firstCard = track.firstElementChild as HTMLElement | null;\n    if (!firstCard) return null;\n    return {\n      viewport,\n      track,\n      cards: Array.from(track.children) as HTMLElement[],\n      cardWidth: firstCard.getBoundingClientRect().width,\n      viewportWidth: viewport.clientWidth,\n    };\n  };\n\n  const updateSidePadding = (visibleCount: number) => {\n    const m = getMetrics();\n    if (!m) return;\n    const blockWidth = visibleCount * m.cardWidth + (visibleCount - 1) * CARD_GAP_PX;\n    const sidePad = Math.max(0, (m.viewportWidth - blockWidth) / 2);\n    m.track.style.setProperty('--testi-side-pad', `${sidePad}px`);\n  };\n\n  /** Scrolls — this row's own scrollLeft only, never the page — so the\n   * given anchor (a card, or the gap between two cards) sits centered in\n   * the viewport. Measures live layout each call rather than relying on a\n   * separately-tracked assumption, so it can't drift out of sync. */\n  const scrollToAnchor = (anchor: number, mode: CenterMode, animate: boolean) => {\n    const m = getMetrics();\n    if (!m) return;\n    const { viewport, track, cards } = m;\n    const trackRect = track.getBoundingClientRect();\n\n    let centerFromTrackLeft: number | null = null;\n    if (mode === 'card') {\n      const card = cards[Math.round(anchor)];\n      if (!card) return;\n      const r = card.getBoundingClientRect();\n      centerFromTrackLeft = (r.left - trackRect.left) + r.width / 2;\n    } else {\n      const idx = Math.floor(anchor);\n      const cardA = cards[idx];\n      const cardB = cards[idx + 1];\n      if (!cardA || !cardB) return;\n      const ra = cardA.getBoundingClientRect();\n      const rb = cardB.getBoundingClientRect();\n      const rightOfA = (ra.left - trackRect.left) + ra.width;\n      const leftOfB = rb.left - trackRect.left;\n      centerFromTrackLeft = (rightOfA + leftOfB) / 2;\n    }\n    if (centerFromTrackLeft === null) return;\n\n    // centerFromTrackLeft is measured relative to the track (via\n    // getBoundingClientRect), so it's already an absolute, scroll-invariant\n    // target — NOT relative to the current viewport scroll position.\n    // Do not add viewport.scrollLeft here; that double-counts the current\n    // offset and was causing runaway overshoot -> clamped to the last card\n    // (and arrow clicks inheriting the same overshoot, looking \"dead\").\n    const targetLeft = centerFromTrackLeft - viewport.clientWidth / 2;\n    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);\n    const clamped = clamp(targetLeft, 0, maxScroll);\n\n    // Cancel any in-flight animation from a previous call so two scroll\n    // requests in quick succession (e.g. a fast double-click, or a settle\n    // firing while a user-triggered scroll is still animating) can't fight\n    // over scrollLeft and produce a visible \"snap to a different spot\".\n    cancelAutoScrollRef.current?.();\n    isAutoScrollingRef.current = true;\n\n    if (animate) {\n      cancelAutoScrollRef.current = animateScrollTo(viewport, clamped);\n      window.setTimeout(() => {\n        isAutoScrollingRef.current = false;\n      }, SCROLL_ANIMATION_MS + 50);\n    } else {\n      viewport.scrollLeft = clamped;\n      requestAnimationFrame(() => {\n        isAutoScrollingRef.current = false;\n      });\n    }\n  };\n\n  const updateArrowAvailability = (visibleCount: number, total: number, mode: CenterMode) => {\n    if (visibleCount >= total) {\n      setCanScrollLeft(false);\n      setCanScrollRight(false);\n      return;\n    }\n    const anchor = anchorRef.current ?? naturalAnchor(total, mode);\n    if (mode === 'card') {\n      setCanScrollLeft(anchor > 0);\n      setCanScrollRight(anchor < total - 1);\n    } else {\n      const maxHalf = Math.max(0.5, total - 1.5);\n      setCanScrollLeft(anchor > 0.5);\n      setCanScrollRight(anchor < maxHalf);\n    }\n  };\n\n  /** Finds whichever card (or gap between two cards) currently sits\n   * closest to the viewport's center — used to softly settle the row after\n   * a manual swipe. There's no native CSS scroll-snap here on purpose: it\n   * was fighting the arrow-click animation and occasionally made a click\n   * jump two cards instead of one, so alignment is handled in JS instead. */\n  const nearestAnchor = (mode: CenterMode): number => {\n    const m = getMetrics();\n    if (!m) return anchorRef.current ?? 0;\n    const { viewport, cards } = m;\n    const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;\n\n    if (mode === 'card') {\n      let best = 0;\n      let bestDist = Infinity;\n      cards.forEach((card, i) => {\n        const r = card.getBoundingClientRect();\n        const dist = Math.abs((r.left + r.width / 2) - viewportCenter);\n        if (dist < bestDist) {\n          bestDist = dist;\n          best = i;\n        }\n      });\n      return best;\n    }\n\n    let best = 0.5;\n    let bestDist = Infinity;\n    for (let i = 0; i < cards.length - 1; i++) {\n      const ra = cards[i].getBoundingClientRect();\n      const rb = cards[i + 1].getBoundingClientRect();\n      const gapCenter = (ra.right + rb.left) / 2;\n      const dist = Math.abs(gapCenter - viewportCenter);\n      if (dist < bestDist) {\n        bestDist = dist;\n        best = i + 0.5;\n      }\n    }\n    return best;\n  };\n\n  const handleScroll = () => {\n    // Ignore scroll events we caused ourselves (programmatic scrollToAnchor).\n    if (isAutoScrollingRef.current) return;\n    hasUserScrolledRef.current = true;\n    window.clearTimeout(scrollEndTimeoutRef.current);\n    // Wait for scrolling to actually stop (debounce) before locking onto\n    // the nearest card/gap — this is what makes a swipe \"lock on\" instead\n    // of leaving the row wherever momentum scrolling happened to stop.\n    scrollEndTimeoutRef.current = window.setTimeout(() => {\n      const mode = modeRef.current;\n      const total = reviews.length;\n      const nearest = nearestAnchor(mode);\n      anchorRef.current = nearest;\n      scrollToAnchor(nearest, mode, true);\n      const m = getMetrics();\n      if (m) updateArrowAvailability(computeVisibleCount(m.cardWidth, m.viewportWidth, total), total, mode);\n    }, 120);\n  };\n\n  useEffect(() => {\n    const viewport = viewportRef.current;\n    if (!viewport) return;\n\n    const total = reviews.length;\n\n    // Only reset scroll/anchor state on a genuine first mount of this row\n    // (or when the review count actually changes, e.g. switching between\n    // the single-row and split-row layouts). Previously this reset ran on\n    // every re-run of this effect, and because `reviews` is recreated as a\n    // new array on every parent render, that meant ANY unrelated re-render\n    // higher up the tree (typing, resizing, other state updates) silently\n    // wiped `anchorRef`/`hasUserScrolledRef` and snapped the row back to\n    // center — which is what looked like \"clicking an arrow instantly\n    // resets to the first review\" and \"swiping never locks on mobile\"\n    // (the debounced settle in handleScroll would fire, then get its\n    // result immediately discarded by the next reset).\n    if (!didInitRef.current) {\n      hasUserScrolledRef.current = false;\n      anchorRef.current = undefined;\n      didInitRef.current = true;\n    }\n\n    // Re-settle (side padding + centering + arrow state) on every layout\n    // change, including the guaranteed initial call ResizeObserver fires\n    // right after observe(). Determines from how many cards currently fit\n    // whether a card or a gap should be centered, and keeps that balanced\n    // as the screen resizes — until the person scrolls the row themselves.\n    const settle = () => {\n      const m = getMetrics();\n      if (!m) return;\n      const visibleCount = computeVisibleCount(m.cardWidth, m.viewportWidth, total);\n      const mode = modeForVisibleCount(visibleCount);\n\n      updateSidePadding(visibleCount);\n\n      if (!hasUserScrolledRef.current) {\n        if (modeRef.current !== mode || anchorRef.current === undefined) {\n          anchorRef.current = adjustAnchorForMode(anchorRef.current, mode, total);\n        }\n        modeRef.current = mode;\n        scrollToAnchor(anchorRef.current, mode, false);\n      } else {\n        modeRef.current = mode;\n      }\n\n      updateArrowAvailability(visibleCount, total, mode);\n    };\n\n    const resizeObserver = new ResizeObserver(settle);\n    resizeObserver.observe(viewport);\n    return () => {\n      resizeObserver.disconnect();\n      cancelAutoScrollRef.current?.();\n      window.clearTimeout(scrollEndTimeoutRef.current);\n    };\n    // Depend on the review count, not the `reviews` array reference itself\n    // (that reference changes on every parent render even when the actual\n    // review data hasn't). Combined with the didInitRef guard above, this\n    // effect's reset logic now truly only runs once per distinct row size.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [reviews.length]);\n\n  const scrollByOneCard = (dir: 'left' | 'right') => {\n    const total = reviews.length;\n    const mode = modeRef.current;\n    const current = anchorRef.current ?? naturalAnchor(total, mode);\n    const delta = dir === 'left' ? -1 : 1;\n\n    let next = current + delta;\n    if (mode === 'card') {\n      next = clamp(next, 0, total - 1);\n    } else {\n      const maxHalf = Math.max(0.5, total - 1.5);\n      next = clamp(next, 0.5, maxHalf);\n    }\n\n    hasUserScrolledRef.current = true;\n    anchorRef.current = next;\n    scrollToAnchor(next, mode, true);\n\n    const m = getMetrics();\n    if (m) updateArrowAvailability(computeVisibleCount(m.cardWidth, m.viewportWidth, total), total, mode);\n  };\n\n  return (\n    <div className=\"testi-row-wrap\">\n      <button\n        type=\"button\"\n        className=\"testi-arrow testi-arrow-left\"\n        onClick={() => scrollByOneCard('left')}\n        disabled={!canScrollLeft}\n        aria-label=\"Se forrige anmeldelse\"\n      >\n        <ChevronIcon direction=\"left\" />\n      </button>\n\n      <div className=\"testi-row-viewport\" ref={viewportRef} onScroll={handleScroll}>\n        <div ref={trackRef} className=\"testi-row-track\">\n          {reviews.map((review, i) => (\n            <div className=\"testi-card-col\" key={`${review.user.name}-${i}`}>\n              <ReviewCard review={review} />\n              <ResultCard review={review} />\n            </div>\n          ))}\n        </div>\n      </div>\n\n      <button\n        type=\"button\"\n        className=\"testi-arrow testi-arrow-right\"\n        onClick={() => scrollByOneCard('right')}\n        disabled={!canScrollRight}\n        aria-label=\"Se næste anmeldelse\"\n      >\n        <ChevronIcon direction=\"right\" />\n      </button>\n    </div>\n  );\n}\n\n// ─── Main component ───────────────────────────────────────────────────────────\n\nconst Testimonials: React.FC = () => {\n  const { getContent } = useData();\n\n  const reviewsRaw = getContent(REVIEWS_KEY, '');\n  const ratingRaw = getContent(RATING_KEY, '');\n\n  // Stable array reference: only re-parses (and therefore only produces a\n  // new array identity) when the underlying content STRING actually\n  // changes, instead of on every render of this component. This is what\n  // fixes the row snapping back to the start on any interaction — see the\n  // comment in TestimonialRow's effect for the full explanation.\n  const allReviews = useMemo(() => parseReviewArray(reviewsRaw), [reviewsRaw]);\n  const total = allReviews.length;\n\n  const rowsContainerRef = useRef<HTMLDivElement>(null);\n\n  // Keeps every review card the same height as the tallest one currently\n  // rendered (measured from its natural, unclamped content height) so a\n  // short snippet doesn't leave its card looking undersized next to a long\n  // one. Recomputed on mount and on window resize, since resizing can\n  // change how the quote text wraps (and therefore its natural height).\n  useLayoutEffect(() => {\n    const container = rowsContainerRef.current;\n    if (!container) return;\n\n    const equalize = () => {\n      const cards = Array.from(container.querySelectorAll<HTMLElement>('.testi-review-card'));\n      if (cards.length === 0) return;\n      // Reset to natural height first so we measure real content height,\n      // not a height forced by a previous run of this same function.\n      cards.forEach((card) => { card.style.height = 'auto'; });\n      const tallest = cards.reduce((max, card) => Math.max(max, card.getBoundingClientRect().height), 0);\n      cards.forEach((card) => { card.style.height = `${tallest}px`; });\n    };\n\n    equalize();\n\n    let frame: number;\n    const handleResize = () => {\n      cancelAnimationFrame(frame);\n      frame = requestAnimationFrame(equalize);\n    };\n    window.addEventListener('resize', handleResize);\n    return () => {\n      window.removeEventListener('resize', handleResize);\n      cancelAnimationFrame(frame);\n    };\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [total]);\n\n  // No reviews configured at all — render nothing.\n  if (total === 0) return null;\n\n  const ratingData = useMemo(\n    () => parseRating(ratingRaw) ?? fallbackRating(allReviews),\n    [ratingRaw, allReviews]\n  );\n\n  return (\n    <section className=\"py-20\">\n      <style>{`\n        .testi-header {\n          display: flex;\n          flex-direction: column;\n          align-items: center;\n          text-align: center;\n          gap: 20px;\n          margin-bottom: 48px;\n          padding: 0 24px;\n        }\n        .testi-rating-badge {\n          display: inline-flex;\n          align-items: center;\n          gap: 8px;\n          background: #1a1a1a;\n          border: 1px solid #2a2a2a;\n          border-radius: 999px;\n          padding: 8px 18px;\n          text-decoration: none;\n          color: #f0f0f0;\n          font-family: 'Inter', sans-serif;\n          font-size: 0.85rem;\n          font-weight: 600;\n        }\n        .testi-rating-badge .testi-badge-stars {\n          display: flex;\n          gap: 1px;\n        }\n        .testi-header h2 {\n          font-family: 'Inter', sans-serif;\n          font-size: clamp(1.75rem, 3.5vw, 2.75rem);\n          font-weight: 700;\n          color: #ffffff;\n          margin: 0;\n          max-width: 700px;\n          line-height: 1.2;\n        }\n        .testi-rows {\n          display: flex;\n          flex-direction: column;\n          gap: 24px;\n        }\n        .testi-row-wrap {\n          display: grid;\n          grid-template-columns: auto 1fr auto;\n          grid-template-areas: \"left viewport right\";\n          align-items: center;\n          gap: 12px;\n        }\n        .testi-row-viewport {\n          grid-area: viewport;\n        }\n        .testi-arrow-left {\n          grid-area: left;\n        }\n        .testi-arrow-right {\n          grid-area: right;\n        }\n        .testi-row-viewport {\n          overflow-x: auto;\n          overflow-y: hidden;\n          -webkit-overflow-scrolling: touch;\n          scroll-behavior: auto;\n          scrollbar-width: none;\n          overflow-anchor: none;\n          flex: 1;\n          min-width: 0;\n          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);\n          mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);\n        }\n        .testi-row-viewport::-webkit-scrollbar {\n          display: none;\n        }\n        .testi-row-track {\n          display: flex;\n          gap: 24px;\n          width: max-content;\n          min-width: 100%;\n          justify-content: center;\n          padding: 0 var(--testi-side-pad, 24px);\n        }\n        .testi-arrow {\n          flex-shrink: 0;\n          width: 52px;\n          height: 52px;\n          border-radius: 50%;\n          border: 1px solid #2f2f2f;\n          background: #1a1a1a;\n          color: #ffffff;\n          display: flex;\n          align-items: center;\n          justify-content: center;\n          cursor: pointer;\n          transition: background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.1s;\n        }\n        .testi-arrow:hover:not(:disabled) {\n          background: #262626;\n          border-color: #454545;\n        }\n        .testi-arrow:active:not(:disabled) {\n          transform: scale(0.94);\n        }\n        .testi-arrow:disabled {\n          opacity: 0.25;\n          cursor: default;\n        }\n        .testi-card-col {\n          display: flex;\n          flex-direction: column;\n          gap: 16px;\n          width: 380px;\n          flex-shrink: 0;\n        }\n        .testi-review-card {\n          background: #141414;\n          border: 1px solid #262626;\n          border-radius: 20px;\n          padding: 32px;\n          width: 100%;\n          flex-shrink: 0;\n          display: flex;\n          flex-direction: column;\n        }\n        .big-quote {\n          font-size: 3.5rem;\n          line-height: 0.7;\n          color: #3B82F6;\n          font-family: Georgia, serif;\n          font-weight: 700;\n          user-select: none;\n          display: block;\n          margin-bottom: 8px;\n        }\n        .testi-quote-text {\n          font-family: 'Inter', sans-serif;\n          font-size: 1.05rem;\n          font-weight: 400;\n          color: #f0f0f0;\n          line-height: 1.6;\n          letter-spacing: -0.01em;\n          margin: 0;\n          flex: 1;\n        }\n        .testi-author-row {\n          display: flex;\n          align-items: center;\n          gap: 12px;\n          margin-top: 20px;\n          padding-top: 16px;\n          border-top: 1px solid #262626;\n        }\n        .author-avatar {\n          width: 48px; height: 48px;\n          border-radius: 50%;\n          object-fit: cover;\n          flex-shrink: 0;\n        }\n        .author-avatar-square {\n          border-radius: 0;\n        }\n        .author-avatar-fallback {\n          width: 48px; height: 48px;\n          border-radius: 50%;\n          display: flex; align-items: center; justify-content: center;\n          font-size: 1.05rem; font-weight: 700; color: white;\n          flex-shrink: 0;\n        }\n        .author-link {\n          display: flex;\n          align-items: center;\n          gap: 12px;\n          flex: 1;\n          min-width: 0;\n          text-decoration: none;\n        }\n        .author-info { flex: 1; min-width: 0; }\n        .author-name {\n          font-size: 0.88rem;\n          font-weight: 700;\n          color: #ffffff;\n          margin: 0 0 2px 0;\n          white-space: nowrap;\n          overflow: hidden;\n          text-overflow: ellipsis;\n        }\n        .author-meta {\n          font-size: 0.72rem;\n          color: #A3A3A3;\n          margin: 0;\n          white-space: nowrap;\n          overflow: hidden;\n          text-overflow: ellipsis;\n        }\n        .google-badge {\n          display: flex;\n          align-items: center;\n          justify-content: center;\n          text-decoration: none;\n          background: transparent;\n          border: none;\n          padding: 0;\n          flex-shrink: 0;\n        }\n        .testi-stars {\n          display: flex;\n          gap: 2px;\n          margin-bottom: 6px;\n        }\n        .testi-result-card {\n          background: #141414;\n          border: 1px solid #262626;\n          border-radius: 20px;\n          overflow: hidden;\n          aspect-ratio: 16 / 9;\n          width: 100%;\n          flex-shrink: 0;\n        }\n        .testi-result-card iframe,\n        .testi-result-card img {\n          display: block;\n          width: 100%;\n          height: 100%;\n          border: none;\n          object-fit: cover;\n        }\n        @media (max-width: 768px) {\n          .testi-card-col { width: 300px; }\n          .testi-review-card { padding: 24px; }\n          .big-quote { font-size: 2.75rem; }\n          .testi-quote-text { font-size: 0.95rem; }\n          .testi-row-wrap {\n            grid-template-columns: 1fr 1fr;\n            grid-template-areas:\n              \"viewport viewport\"\n              \"left right\";\n            row-gap: 16px;\n          }\n          .testi-arrow-left { justify-self: end; }\n          .testi-arrow-right { justify-self: start; }\n          .testi-row-viewport {\n            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);\n            mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);\n          }\n        }\n      `}</style>\n\n      <div className=\"testi-header\">\n        <a\n          href={ratingData.link || DEFAULT_GOOGLE_LINK}\n          target=\"_blank\"\n          rel=\"noopener noreferrer\"\n          className=\"testi-rating-badge\"\n        >\n          <span className=\"testi-badge-stars\">\n            {[1, 2, 3, 4, 5].map((i) => (\n              <StarIcon key={i} filled={i <= Math.round(ratingData.rating)} size={13} />\n            ))}\n          </span>\n          Bedømt {Number.isInteger(ratingData.rating) ? ratingData.rating : ratingData.rating.toFixed(1)}/5 på Google\n        </a>\n        <h2>Andre glade kunder</h2>\n      </div>\n\n      <div className=\"testi-rows\" ref={rowsContainerRef}>\n        <TestimonialRow reviews={allReviews} />\n      </div>\n    </section>\n  );\n};\n\nexport default Testimonials;",
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
  },
  {
    "id": "7ea821e3-ea0d-496d-baa4-9e0e8b69ebb9",
    "title": "Efterbehandling",
    "description": "<p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\"></p><p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\">Jeg lægger en ekstra indsats i hvert projekt – både under optagelserne, og bagefter, når materialet skal klippes sammen. Jeg går grundigt igennem alt optaget materiale og vælger de bedste klip ud. Farverne bliver tilpasset, så de fremstår naturlige.</p><p class=\"font-claude-response-body break-words whitespace-normal\" dir=\"ltr\" style=\"caret-color: rgb(255, 255, 255); color: rgb(255, 255, 255);\">Det er denne del af arbejdet, der gør forskellen på et almindeligt resultat og et gennemarbejdet produkt. Jeg tager mig den tid, der skal til, for at sikre, at det færdige resultat lever op til kundens forventninger.</p>",
    "image_url": "youtube:ZtzQqmCoUDU",
    "order_index": 3,
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
  }
];


const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { getContent, isSiteContentLoaded, homeSections: dbSections, isHomeSectionsLoaded } = useData();
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
    () => parseHeroProjectsContent(getContent('content', '[
  {
    \"number\": \"01\",
    \"industry\": \"Specialister i salg af smågrise\",
    \"clientLogoUrl\": \"https://pbqeljimuerxatrtmgsn.supabase.co/storage/v1/object/public/client-logos/1782478431391-38f16914.webp?square\",
    \"cloudinaryVideoUrl\": \"https://res.cloudinary.com/dq6jxbyrg/video/upload/sp_auto/scan-pork.m3u8\",
    \"projectSlug\": \"Specialister i salg af smågrise\",
    \"website\": \"https://scan-pork.com/\"
  },
  {
    \"number\": \"02\",
    \"industry\": \"Leverandør til print, skilte- og bilindpakningsfirmaer\",
    \"clientLogoUrl\": \"https://vikiallo.dk/wp-content/uploads/vikiallo-white-LOGO@2x.png\",
    \"cloudinaryVideoUrl\": \"https://res.cloudinary.com/dq6jxbyrg/video/upload/sp_auto/vikiallo.m3u8\",
    \"projectSlug\": \"Leverandør til print, skilte- og bilindpakningsfirmaer\",
    \"website\": \"https://vikiallo.dk/\"
  }
]', 'image'), heroProjectsContent.content),
    [getContent],
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
  const activeProjectPublicId = activeProject
    ? extractCloudinaryPublicId(activeProject.cloudinaryVideoUrl)
    : undefined;

  // Advance to the next project only once the current one's video has
  // played all the way through (HeroVideoSection's `onEnded`), instead of
  // switching on a fixed timer that could cut a longer video off early.
  // No-op with 0 or 1 projects, matching HeroProjectCarousel's own guard.
  const handleProjectVideoEnded = useCallback(() => {
    setActiveProjectIndex((i) =>
      heroProjectItems.length > 1 ? (i + 1) % heroProjectItems.length : i
    );
  }, [heroProjectItems.length]);

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
    });
    if (neighborIds.size === 0) return;

    const run = () => neighborIds.forEach((id) => prefetchProjectVideo(id));
    const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : null;
    const idleId = ric ? ric(run, { timeout: 4000 }) : window.setTimeout(run, 1500);
    return () => {
      if (ric && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId as number);
      else window.clearTimeout(idleId as number);
    };
  }, [activeProjectIndex, heroProjectItems, activeProjectPublicId]);

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
          // Only wired up with 2+ projects — with a single project (or
          // none) the video should keep looping forever, same as before.
          onEnded={heroProjectItems.length > 1 ? handleProjectVideoEnded : undefined}
          onProgress={setHeroVideoProgress}
        >
          <div className="flex flex-col h-full w-full">
            <div className="flex-1" />
            <HeroProjectCarousel
              data={{ content: heroProjectItems }}
              activeIndex={activeProjectIndex}
              onChangeIndex={setActiveProjectIndex}
              progress={heroVideoProgress}
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
          <div className="mb-10">
            <AiCTA />
          </div>
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
