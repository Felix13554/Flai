import React, { useEffect, useRef, useState } from 'react';
import { useData } from '../contexts/DataContext';

export interface ClientLogosBarProps {
  /**
   * 'section' (default) — standalone full-width bar with its own background,
   * used between page sections.
   * 'overlay' — same logo size/color as 'section', just with a transparent
   * background so it can sit on top of the hero video, docked to the
   * bottom of the hero.
   */
  variant?: 'section' | 'overlay';
}

// Marquee speed, in pixels/second. 50px/s is the de-facto standard used by
// most large-scale logo tickers (Framer's marquee component and
// react-fast-marquee both default here) — slow enough to read a logo as it
// crosses, fast enough not to feel sluggish. Duration is derived from this
// speed and the actual measured content width, so it stays constant per-logo
// however many logos there are (adding logos doesn't speed the loop up).
const MARQUEE_SPEED_PX_PER_SEC = 50;

// ─── ClientLogosBar ────────────────────────────────────────────────────────
// Stripe-style row of customer logos. All logos are scaled to the same
// height (so width — and therefore how many fit per row — is driven purely
// by each logo's own aspect ratio).
//
// If the logos fit within the row's width, it stays static and centered,
// leaving empty space on the left/right instead of stretching — same as
// before, no animation. If they don't fit (on mobile or desktop, whichever
// breakpoint's logo size/gap causes overflow), the row switches to a
// seamless, continuous marquee instead of clipping or scrolling. This is
// re-measured on resize and as logo images load in, so it's correct at any
// screen width and logo count.
const ClientLogosBar: React.FC<ClientLogosBarProps> = ({ variant = 'section' }) => {
  const { clientLogos, isClientLogosLoaded } = useData();

  const isOverlay = variant === 'overlay';

  // Nothing to show, and nothing ever will be — render nothing rather than
  // an empty bar. Only bail out like this for the non-overlay variant: the
  // overlay variant sits inside the hero's flex layout, so even the "empty"
  // case has to render the same reserved-height slot (see below) or the
  // hero content above it would jump when this resolves to empty.
  if (!isOverlay && isClientLogosLoaded && clientLogos.length === 0) return null;

  const logos = [...clientLogos].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // For the overlay variant, reserve the bar's final height (logo row +
  // padding) from the very first paint — before logos have loaded — so the
  // hero logo/subtitle/buttons above it never shift once logos pop in.
  // Logos fade into this pre-claimed space instead of pushing layout.
  //
  // Once loading has actually finished and there turn out to be zero logos,
  // the slot collapses to 0 height (smoothly, via transition) — there's
  // nothing visible to protect at that point, so no reason to keep the gap.
  const confirmedEmpty = isOverlay && isClientLogosLoaded && logos.length === 0;
  const showLogos = isOverlay ? logos.length > 0 : true;

  // ── Overflow detection ──────────────────────────────────────────────────
  // viewportRef: the visible window the logos sit in (its width is what
  // "fits on screen" means, at whatever breakpoint we're at).
  // groupRef: one un-duplicated set of logos, used purely to measure the
  // natural width the row wants. Always rendered (even once marqueeing) so
  // it keeps reflecting the true content width as images load/resize.
  const viewportRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [durationSec, setDurationSec] = useState(20);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;

    const measure = () => {
      const contentWidth = group.scrollWidth;
      const viewportWidth = viewport.clientWidth;
      // +1px tolerance so sub-pixel rounding doesn't flip this every frame.
      setIsOverflowing(contentWidth > viewportWidth + 1);
      setDurationSec(contentWidth / MARQUEE_SPEED_PX_PER_SEC);
    };

    measure();

    // Re-measures on window resize/rotation AND whenever the group's own
    // size changes (e.g. logo images finishing load and taking their real
    // intrinsic width) — no manual onLoad plumbing needed.
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(group);

    return () => ro.disconnect();
  }, [logos.length]);

  const shouldAnimate = isOverflowing && !reducedMotion;
  // Reduced-motion users still get all the logos, just via a swipeable
  // static row instead of an auto-scrolling one.
  const shouldScrollFallback = isOverflowing && reducedMotion;

  const renderLogo = (logo: (typeof logos)[number], keySuffix: string) => (
    <a
      key={`${logo.id}${keySuffix}`}
      href={logo.website_url}
      target="_blank"
      rel="noopener noreferrer"
      className="clb-logo-link"
      title={logo.name}
    >
      <img src={logo.logo_url} alt={logo.name} className="clb-logo-img" loading="lazy" />
    </a>
  );

  return (
    <section
      className={`client-logos-bar ${isOverlay ? 'clb-overlay' : ''}`}
      style={isOverlay ? undefined : { backgroundColor: '#262626' }}
    >
      <style>{`
        .client-logos-bar .clb-viewport {
          overflow-x: ${shouldScrollFallback ? 'auto' : 'hidden'};
          scrollbar-width: none;
        }
        .client-logos-bar .clb-viewport::-webkit-scrollbar { display: none; }
        .client-logos-bar .clb-track {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          width: ${shouldAnimate ? 'max-content' : '100%'};
          justify-content: ${shouldAnimate ? 'flex-start' : 'center'};
          animation: ${shouldAnimate ? `clb-marquee ${durationSec}s linear infinite` : 'none'};
        }
        .client-logos-bar .clb-track:hover {
          animation-play-state: ${shouldAnimate ? 'paused' : 'running'};
        }
        @keyframes clb-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .client-logos-bar .clb-group {
          flex: 0 0 auto;
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          justify-content: center;
          gap: clamp(40px, 6vw, 80px);
          padding-inline-end: ${shouldAnimate ? 'clamp(40px, 6vw, 80px)' : '0'};
        }
        .client-logos-bar .clb-logo-link {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 64px;
        }
        .client-logos-bar .clb-logo-img {
          height: 100%;
          width: auto;
          object-fit: contain;
          display: block;
        }
        .client-logos-bar.clb-overlay .clb-slot {
          min-height: ${confirmedEmpty ? '0px' : '64px'};
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: ${showLogos ? 1 : 0};
          transition: opacity 0.3s ease, min-height 0.3s ease;
        }
        @media (max-width: 640px) {
          .client-logos-bar .clb-logo-link { height: 44px; }
          .client-logos-bar .clb-group { gap: 36px; padding-inline-end: ${shouldAnimate ? '36px' : '0'}; }
          .client-logos-bar.clb-overlay .clb-slot { min-height: ${confirmedEmpty ? '0px' : '44px'}; }
        }
      `}</style>
      <div className={isOverlay ? `w-full max-w-screen-xl mx-auto px-6 transition-[padding] duration-300 ${confirmedEmpty ? 'pb-0' : 'pb-6 sm:pb-8'}` : 'w-full max-w-screen-xl mx-auto px-6 py-5 md:py-6'}>
        <div className={isOverlay ? 'clb-slot' : undefined}>
          <div className="clb-viewport" ref={viewportRef}>
            <div className="clb-track">
              <div className="clb-group" ref={groupRef}>
                {logos.map((logo) => renderLogo(logo, '-a'))}
              </div>
              {shouldAnimate && (
                <div className="clb-group" aria-hidden="true">
                  {logos.map((logo) => renderLogo(logo, '-b'))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClientLogosBar;
