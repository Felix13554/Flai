import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * PageSkeleton - Progressive skeleton with staggered animations
 * 
 * This skeleton:
 * 1. Matches the EXACT structure of each page
 * 2. Elements fade in progressively (not all at once)
 * 3. Zero performance impact - pure CSS, no JS overhead
 * 4. Disappears instantly when real page loads
 */

const PageSkeleton = () => {
  const location = useLocation();
  const path = location.pathname;

  // Animation delays for progressive appearance
  const delay = (index: number) => ({ animationDelay: `${index * 100}ms` });

  // Header skeleton — position: fixed to match the real NavBar exactly.
  // The real NavBar is also fixed, so this takes zero flow space and causes
  // no layout shift when Suspense swaps skeleton → real page.
  const HeaderSkeleton = () => (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 50,
      backgroundColor: '#171717',
      padding: '12px 0',
    }}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between">
          <div className="h-10 w-32 bg-neutral-800 rounded animate-pulse-slow" />
          <div className="hidden md:flex gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 w-20 bg-neutral-800 rounded animate-pulse-slow" style={delay(i)} />
            ))}
          </div>
          <div className="h-8 w-8 bg-neutral-800 rounded md:hidden animate-pulse-slow" />
        </div>
      </div>
    </div>
  );

  // Homepage Hero — must use the SAME stamped URL as HeroVideoSection so the
  // browser reuses the in-flight preload and the Suspense swap is invisible.
  // Read the stamp from localStorage (written by bustHeroCache after each upload)
  // so this skeleton never shows a stale poster on return visits.
  const _skeletonStamp = (() => { try { return localStorage.getItem('hero_poster_v') ?? '0' } catch { return '0' } })()
  const _posterBase    = `https://res.cloudinary.com/dq6jxbyrg/video/upload/c_fill,g_auto,w_1920,so_0/f_jpg/q_auto:good/herovideo.jpg`
  const POSTER_URL     = _skeletonStamp !== '0' ? `${_posterBase}?v=${_skeletonStamp}` : _posterBase
  const HomeHeroSkeleton = () => (
    <div
      className="home-hero-skeleton relative w-full overflow-hidden flex flex-col"
      style={{ backgroundColor: '#111' }}
    >
      {/* Height: 100vh (same static value HeroVideoSection uses for its own
          first paint, before its JS measurement lands and freezes the
          mobile crop). Since this skeleton is shown before any of that JS
          has run, there is nothing yet to lock to — so it intentionally
          matches HeroVideoSection's un-measured fallback rather than trying
          to predict the frozen value. The two are visually identical at
          first paint, so the Suspense swap doesn't jump. */}
      <style>{`.home-hero-skeleton { height: 100vh; }`}</style>
      {/* Same poster as HeroVideoSection — seamless handoff on Suspense swap */}
      <img
        src={POSTER_URL}
        alt=""
        aria-hidden="true"
        {...({ fetchpriority: 'high' } as any)}
        decoding="sync"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />
      
      {/* Gradient overlay — matches HeroVideoSection */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Spacer pushes content to bottom — mirrors flex-1 in HomePage */}
      <div className="flex-1" />

      {/* Hero content placeholders — matches HomePage's pb-6 + items-center.
          No button placeholders here: the hero buttons were removed and
          moved down into the bottom CTA section (see CTASkeleton). */}
      <div className="relative z-10 flex flex-col items-center pb-6">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-48 rounded animate-pulse-slow" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="h-6 w-96 max-w-full mx-auto rounded animate-pulse-slow mb-6" style={{ background: 'rgba(255,255,255,0.2)' }} />
      </div>

      {/* Reserved client-logos-bar slot — matches ClientLogosBar's overlay
          variant exactly (px-6 pb-6 sm:pb-8 wrapper, 64px/44px logo-row slot)
          so the Suspense swap to the real HomePage never shifts this content
          up or down once logos pop in. Kept invisible (no shimmer) here since
          the logos bar fades itself in — this skeleton only needs to hold
          the same amount of space. */}
      <div className="relative z-10 w-full max-w-screen-xl mx-auto px-6 pb-6 sm:pb-8">
        <style>{`
          .home-hero-skeleton-logo-slot { min-height: 64px; }
          @media (max-width: 640px) {
            .home-hero-skeleton-logo-slot { min-height: 44px; }
          }
        `}</style>
        <div className="home-hero-skeleton-logo-slot flex items-center justify-center" />
      </div>
    </div>
  );

  // Feature section - matches the two-column layout
  const FeatureSectionSkeleton = ({ reverse = false }: { reverse?: boolean }) => (
    <section className="py-20 bg-neutral-800">
      <div className="container mx-auto px-4">
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-12 items-center ${reverse ? 'md:grid-flow-col-dense' : ''}`}>
          {/* Text content */}
          <div className={`space-y-6 ${reverse ? 'md:order-2' : ''}`}>
            <div 
              className="h-9 w-64 bg-neutral-700 rounded animate-pulse-slow"
              style={delay(0)}
            />
            <div className="space-y-3">
              <div 
                className="h-4 bg-neutral-700 rounded animate-pulse-slow"
                style={delay(1)}
              />
              <div 
                className="h-4 bg-neutral-700 rounded w-11/12 animate-pulse-slow"
                style={delay(2)}
              />
              <div 
                className="h-4 bg-neutral-700 rounded w-10/12 animate-pulse-slow"
                style={delay(3)}
              />
            </div>
            {/* Feature list items */}
            <div className="space-y-4 mt-6">
              {[0, 1, 2].map((i) => (
                <div 
                  key={i}
                  className="flex items-center gap-3"
                  style={delay(4 + i)}
                >
                  <div className="h-6 w-6 bg-neutral-700 rounded-full animate-pulse-slow" />
                  <div className="h-4 flex-1 bg-neutral-700 rounded animate-pulse-slow" />
                </div>
              ))}
            </div>
          </div>
          
          {/* Image */}
          <div className={reverse ? 'md:order-1' : ''}>
            <div 
              className="h-64 md:h-80 bg-neutral-700 rounded-lg shadow-xl animate-pulse-slow"
              style={delay(reverse ? 7 : 0)}
            />
          </div>
        </div>
      </div>
    </section>
  );

  // CTA section - matches the bottom call-to-action
  const CTASkeleton = () => (
    <section className="py-20 bg-neutral-800">
      <div className="container mx-auto px-4 text-center space-y-8">
        <div 
          className="h-10 w-96 max-w-full mx-auto bg-neutral-700 rounded animate-pulse-slow"
          style={delay(0)}
        />
        <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
          <div 
            className="h-14 w-full sm:w-52 mx-auto bg-neutral-700 rounded-lg animate-pulse-slow"
            style={delay(1)}
          />
          <div 
            className="h-14 w-full sm:w-52 mx-auto bg-neutral-700 rounded-lg animate-pulse-slow"
            style={delay(2)}
          />
        </div>
      </div>
    </section>
  );

  // Products grid skeleton — matches ProductCard in a 2-col md grid
  const ProductsGridSkeleton = () => (
    <div className="container mx-auto px-4">
      {/* Filter buttons row — Alle / Optagelser / Billeder */}
      <div className="flex justify-center mb-8 space-x-4" style={delay(2)}>
        {/* Active "Alle" button */}
        <div className="h-9 w-16 rounded-full animate-pulse-slow" style={{ background: '#0F52BA' }} />
        {/* Optagelser */}
        <div className="h-9 w-32 bg-neutral-800 rounded-full animate-pulse-slow" />
        {/* Billeder */}
        <div className="h-9 w-28 bg-neutral-800 rounded-full animate-pulse-slow" />
      </div>

      {/* 2-col grid, 4 cards — matches ProductCard layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700 animate-pulse-slow"
            style={delay(3 + i)}
          >
            {/* Aspect-video thumbnail */}
            <div className="w-full aspect-video bg-neutral-700" />
            <div className="p-5 space-y-3">
              <div className="h-6 bg-neutral-700 rounded w-3/4" />
              <div className="h-4 bg-neutral-700 rounded w-full" />
              <div className="h-4 bg-neutral-700 rounded w-5/6" />
              <div className="flex items-center justify-between mt-4">
                <div className="h-6 bg-neutral-700 rounded w-24" />
                <div className="h-10 bg-neutral-700 rounded w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Portfolio grid (2 columns) — matches PortfolioCardSkeleton in the real page
  const PortfolioGridSkeleton = () => (
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700 animate-pulse-slow"
            style={delay(2 + i)}
          >
            {/* Aspect-video media area — matches w-full aspect-video */}
            <div className="w-full aspect-video bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 rounded-t-lg" />
            {/* Text block below — matches PortfolioCardSkeleton p-4 */}
            <div className="p-4 space-y-2">
              <div className="h-5 bg-neutral-700 rounded w-3/5" />
              <div className="h-3.5 bg-neutral-700 rounded w-2/5" />
              <div className="h-3.5 bg-neutral-700 rounded w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Form skeleton
  const FormSkeleton = () => (
    <div className="container mx-auto px-4 py-12 max-w-md">
      <div className="bg-neutral-800 rounded-lg p-8 space-y-6">
        <div 
          className="h-8 w-48 bg-neutral-700 rounded mx-auto animate-pulse-slow"
          style={delay(0)}
        />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} style={delay(i)}>
              <div className="h-4 w-24 bg-neutral-700 rounded mb-2 animate-pulse-slow" />
              <div className="h-10 bg-neutral-700 rounded animate-pulse-slow" />
            </div>
          ))}
        </div>
        <div 
          className="h-12 bg-neutral-700 rounded animate-pulse-slow"
          style={delay(4)}
        />
      </div>
    </div>
  );

  // Product detail skeleton
  const ProductDetailSkeleton = () => (
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div 
          className="h-96 bg-neutral-800 rounded-lg animate-pulse-slow"
          style={delay(0)}
        />
        <div className="space-y-6">
          <div 
            className="h-10 w-3/4 bg-neutral-800 rounded animate-pulse-slow"
            style={delay(1)}
          />
          <div 
            className="h-8 w-32 bg-neutral-800 rounded animate-pulse-slow"
            style={delay(2)}
          />
          <div className="space-y-2">
            <div 
              className="h-4 bg-neutral-800 rounded animate-pulse-slow"
              style={delay(3)}
            />
            <div 
              className="h-4 bg-neutral-800 rounded w-11/12 animate-pulse-slow"
              style={delay(4)}
            />
          </div>
          <div 
            className="h-12 bg-neutral-700 rounded-lg animate-pulse-slow"
            style={delay(5)}
          />
        </div>
      </div>
    </div>
  );

  // Route-specific skeleton rendering
  const renderSkeleton = () => {
    // Homepage - exact structure match
    if (path === '/') {
      return (
        <>
          <HomeHeroSkeleton />
          <FeatureSectionSkeleton />
          <CTASkeleton />
        </>
      );
    }

    // Products page — matches pt-20 pb-16 wrapper + bg-primary/10 py-12 mb-12 header
    if (path === '/products') {
      return (
        <>
          {/* Header banner — bg-primary/10 py-12 mb-12, centered title + subtitle */}
          <div style={{ background: 'rgba(15,82,186,0.1)' }} className="py-12 mb-12">
            <div className="container mx-auto px-4 text-center">
              <div
                className="h-10 w-64 bg-neutral-800 rounded mx-auto mb-4 animate-pulse-slow"
                style={delay(0)}
              />
              <div
                className="h-5 w-96 max-w-full bg-neutral-800 rounded mx-auto animate-pulse-slow"
                style={delay(1)}
              />
            </div>
          </div>
          <ProductsGridSkeleton />
        </>
      );
    }

    // Portfolio page — matches pt-20 pb-16 wrapper + bg-primary/10 py-12 mb-12 header
    if (path === '/portfolio') {
      return (
        <>
          {/* Header banner — bg-primary/10 py-12 mb-12, centered title + subtitle */}
          <div style={{ background: 'rgba(15,82,186,0.1)' }} className="py-12 mb-12">
            <div className="container mx-auto px-4 text-center">
              <div
                className="h-10 w-48 bg-neutral-800 rounded mx-auto mb-4 animate-pulse-slow"
                style={delay(0)}
              />
              <div
                className="h-5 w-80 max-w-full bg-neutral-800 rounded mx-auto animate-pulse-slow"
                style={delay(1)}
              />
            </div>
          </div>
          <PortfolioGridSkeleton />
        </>
      );
    }

    // Product detail
    if (path.startsWith('/product/')) {
      return <ProductDetailSkeleton />;
    }

    // Auth/Form pages
    if (['/auth', '/login', '/reset-password', '/update-password', '/booking'].some(p => path.startsWith(p))) {
      return <FormSkeleton />;
    }

    // Default: simple content skeleton
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="space-y-6 max-w-4xl">
          <div 
            className="h-10 w-64 bg-neutral-800 rounded animate-pulse-slow"
            style={delay(0)}
          />
          <div 
            className="h-64 bg-neutral-800 rounded-lg animate-pulse-slow"
            style={delay(1)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-neutral-900 ${
      path === '/' ? '' :
      (path === '/products' || path === '/portfolio') ? 'pt-20 pb-16' :
      'pt-16'
    }`}>
      {renderSkeleton()}
      
      {/* Custom CSS for slower, smoother pulse animation */}
      <style>{`
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default PageSkeleton;
