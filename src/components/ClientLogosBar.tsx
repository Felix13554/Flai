import React from 'react';
import { useData } from '../contexts/DataContext';

// ─── ClientLogosBar ────────────────────────────────────────────────────────
// Stripe-style row of customer logos. All logos are scaled to the same
// height (so width — and therefore how many fit per row — is driven purely
// by each logo's own aspect ratio). When there isn't enough logos to fill
// the row it stays centered, leaving empty space on the left/right instead
// of stretching. On hover, every other logo turns grayscale while the
// hovered logo keeps its original color — no opacity/fade animation.
const ClientLogosBar: React.FC = () => {
  const { clientLogos, isClientLogosLoaded } = useData();

  // Nothing to show yet (and nothing configured) — render nothing rather
  // than an empty bar.
  if (isClientLogosLoaded && clientLogos.length === 0) return null;

  const logos = [...clientLogos].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <section className="client-logos-bar" style={{ backgroundColor: '#262626' }}>
      <style>{`
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
          filter: grayscale(0);
          transition: filter 0.25s ease;
        }
        /* When the row is being hovered, every logo turns grayscale... */
        .client-logos-bar .clb-row:hover .clb-logo-img {
          filter: grayscale(1);
        }
        /* ...except the one actually being hovered, which returns to full color. */
        .client-logos-bar .clb-logo-link:hover .clb-logo-img {
          filter: grayscale(0);
        }
        @media (max-width: 640px) {
          .client-logos-bar .clb-logo-link { height: 44px; }
          .client-logos-bar .clb-row { gap: 36px; }
        }
      `}</style>
      <div className="w-full max-w-screen-xl mx-auto px-6 py-10 md:py-12">
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
    </section>
  );
};

export default ClientLogosBar;
