
import '../utils/heroPreload'
import { initHeroSync } from '../utils/heroSync'
import React, { lazy, Suspense, useMemo } from 'react';
import AiCTA from '../components/AiCTA';
import SEO from '../components/SEO';
import { useNavigate } from 'react-router-dom';
import { Video, Camera, MapPin } from 'lucide-react';
import HeroVideoSection from '../components/HeroVideoSection';
import ClientLogosBar from '../components/ClientLogosBar';
import EditableContent from '../components/EditableContent';
import HomeSectionCard from '../components/HomeSectionCard';
import { useData } from '../contexts/DataContext';
import { useIpCoverage } from '../hooks/useIpCoverage';
import AdaptiveShadowBox from '../components/AdaptiveShadowBox';

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
// Section: Hvorfor Flai? (701f795b-5ff5-40a9-8bc1-ce0ca247b5af)
const Section_701f795b = (() => {
  const HvorforFlai = () => {
    const styles = `
      :root {
        --primary: #0F52BA;
        --secondary: #64A0FF;
      }

      .flai-container {
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        padding: 48px 20px 48px 20px;
        font-family: sans-serif;
        box-sizing: border-box;
      }

      .flai-main-title {
        color: #ffffff;
        font-size: 2.25rem;
        font-weight: 700;
        margin: 0 0 40px 0;
        letter-spacing: 0;
        line-height: 1.2;
        text-align: center;
      }

      .flai-card {
        display: flex;
      }

      .flai-subtitle {
        color: var(--secondary);
        font-weight: 600;
        font-size: 1.25rem;
        line-height: 1.2;
        display: flex;
        margin: 0;
        text-align: center;
        justify-content: center;
      }

      .flai-description {
        color: #d4d4d4;
        font-weight: 400;
        font-size: 0.875rem;
        line-height: 1.625;
        margin: 0;
        text-align: center;
      }

      .flai-icon-box {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      @media (max-width: 600px) {
        .flai-container {
          padding: 32px 16px 32px 16px;
        }
        .flai-main-title {
          font-size: 1.875rem;
          margin-bottom: 20px;
          text-align: left;
        }
        .flai-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
        }
        .flai-card {
          flex-direction: column;
          align-items: flex-start;
          padding: 20px 0;
        }
        .flai-icon-box {
          height: auto;
          width: auto;
          margin-bottom: 12px;
          justify-content: flex-start;
        }
        .flai-svg {
          width: 40px;
          height: 40px;
        }
        .flai-text-group {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .flai-subtitle {
          font-size: 1rem;
          min-height: unset;
          margin-bottom: 4px;
          text-align: left;
          justify-content: flex-start;
        }
        .flai-description {
          font-size: 0.875rem;
          max-width: 100%;
          text-align: left;
        }
      }

      @media (min-width: 601px) {
        .flai-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .flai-card {
          flex-direction: column;
          align-items: center;
          padding-bottom: 32px;
          border-bottom: none;
        }
        .flai-text-group {
          display: contents;
        }
        .flai-icon-box {
          height: 65px;
          margin-bottom: 16px;
        }
        .flai-svg {
          width: clamp(44px, 6vw, 60px);
          height: clamp(44px, 6vw, 60px);
        }
        .flai-subtitle {
          min-height: 36px;
          align-items: center;
          margin-bottom: 10px;
        }
        .flai-description {
          max-width: 240px;
        }
      }
    `;

    return (
      <>
        <style>{styles}</style>
        <div style={{ backgroundColor: '#262626', width: '100%' }}>
          <div className="flai-container">
            <h1 className="flai-main-title">Hvorfor Flai?</h1>

            <div className="flai-grid">

              {/* Fleksibilitet */}
              <div className="flai-card">
                <div className="flai-icon-box">
                  <svg className="flai-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M52 32C52 43.0457 43.0457 52 32 52C20.9543 52 12 43.0457 12 32C12 20.9543 20.9543 12 32 12" stroke="#0F52BA" strokeWidth="4" strokeLinecap="round"/>
                    <path d="M32 4L44 12L32 20" fill="#64A0FF"/>
                    <circle cx="32" cy="32" r="6" fill="#64A0FF" fillOpacity="0.6"/>
                    <path d="M22 32H42" stroke="#0F52BA" strokeWidth="4" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flai-text-group">
                  <h3 className="flai-subtitle">Fleksibilitet</h3>
                  <p className="flai-description">Vi tilpasser os efter dine behov. Vi tager ikke ekstra for at gå den ekstra mil eller løse opgaver ud over det sædvanlige.</p>
                </div>
              </div>

              {/* Booking */}
              <div className="flai-card">
                <div className="flai-icon-box">
                  <svg className="flai-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="10" y="16" width="44" height="32" rx="4" stroke="#0F52BA" strokeWidth="4"/>
                    <path d="M10 26H54" stroke="#0F52BA" strokeWidth="4"/>
                    <circle cx="46" cy="46" r="12" fill="#64A0FF"/>
                    <path d="M41 46L44 49L51 42" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flai-text-group">
                  <h3 className="flai-subtitle">Nem og hurtig booking</h3>
                  <p className="flai-description">Glem alt om komplekse kontrakter. Book direkte via hjemmesiden eller send en besked.</p>
                </div>
              </div>

              {/* Kvalitet */}
              <div className="flai-card">
                <div className="flai-icon-box">
                  <svg className="flai-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M32 8L52 24L32 56L12 24L32 8Z" fill="#0F52BA"/>
                    <path d="M32 8L42 24H22L32 8Z" fill="#64A0FF"/>
                    <path d="M52 24H12L32 32L52 24Z" fill="#64A0FF" fillOpacity="0.5"/>
                    <circle cx="50" cy="14" r="3" fill="#64A0FF"/>
                  </svg>
                </div>
                <div className="flai-text-group">
                  <h3 className="flai-subtitle">Kvalitet</h3>
                  <p className="flai-description">Vi bruger DJI Mini 5 Pro og DaVinci Resolve Studio. Det sikrer dig knivskarpe 4K-optagelser med perfekt farve og klipning.</p>
                </div>
              </div>

              {/* Leveringstid */}
              <div className="flai-card">
                <div className="flai-icon-box">
                  <svg className="flai-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="36" cy="34" r="22" stroke="#0F52BA" strokeWidth="4"/>
                    <path d="M36 22V34L44 42" stroke="#64A0FF" strokeWidth="4" strokeLinecap="round"/>
                    <path d="M6 24H18M4 34H14M6 44H18" stroke="#64A0FF" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flai-text-group">
                  <h3 className="flai-subtitle">Leverings tid</h3>
                  <p className="flai-description">Vi leverer dine billeder inden for 24-48 timer og færdigredigeret video inden for 5-7 dage.</p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </>
    );
  };
  return HvorforFlai;
})() as React.ComponentType;

// Section: Testimonials (9009b281-e411-445f-8c58-7b2470ce61b3)
const Section_9009b281 = ((
  useState, useEffect, useRef
) => {
  // ─── Types ────────────────────────────────────────────────────────────────────
  //
  // ONE content key holds every review as a JSON ARRAY. Items mirror the shape
  // coming from cached_reviews.reviews_data so you can copy-paste straight from
  // the Supabase table without reformatting.
  //
  // Required fields per item:  user.name, rating, snippet
  // Optional fields per item:  user.thumbnail, link, business
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
  //     "business": "Christensen Ejendomme A/S"
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
  // On mount, each row centers the middle review of its own array in the
  // viewport (e.g. with 4 reviews, review 2 of 4 lands centered — the same
  // "floor((n-1)/2)" index a human would call the middle card). This happens
  // one frame after layout so card widths are already final.

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

  /** Smoothly animates scrollLeft with a fixed easing curve, so arrow clicks
   * and swipe-driven snap settle with the same feel instead of each browser's
   * own (differing) default for "smooth" scroll vs. touch snap-back. */
  function animateScrollTo(el: HTMLElement, targetLeft: number, duration = SCROLL_ANIMATION_MS) {
    const startLeft = el.scrollLeft;
    const distance = targetLeft - startLeft;
    if (Math.abs(distance) < 1) return;

    const startTime = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      el.scrollLeft = startLeft + distance * easeOutCubic(progress);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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

  /** The "middle" review index for a given count — with 4 reviews this is
   * index 1 (review 2 of 4); with 5 reviews it's index 2 (the true center). */
  function middleIndex(count: number): number {
    return Math.floor((count - 1) / 2);
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
    // Distinguishes our own programmatic centering from a real user scroll,
    // so auto-centering can keep correcting itself on layout changes without
    // ever fighting a swipe/arrow move the person actually made.
    const isAutoScrolling = useRef(false);
    const hasUserScrolledRef = useRef(false);

    const updateSidePadding = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;
      const firstCard = track.firstElementChild as HTMLElement | null;
      if (!firstCard) return;

      const cardWidth = firstCard.getBoundingClientRect().width;
      const viewportWidth = viewport.clientWidth;
      const visibleCount = Math.max(
        1,
        Math.min(
          reviews.length,
          Math.floor((viewportWidth + CARD_GAP_PX) / (cardWidth + CARD_GAP_PX))
        )
      );

      // Center the block of currently-visible cards as a group. If that count
      // is odd, the middle card lands exactly at screen center; if even, the
      // gap between the two middle cards lands at screen center — both are
      // just the natural result of centering the N-card block itself.
      const blockWidth = visibleCount * cardWidth + (visibleCount - 1) * CARD_GAP_PX;
      const sidePad = Math.max(0, (viewportWidth - blockWidth) / 2);
      track.style.setProperty('--testi-side-pad', `${sidePad}px`);
    };

    const updateArrowState = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;

      const firstCard = track.firstElementChild as HTMLElement | null;
      if (!firstCard) return;

      const cardWidth = firstCard.getBoundingClientRect().width + CARD_GAP_PX;
      const visibleCount = Math.floor(viewport.clientWidth / cardWidth);

      // If every review already fits on screen at once, there's nothing to
      // reveal by clicking an arrow — disable both regardless of scroll pos.
      if (reviews.length <= visibleCount) {
        setCanScrollLeft(false);
        setCanScrollRight(false);
        return;
      }

      setCanScrollLeft(viewport.scrollLeft > 4);
      setCanScrollRight(viewport.scrollLeft < viewport.scrollWidth - viewport.clientWidth - 4);
    };

    /** Scrolls (no animation — used for auto-centering, not user-triggered
     * moves) so the card at `index` sits centered in the viewport. Uses the
     * browser's native scrollIntoView instead of manually computing a
     * scrollLeft: manual math has to exactly replicate whatever the browser
     * did with the side-padding/box model, and any mismatch (or the browser's
     * own scroll-anchoring kicking in when that padding shifts) tends to drag
     * the position toward one edge — showing the LAST card as centered
     * instead of the middle one, especially with few cards where the
     * scrollable range is tiny. scrollIntoView re-derives the correct
     * position from the live layout every time it's called instead. */
    const centerCardAtIndex = (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      const card = track.children[index] as HTMLElement | undefined;
      if (!card) return;

      isAutoScrolling.current = true;
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
      requestAnimationFrame(() => {
        isAutoScrolling.current = false;
      });
    };

    const handleScroll = () => {
      updateArrowState();
      if (!isAutoScrolling.current) hasUserScrolledRef.current = true;
    };

    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      hasUserScrolledRef.current = false;
      const centerIndex = middleIndex(reviews.length);

      // Re-settle (side padding + centering + arrow state) on every layout
      // change, including the guaranteed initial call ResizeObserver fires
      // right after observe(). A single early measurement isn't enough: for
      // small/odd counts (e.g. 3 reviews) the scrollable range is tiny, so a
      // later layout nudge (fonts/images finishing, a scrollbar appearing)
      // could shift the side padding just enough to push the already-centered
      // card all the way to the end — showing the LAST review as current
      // instead of the middle one. Re-running on every resize keeps it
      // correct, and it stops the moment the person scrolls the row themselves.
      const settle = () => {
        updateSidePadding();
        if (!hasUserScrolledRef.current) {
          centerCardAtIndex(centerIndex);
        }
        updateArrowState();
      };

      const resizeObserver = new ResizeObserver(settle);
      resizeObserver.observe(viewport);
      return () => resizeObserver.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reviews]);

    const scrollByOneCard = (dir: 'left' | 'right') => {
      hasUserScrolledRef.current = true;
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;
      const firstCard = track.firstElementChild as HTMLElement | null;
      if (!firstCard) return;
      const cardWidth = firstCard.getBoundingClientRect().width + CARD_GAP_PX;
      const targetLeft = viewport.scrollLeft + (dir === 'left' ? -cardWidth : cardWidth);
      animateScrollTo(viewport, targetLeft);
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
              <ReviewCard key={`${review.user.name}-${i}`} review={review} />
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

    const allReviews = parseReviewArray(getContent(REVIEWS_KEY, ''));
    const total = allReviews.length;

    // No reviews configured at all — render nothing.
    if (total === 0) return null;

    const ratingData = parseRating(getContent(RATING_KEY, '')) ?? fallbackRating(allReviews);

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
            scroll-snap-type: x mandatory;
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
          .testi-review-card {
            background: #141414;
            border: 1px solid #262626;
            border-radius: 20px;
            padding: 32px;
            width: 380px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            scroll-snap-align: center;
            scroll-snap-stop: always;
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
          @media (max-width: 768px) {
            .testi-review-card { width: 300px; padding: 24px; }
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

        <div className="testi-rows">
          <TestimonialRow reviews={allReviews} />
        </div>
      </section>
    );
  };
  return Testimonials;
})(
  React.useState, React.useEffect, React.useRef
) as React.ComponentType;

const CODE_SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  '701f795b-5ff5-40a9-8bc1-ce0ca247b5af': Section_701f795b,
  '9009b281-e411-445f-8c58-7b2470ce61b3': Section_9009b281,
};
// @@INJECTED_SECTIONS_END@@
export const DEPLOYED_HOME_SECTIONS = [
  {
    "id": "701f795b-5ff5-40a9-8bc1-ce0ca247b5af",
    "title": "Hvorfor Flai?",
    "description": "Interactive Code Section",
    "image_url": null,
    "order_index": 0,
    "is_active": false,
    "created_at": null,
    "updated_at": null,
    "section_type": "code",
    "code_content": null,
    "code_language": null,
    "code_files": [
      {
        "content": "const HvorforFlai = () => {\n  const styles = `\n    :root {\n      --primary: #0F52BA;\n      --secondary: #64A0FF;\n    }\n\n    .flai-container {\n      width: 100%;\n      max-width: 1200px;\n      margin: 0 auto;\n      padding: 48px 20px 48px 20px;\n      font-family: sans-serif;\n      box-sizing: border-box;\n    }\n\n    .flai-main-title {\n      color: #ffffff;\n      font-size: 2.25rem;\n      font-weight: 700;\n      margin: 0 0 40px 0;\n      letter-spacing: 0;\n      line-height: 1.2;\n      text-align: center;\n    }\n\n    .flai-card {\n      display: flex;\n    }\n\n    .flai-subtitle {\n      color: var(--secondary);\n      font-weight: 600;\n      font-size: 1.25rem;\n      line-height: 1.2;\n      display: flex;\n      margin: 0;\n      text-align: center;\n      justify-content: center;\n    }\n\n    .flai-description {\n      color: #d4d4d4;\n      font-weight: 400;\n      font-size: 0.875rem;\n      line-height: 1.625;\n      margin: 0;\n      text-align: center;\n    }\n\n    .flai-icon-box {\n      display: flex;\n      align-items: center;\n      justify-content: center;\n    }\n\n    @media (max-width: 600px) {\n      .flai-container {\n        padding: 32px 16px 32px 16px;\n      }\n      .flai-main-title {\n        font-size: 1.875rem;\n        margin-bottom: 20px;\n        text-align: left;\n      }\n      .flai-grid {\n        display: grid;\n        grid-template-columns: 1fr;\n        gap: 0;\n      }\n      .flai-card {\n        flex-direction: column;\n        align-items: flex-start;\n        padding: 20px 0;\n      }\n      .flai-icon-box {\n        height: auto;\n        width: auto;\n        margin-bottom: 12px;\n        justify-content: flex-start;\n      }\n      .flai-svg {\n        width: 40px;\n        height: 40px;\n      }\n      .flai-text-group {\n        display: flex;\n        flex-direction: column;\n        align-items: flex-start;\n      }\n      .flai-subtitle {\n        font-size: 1rem;\n        min-height: unset;\n        margin-bottom: 4px;\n        text-align: left;\n        justify-content: flex-start;\n      }\n      .flai-description {\n        font-size: 0.875rem;\n        max-width: 100%;\n        text-align: left;\n      }\n    }\n\n    @media (min-width: 601px) {\n      .flai-grid {\n        display: grid;\n        grid-template-columns: repeat(4, 1fr);\n        gap: 24px;\n      }\n      .flai-card {\n        flex-direction: column;\n        align-items: center;\n        padding-bottom: 32px;\n        border-bottom: none;\n      }\n      .flai-text-group {\n        display: contents;\n      }\n      .flai-icon-box {\n        height: 65px;\n        margin-bottom: 16px;\n      }\n      .flai-svg {\n        width: clamp(44px, 6vw, 60px);\n        height: clamp(44px, 6vw, 60px);\n      }\n      .flai-subtitle {\n        min-height: 36px;\n        align-items: center;\n        margin-bottom: 10px;\n      }\n      .flai-description {\n        max-width: 240px;\n      }\n    }\n  `;\n\n  return (\n    <>\n      <style>{styles}</style>\n      <div style={{ backgroundColor: '#262626', width: '100%' }}>\n        <div className=\"flai-container\">\n          <h1 className=\"flai-main-title\">Hvorfor Flai?</h1>\n\n          <div className=\"flai-grid\">\n\n            {/* Fleksibilitet */}\n            <div className=\"flai-card\">\n              <div className=\"flai-icon-box\">\n                <svg className=\"flai-svg\" viewBox=\"0 0 64 64\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                  <path d=\"M52 32C52 43.0457 43.0457 52 32 52C20.9543 52 12 43.0457 12 32C12 20.9543 20.9543 12 32 12\" stroke=\"#0F52BA\" strokeWidth=\"4\" strokeLinecap=\"round\"/>\n                  <path d=\"M32 4L44 12L32 20\" fill=\"#64A0FF\"/>\n                  <circle cx=\"32\" cy=\"32\" r=\"6\" fill=\"#64A0FF\" fillOpacity=\"0.6\"/>\n                  <path d=\"M22 32H42\" stroke=\"#0F52BA\" strokeWidth=\"4\" strokeLinecap=\"round\"/>\n                </svg>\n              </div>\n              <div className=\"flai-text-group\">\n                <h3 className=\"flai-subtitle\">Fleksibilitet</h3>\n                <p className=\"flai-description\">Vi tilpasser os efter dine behov. Vi tager ikke ekstra for at gå den ekstra mil eller løse opgaver ud over det sædvanlige.</p>\n              </div>\n            </div>\n\n            {/* Booking */}\n            <div className=\"flai-card\">\n              <div className=\"flai-icon-box\">\n                <svg className=\"flai-svg\" viewBox=\"0 0 64 64\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                  <rect x=\"10\" y=\"16\" width=\"44\" height=\"32\" rx=\"4\" stroke=\"#0F52BA\" strokeWidth=\"4\"/>\n                  <path d=\"M10 26H54\" stroke=\"#0F52BA\" strokeWidth=\"4\"/>\n                  <circle cx=\"46\" cy=\"46\" r=\"12\" fill=\"#64A0FF\"/>\n                  <path d=\"M41 46L44 49L51 42\" stroke=\"white\" strokeWidth=\"3\" strokeLinecap=\"round\" strokeLinejoin=\"round\"/>\n                </svg>\n              </div>\n              <div className=\"flai-text-group\">\n                <h3 className=\"flai-subtitle\">Nem og hurtig booking</h3>\n                <p className=\"flai-description\">Glem alt om komplekse kontrakter. Book direkte via hjemmesiden eller send en besked.</p>\n              </div>\n            </div>\n\n            {/* Kvalitet */}\n            <div className=\"flai-card\">\n              <div className=\"flai-icon-box\">\n                <svg className=\"flai-svg\" viewBox=\"0 0 64 64\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                  <path d=\"M32 8L52 24L32 56L12 24L32 8Z\" fill=\"#0F52BA\"/>\n                  <path d=\"M32 8L42 24H22L32 8Z\" fill=\"#64A0FF\"/>\n                  <path d=\"M52 24H12L32 32L52 24Z\" fill=\"#64A0FF\" fillOpacity=\"0.5\"/>\n                  <circle cx=\"50\" cy=\"14\" r=\"3\" fill=\"#64A0FF\"/>\n                </svg>\n              </div>\n              <div className=\"flai-text-group\">\n                <h3 className=\"flai-subtitle\">Kvalitet</h3>\n                <p className=\"flai-description\">Vi bruger DJI Mini 5 Pro og DaVinci Resolve Studio. Det sikrer dig knivskarpe 4K-optagelser med perfekt farve og klipning.</p>\n              </div>\n            </div>\n\n            {/* Leveringstid */}\n            <div className=\"flai-card\">\n              <div className=\"flai-icon-box\">\n                <svg className=\"flai-svg\" viewBox=\"0 0 64 64\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                  <circle cx=\"36\" cy=\"34\" r=\"22\" stroke=\"#0F52BA\" strokeWidth=\"4\"/>\n                  <path d=\"M36 22V34L44 42\" stroke=\"#64A0FF\" strokeWidth=\"4\" strokeLinecap=\"round\"/>\n                  <path d=\"M6 24H18M4 34H14M6 44H18\" stroke=\"#64A0FF\" strokeWidth=\"3\" strokeLinecap=\"round\"/>\n                </svg>\n              </div>\n              <div className=\"flai-text-group\">\n                <h3 className=\"flai-subtitle\">Leverings tid</h3>\n                <p className=\"flai-description\">Vi leverer dine billeder inden for 24-48 timer og færdigredigeret video inden for 5-7 dage.</p>\n              </div>\n            </div>\n\n          </div>\n        </div>\n      </div>\n    </>\n  );\n};\n\nexport default HvorforFlai;",
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
        "content": "import React, { useEffect, useRef, useState } from 'react';\nimport { useData } from '../contexts/DataContext';\n\n// ─── Types ────────────────────────────────────────────────────────────────────\n//\n// ONE content key holds every review as a JSON ARRAY. Items mirror the shape\n// coming from cached_reviews.reviews_data so you can copy-paste straight from\n// the Supabase table without reformatting.\n//\n// Required fields per item:  user.name, rating, snippet\n// Optional fields per item:  user.thumbnail, link, business\n//\n// Content key:\n//   testimonials-review-2   -> array of ALL reviews (top of array = shown first)\n//\n// Example value:\n// [\n//   {\n//     \"user\": { \"name\": \"Mette Christensen\", \"thumbnail\": \"https://lh3.googleusercontent.com/a/...\" },\n//     \"rating\": 5,\n//     \"snippet\": \"Fantastisk service! Felix leverede utrolig flotte dronefotos.\",\n//     \"link\": \"https://maps.google.com/?cid=...\",\n//     \"business\": \"Christensen Ejendomme A/S\"\n//   },\n//   {\n//     \"user\": { \"name\": \"Jonas Berg\" },\n//     \"rating\": 5,\n//     \"snippet\": \"Hurtig, professionel og super kvalitet.\"\n//   }\n// ]\n//\n// \"business\" is the only field that does NOT exist in cached_reviews — add it manually if wanted.\n// \"link\" maps to reviews_data[n].link in the cached_reviews table.\n// If \"business\" is omitted the label shows \"Verificeret Google-anmeldelse\".\n// If \"business\" is set it shows the business name only (replacing the default label).\n//\n// If a thumbnail URL contains the word \"square\" anywhere in it, the avatar is\n// rendered as a rounded square instead of being cropped into a circle.\n//\n// Content key for the header rating badge:\n//   testimonials-google-rating\n//\n// Example:\n// { \"rating\": 4.9, \"reviewCount\": 127, \"link\": \"https://search.google.com/local/writereview?placeid=...\" }\n//\n// If this key is left empty, the badge falls back to the average rating and count\n// of every configured review.\n//\n// ─── Layout rules ────────────────────────────────────────────────────────────\n// Desktop (>768px):\n//   - 8 or fewer reviews  -> single row, all reviews\n//   - more than 8 reviews -> split in half: top half of the array = row 1, bottom half = row 2\n// Mobile (<=768px):\n//   - 6 or fewer reviews  -> single row, all reviews\n//   - more than 6 reviews -> split in half the same way (top half = row 1, bottom half = row 2)\n//\n// Each row is a horizontally scrollable strip. Left/right arrow buttons advance\n// the row by exactly one card per click, clamped at both ends (no wraparound).\n// On touch devices the row can also be swiped natively — no extra JS needed for\n// that, since it's a plain scroll container.\n//\n// ─── Initial scroll position ──────────────────────────────────────────────────\n// On mount, each row centers the middle review of its own array in the\n// viewport (e.g. with 4 reviews, review 2 of 4 lands centered — the same\n// \"floor((n-1)/2)\" index a human would call the middle card). This happens\n// one frame after layout so card widths are already final.\n\ninterface ReviewUser {\n  name: string;\n  thumbnail?: string;\n}\n\ninterface ReviewData {\n  user: ReviewUser;\n  rating: number;\n  snippet: string;\n  link?: string;\n  /** Not in cached_reviews — add manually when editing the content key */\n  business?: string;\n}\n\ninterface GoogleRatingData {\n  rating: number;\n  reviewCount: number;\n  link?: string;\n}\n\nconst REVIEWS_KEY = 'testimonials-review-2';\nconst RATING_KEY = 'testimonials-google-rating';\nconst DEFAULT_GOOGLE_LINK =\n  'https://search.google.com/local/writereview?placeid=ChIJq5JklwgFuQ0RREPIKUg0EHs';\n\nconst CARD_GAP_PX = 24;\nconst SCROLL_ANIMATION_MS = 380;\n\n/** Smoothly animates scrollLeft with a fixed easing curve, so arrow clicks\n * and swipe-driven snap settle with the same feel instead of each browser's\n * own (differing) default for \"smooth\" scroll vs. touch snap-back. */\nfunction animateScrollTo(el: HTMLElement, targetLeft: number, duration = SCROLL_ANIMATION_MS) {\n  const startLeft = el.scrollLeft;\n  const distance = targetLeft - startLeft;\n  if (Math.abs(distance) < 1) return;\n\n  const startTime = performance.now();\n  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);\n\n  const step = (now: number) => {\n    const elapsed = now - startTime;\n    const progress = Math.min(elapsed / duration, 1);\n    el.scrollLeft = startLeft + distance * easeOutCubic(progress);\n    if (progress < 1) requestAnimationFrame(step);\n  };\n  requestAnimationFrame(step);\n}\n\n// ─── Helpers ─────────────────────────────────────────────────────────────────\n\nfunction isValidReview(item: unknown): item is ReviewData {\n  const r = item as ReviewData;\n  return !!r?.user?.name && !!r?.snippet;\n}\n\n/** Parses the content key holding a JSON array of review objects. */\nfunction parseReviewArray(raw: string): ReviewData[] {\n  if (!raw.trim()) return [];\n  try {\n    const parsed = JSON.parse(raw);\n    if (!Array.isArray(parsed)) return [];\n    return parsed.filter(isValidReview);\n  } catch {\n    return [];\n  }\n}\n\nfunction parseRating(raw: string): GoogleRatingData | null {\n  if (!raw.trim()) return null;\n  try {\n    const parsed = JSON.parse(raw) as GoogleRatingData;\n    if (typeof parsed?.rating !== 'number' || typeof parsed?.reviewCount !== 'number') return null;\n    return parsed;\n  } catch {\n    return null;\n  }\n}\n\nfunction fallbackRating(reviews: ReviewData[]): GoogleRatingData {\n  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;\n  return { rating: Math.round(avg * 10) / 10, reviewCount: reviews.length };\n}\n\nfunction getInitials(name: string): string {\n  return name\n    .split(' ')\n    .map((n) => n[0])\n    .slice(0, 2)\n    .join('')\n    .toUpperCase();\n}\n\nfunction nameToHue(name: string): number {\n  return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;\n}\n\n/** Thumbnails whose URL contains \"square\" should be shown uncropped\n * (rounded square) instead of being forced into a circle. */\nfunction isSquareThumbnail(url?: string): boolean {\n  return !!url && url.toLowerCase().includes('square');\n}\n\n/** The \"middle\" review index for a given count — with 4 reviews this is\n * index 1 (review 2 of 4); with 5 reviews it's index 2 (the true center). */\nfunction middleIndex(count: number): number {\n  return Math.floor((count - 1) / 2);\n}\n\n// ─── Sub-components ───────────────────────────────────────────────────────────\n\nfunction GoogleG({ size = 14 }: { size?: number }) {\n  return (\n    <svg width={size} height={size} viewBox=\"0 0 24 24\" fill=\"none\">\n      <path d=\"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z\" fill=\"#4285F4\" />\n      <path d=\"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z\" fill=\"#34A853\" />\n      <path d=\"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z\" fill=\"#FBBC05\" />\n      <path d=\"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z\" fill=\"#EA4335\" />\n    </svg>\n  );\n}\n\nfunction StarIcon({ filled = true, size = 14 }: { filled?: boolean; size?: number }) {\n  return (\n    <svg width={size} height={size} viewBox=\"0 0 24 24\" fill={filled ? '#FBBF24' : '#404040'} stroke=\"none\">\n      <path d=\"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\" />\n    </svg>\n  );\n}\n\nfunction ReviewCard({ review }: { review: ReviewData }) {\n  const hue = nameToHue(review.user.name);\n  // Business name fully replaces the default label when present.\n  const metaLabel = review.business || 'Verificeret Google-anmeldelse';\n  const googleLink = review.link || DEFAULT_GOOGLE_LINK;\n  const isSquare = isSquareThumbnail(review.user.thumbnail);\n\n  return (\n    <div className=\"testi-review-card\">\n      <span className=\"big-quote\" aria-hidden=\"true\">&ldquo;</span>\n      <p className=\"testi-quote-text\">{review.snippet}</p>\n      <div className=\"testi-author-row\">\n        <a\n          href={googleLink}\n          target=\"_blank\"\n          rel=\"noopener noreferrer\"\n          className=\"author-link\"\n          title=\"Se anmeldelse på Google\"\n        >\n          {review.user.thumbnail ? (\n            <img\n              src={review.user.thumbnail}\n              alt={review.user.name}\n              className={`author-avatar${isSquare ? ' author-avatar-square' : ''}`}\n              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}\n            />\n          ) : (\n            <div\n              className=\"author-avatar-fallback\"\n              style={{ backgroundColor: `hsl(${hue}, 35%, 28%)` }}\n            >\n              {getInitials(review.user.name)}\n            </div>\n          )}\n          <div className=\"author-info\">\n            <div className=\"testi-stars\">\n              {[1, 2, 3, 4, 5].map((i) => (\n                <StarIcon key={i} filled={i <= Math.round(review.rating)} />\n              ))}\n            </div>\n            <p className=\"author-name\">{review.user.name}</p>\n            <p className=\"author-meta\">{metaLabel}</p>\n          </div>\n        </a>\n        <a\n          href={googleLink}\n          target=\"_blank\"\n          rel=\"noopener noreferrer\"\n          className=\"google-badge\"\n          title=\"Se anmeldelse på Google\"\n        >\n          <GoogleG size={40} />\n        </a>\n      </div>\n    </div>\n  );\n}\n\nfunction ChevronIcon({ direction }: { direction: 'left' | 'right' }) {\n  return (\n    <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2.5\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n      {direction === 'left' ? <path d=\"M15 18l-6-6 6-6\" /> : <path d=\"M9 18l6-6-6-6\" />}\n    </svg>\n  );\n}\n\nfunction TestimonialRow({ reviews }: { reviews: ReviewData[] }) {\n  const viewportRef = useRef<HTMLDivElement>(null);\n  const trackRef = useRef<HTMLDivElement>(null);\n  const [canScrollLeft, setCanScrollLeft] = useState(false);\n  const [canScrollRight, setCanScrollRight] = useState(false);\n  // Distinguishes our own programmatic centering from a real user scroll,\n  // so auto-centering can keep correcting itself on layout changes without\n  // ever fighting a swipe/arrow move the person actually made.\n  const isAutoScrolling = useRef(false);\n  const hasUserScrolledRef = useRef(false);\n\n  const updateSidePadding = () => {\n    const viewport = viewportRef.current;\n    const track = trackRef.current;\n    if (!viewport || !track) return;\n    const firstCard = track.firstElementChild as HTMLElement | null;\n    if (!firstCard) return;\n\n    const cardWidth = firstCard.getBoundingClientRect().width;\n    const viewportWidth = viewport.clientWidth;\n    const visibleCount = Math.max(\n      1,\n      Math.min(\n        reviews.length,\n        Math.floor((viewportWidth + CARD_GAP_PX) / (cardWidth + CARD_GAP_PX))\n      )\n    );\n\n    // Center the block of currently-visible cards as a group. If that count\n    // is odd, the middle card lands exactly at screen center; if even, the\n    // gap between the two middle cards lands at screen center — both are\n    // just the natural result of centering the N-card block itself.\n    const blockWidth = visibleCount * cardWidth + (visibleCount - 1) * CARD_GAP_PX;\n    const sidePad = Math.max(0, (viewportWidth - blockWidth) / 2);\n    track.style.setProperty('--testi-side-pad', `${sidePad}px`);\n  };\n\n  const updateArrowState = () => {\n    const viewport = viewportRef.current;\n    const track = trackRef.current;\n    if (!viewport || !track) return;\n\n    const firstCard = track.firstElementChild as HTMLElement | null;\n    if (!firstCard) return;\n\n    const cardWidth = firstCard.getBoundingClientRect().width + CARD_GAP_PX;\n    const visibleCount = Math.floor(viewport.clientWidth / cardWidth);\n\n    // If every review already fits on screen at once, there's nothing to\n    // reveal by clicking an arrow — disable both regardless of scroll pos.\n    if (reviews.length <= visibleCount) {\n      setCanScrollLeft(false);\n      setCanScrollRight(false);\n      return;\n    }\n\n    setCanScrollLeft(viewport.scrollLeft > 4);\n    setCanScrollRight(viewport.scrollLeft < viewport.scrollWidth - viewport.clientWidth - 4);\n  };\n\n  /** Scrolls (no animation — used for auto-centering, not user-triggered\n   * moves) so the card at `index` sits centered in the viewport. Uses the\n   * browser's native scrollIntoView instead of manually computing a\n   * scrollLeft: manual math has to exactly replicate whatever the browser\n   * did with the side-padding/box model, and any mismatch (or the browser's\n   * own scroll-anchoring kicking in when that padding shifts) tends to drag\n   * the position toward one edge — showing the LAST card as centered\n   * instead of the middle one, especially with few cards where the\n   * scrollable range is tiny. scrollIntoView re-derives the correct\n   * position from the live layout every time it's called instead. */\n  const centerCardAtIndex = (index: number) => {\n    const track = trackRef.current;\n    if (!track) return;\n    const card = track.children[index] as HTMLElement | undefined;\n    if (!card) return;\n\n    isAutoScrolling.current = true;\n    card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });\n    requestAnimationFrame(() => {\n      isAutoScrolling.current = false;\n    });\n  };\n\n  const handleScroll = () => {\n    updateArrowState();\n    if (!isAutoScrolling.current) hasUserScrolledRef.current = true;\n  };\n\n  useEffect(() => {\n    const viewport = viewportRef.current;\n    if (!viewport) return;\n\n    hasUserScrolledRef.current = false;\n    const centerIndex = middleIndex(reviews.length);\n\n    // Re-settle (side padding + centering + arrow state) on every layout\n    // change, including the guaranteed initial call ResizeObserver fires\n    // right after observe(). A single early measurement isn't enough: for\n    // small/odd counts (e.g. 3 reviews) the scrollable range is tiny, so a\n    // later layout nudge (fonts/images finishing, a scrollbar appearing)\n    // could shift the side padding just enough to push the already-centered\n    // card all the way to the end — showing the LAST review as current\n    // instead of the middle one. Re-running on every resize keeps it\n    // correct, and it stops the moment the person scrolls the row themselves.\n    const settle = () => {\n      updateSidePadding();\n      if (!hasUserScrolledRef.current) {\n        centerCardAtIndex(centerIndex);\n      }\n      updateArrowState();\n    };\n\n    const resizeObserver = new ResizeObserver(settle);\n    resizeObserver.observe(viewport);\n    return () => resizeObserver.disconnect();\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [reviews]);\n\n  const scrollByOneCard = (dir: 'left' | 'right') => {\n    hasUserScrolledRef.current = true;\n    const viewport = viewportRef.current;\n    const track = trackRef.current;\n    if (!viewport || !track) return;\n    const firstCard = track.firstElementChild as HTMLElement | null;\n    if (!firstCard) return;\n    const cardWidth = firstCard.getBoundingClientRect().width + CARD_GAP_PX;\n    const targetLeft = viewport.scrollLeft + (dir === 'left' ? -cardWidth : cardWidth);\n    animateScrollTo(viewport, targetLeft);\n  };\n\n  return (\n    <div className=\"testi-row-wrap\">\n      <button\n        type=\"button\"\n        className=\"testi-arrow testi-arrow-left\"\n        onClick={() => scrollByOneCard('left')}\n        disabled={!canScrollLeft}\n        aria-label=\"Se forrige anmeldelse\"\n      >\n        <ChevronIcon direction=\"left\" />\n      </button>\n\n      <div className=\"testi-row-viewport\" ref={viewportRef} onScroll={handleScroll}>\n        <div ref={trackRef} className=\"testi-row-track\">\n          {reviews.map((review, i) => (\n            <ReviewCard key={`${review.user.name}-${i}`} review={review} />\n          ))}\n        </div>\n      </div>\n\n      <button\n        type=\"button\"\n        className=\"testi-arrow testi-arrow-right\"\n        onClick={() => scrollByOneCard('right')}\n        disabled={!canScrollRight}\n        aria-label=\"Se næste anmeldelse\"\n      >\n        <ChevronIcon direction=\"right\" />\n      </button>\n    </div>\n  );\n}\n\n// ─── Main component ───────────────────────────────────────────────────────────\n\nconst Testimonials: React.FC = () => {\n  const { getContent } = useData();\n\n  const allReviews = parseReviewArray(getContent(REVIEWS_KEY, ''));\n  const total = allReviews.length;\n\n  // No reviews configured at all — render nothing.\n  if (total === 0) return null;\n\n  const ratingData = parseRating(getContent(RATING_KEY, '')) ?? fallbackRating(allReviews);\n\n  return (\n    <section className=\"py-20\">\n      <style>{`\n        .testi-header {\n          display: flex;\n          flex-direction: column;\n          align-items: center;\n          text-align: center;\n          gap: 20px;\n          margin-bottom: 48px;\n          padding: 0 24px;\n        }\n        .testi-rating-badge {\n          display: inline-flex;\n          align-items: center;\n          gap: 8px;\n          background: #1a1a1a;\n          border: 1px solid #2a2a2a;\n          border-radius: 999px;\n          padding: 8px 18px;\n          text-decoration: none;\n          color: #f0f0f0;\n          font-family: 'Inter', sans-serif;\n          font-size: 0.85rem;\n          font-weight: 600;\n        }\n        .testi-rating-badge .testi-badge-stars {\n          display: flex;\n          gap: 1px;\n        }\n        .testi-header h2 {\n          font-family: 'Inter', sans-serif;\n          font-size: clamp(1.75rem, 3.5vw, 2.75rem);\n          font-weight: 700;\n          color: #ffffff;\n          margin: 0;\n          max-width: 700px;\n          line-height: 1.2;\n        }\n        .testi-rows {\n          display: flex;\n          flex-direction: column;\n          gap: 24px;\n        }\n        .testi-row-wrap {\n          display: grid;\n          grid-template-columns: auto 1fr auto;\n          grid-template-areas: \"left viewport right\";\n          align-items: center;\n          gap: 12px;\n        }\n        .testi-row-viewport {\n          grid-area: viewport;\n        }\n        .testi-arrow-left {\n          grid-area: left;\n        }\n        .testi-arrow-right {\n          grid-area: right;\n        }\n        .testi-row-viewport {\n          overflow-x: auto;\n          overflow-y: hidden;\n          -webkit-overflow-scrolling: touch;\n          scroll-behavior: auto;\n          scroll-snap-type: x mandatory;\n          scrollbar-width: none;\n          overflow-anchor: none;\n          flex: 1;\n          min-width: 0;\n          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);\n          mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);\n        }\n        .testi-row-viewport::-webkit-scrollbar {\n          display: none;\n        }\n        .testi-row-track {\n          display: flex;\n          gap: 24px;\n          width: max-content;\n          min-width: 100%;\n          justify-content: center;\n          padding: 0 var(--testi-side-pad, 24px);\n        }\n        .testi-arrow {\n          flex-shrink: 0;\n          width: 52px;\n          height: 52px;\n          border-radius: 50%;\n          border: 1px solid #2f2f2f;\n          background: #1a1a1a;\n          color: #ffffff;\n          display: flex;\n          align-items: center;\n          justify-content: center;\n          cursor: pointer;\n          transition: background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.1s;\n        }\n        .testi-arrow:hover:not(:disabled) {\n          background: #262626;\n          border-color: #454545;\n        }\n        .testi-arrow:active:not(:disabled) {\n          transform: scale(0.94);\n        }\n        .testi-arrow:disabled {\n          opacity: 0.25;\n          cursor: default;\n        }\n        .testi-review-card {\n          background: #141414;\n          border: 1px solid #262626;\n          border-radius: 20px;\n          padding: 32px;\n          width: 380px;\n          flex-shrink: 0;\n          display: flex;\n          flex-direction: column;\n          scroll-snap-align: center;\n          scroll-snap-stop: always;\n        }\n        .big-quote {\n          font-size: 3.5rem;\n          line-height: 0.7;\n          color: #3B82F6;\n          font-family: Georgia, serif;\n          font-weight: 700;\n          user-select: none;\n          display: block;\n          margin-bottom: 8px;\n        }\n        .testi-quote-text {\n          font-family: 'Inter', sans-serif;\n          font-size: 1.05rem;\n          font-weight: 400;\n          color: #f0f0f0;\n          line-height: 1.6;\n          letter-spacing: -0.01em;\n          margin: 0;\n          flex: 1;\n        }\n        .testi-author-row {\n          display: flex;\n          align-items: center;\n          gap: 12px;\n          margin-top: 20px;\n          padding-top: 16px;\n          border-top: 1px solid #262626;\n        }\n        .author-avatar {\n          width: 48px; height: 48px;\n          border-radius: 50%;\n          object-fit: cover;\n          flex-shrink: 0;\n        }\n        .author-avatar-square {\n          border-radius: 0;\n        }\n        .author-avatar-fallback {\n          width: 48px; height: 48px;\n          border-radius: 50%;\n          display: flex; align-items: center; justify-content: center;\n          font-size: 1.05rem; font-weight: 700; color: white;\n          flex-shrink: 0;\n        }\n        .author-link {\n          display: flex;\n          align-items: center;\n          gap: 12px;\n          flex: 1;\n          min-width: 0;\n          text-decoration: none;\n        }\n        .author-info { flex: 1; min-width: 0; }\n        .author-name {\n          font-size: 0.88rem;\n          font-weight: 700;\n          color: #ffffff;\n          margin: 0 0 2px 0;\n          white-space: nowrap;\n          overflow: hidden;\n          text-overflow: ellipsis;\n        }\n        .author-meta {\n          font-size: 0.72rem;\n          color: #A3A3A3;\n          margin: 0;\n          white-space: nowrap;\n          overflow: hidden;\n          text-overflow: ellipsis;\n        }\n        .google-badge {\n          display: flex;\n          align-items: center;\n          justify-content: center;\n          text-decoration: none;\n          background: transparent;\n          border: none;\n          padding: 0;\n          flex-shrink: 0;\n        }\n        .testi-stars {\n          display: flex;\n          gap: 2px;\n          margin-bottom: 6px;\n        }\n        @media (max-width: 768px) {\n          .testi-review-card { width: 300px; padding: 24px; }\n          .big-quote { font-size: 2.75rem; }\n          .testi-quote-text { font-size: 0.95rem; }\n          .testi-row-wrap {\n            grid-template-columns: 1fr 1fr;\n            grid-template-areas:\n              \"viewport viewport\"\n              \"left right\";\n            row-gap: 16px;\n          }\n          .testi-arrow-left { justify-self: end; }\n          .testi-arrow-right { justify-self: start; }\n          .testi-row-viewport {\n            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);\n            mask-image: linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%);\n          }\n        }\n      `}</style>\n\n      <div className=\"testi-header\">\n        <a\n          href={ratingData.link || DEFAULT_GOOGLE_LINK}\n          target=\"_blank\"\n          rel=\"noopener noreferrer\"\n          className=\"testi-rating-badge\"\n        >\n          <span className=\"testi-badge-stars\">\n            {[1, 2, 3, 4, 5].map((i) => (\n              <StarIcon key={i} filled={i <= Math.round(ratingData.rating)} size={13} />\n            ))}\n          </span>\n          Bedømt {Number.isInteger(ratingData.rating) ? ratingData.rating : ratingData.rating.toFixed(1)}/5 på Google\n        </a>\n        <h2>Andre glade kunder</h2>\n      </div>\n\n      <div className=\"testi-rows\">\n        <TestimonialRow reviews={allReviews} />\n      </div>\n    </section>\n  );\n};\n\nexport default Testimonials;",
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
  const heroVideoUrl = '';

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

      <HeroVideoSection videoUrl={heroVideoUrl}>
        <div className="flex flex-col h-full w-full">
          <div className="flex-1" />
          <div className="flex flex-col items-center pb-6">
            <AdaptiveShadowBox kind="logo" className="mb-6 flex flex-col items-center text-white">
              <img
                src={heroLogo}
                alt="Flai.dk"
                width="160"
                height="64"
                className="h-16 md:h-16 w-auto transition-all duration-500"
              />
            </AdaptiveShadowBox>
            <AdaptiveShadowBox kind="text" className="text-xl mb-6 text-neutral-100 text-center">
              <EditableContent
                contentKey="hero-subtitle"
                fallback="Dronevideo og foto i Trekantsområdet. 100% tilfredshedsgaranti."
              />
            </AdaptiveShadowBox>
          </div>
          {/* Client logos docked to the bottom of the hero video, so they're
              visible above the fold alongside the buttons/logo/subtitle. */}
          <ClientLogosBar variant="overlay" />
        </div>
      </HeroVideoSection>

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
