import React from 'react';
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

// ─── ClientLogosBar ────────────────────────────────────────────────────────
// Stripe-style row of customer logos. All logos are scaled to the same
// height (so width — and therefore how many fit per row — is driven purely
// by each logo's own aspect ratio). When there isn't enough logos to fill
// the row it stays centered, leaving empty space on the left/right instead
// of stretching. Logos are static — no hover effects or animations.
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

  return (
    <section
      className={`client-logos-bar ${isOverlay ? 'clb-overlay' : ''}`}
      style={isOverlay ? undefined : { backgroundColor: '#262626' }}
    >
      <style>{`
        .client-logos-bar .clb-title {
          text-align: center;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.55);
          margin: 0 0 20px;
        }
        .client-logos-bar .clb-row {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          justify-content: center;
          gap: clamp(40px, 6vw, 80px);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .client-logos-bar .clb-row::-webkit-scrollbar { display: none; }
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
          .client-logos-bar .clb-row { gap: 36px; }
          .client-logos-bar.clb-overlay .clb-slot { min-height: ${confirmedEmpty ? '0px' : '44px'}; }
          .client-logos-bar .clb-title { font-size: 12px; margin-bottom: 14px; }
        }
      `}</style>
      <div className={isOverlay ? `w-full max-w-screen-xl mx-auto px-6 transition-[padding] duration-300 ${confirmedEmpty ? 'pb-0' : 'pb-6 sm:pb-8'}` : 'w-full max-w-screen-xl mx-auto px-6 py-5 md:py-6'}>
        <div className={isOverlay ? 'clb-slot' : undefined}>
          <div style={isOverlay ? { width: '100%' } : undefined}>
            <p className="clb-title">I tidligere samarbejde med</p>
            <div className="clb-row">
            {logos.map((logo) => (
              <a
                key={logo.id}
                href={logo.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="clb-logo-link"
                title={logo.name}
              >
                <img src={logo.logo_url} alt={logo.name} className="clb-logo-img" loading="lazy" />
              </a>
            ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClientLogosBar;
