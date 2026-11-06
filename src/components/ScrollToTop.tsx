import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop: React.FC = () => {
  const { pathname, state } = useLocation();

  useEffect(() => {
    // Hero-knappen sender os til et bestemt projekt på Projekter-siden —
    // PortfolioPage scroller selv derhen, så vi må ikke nulstille til toppen.
    if ((state as { scrollToProject?: string } | null)?.scrollToProject) return;
    // /portfolio/<projektnavn>: PortfolioPage scroller selv til projektet og
    // nulstiller derefter URL'en til /portfolio. Den nulstilling (replace med
    // keepScroll) må heller ikke sende os tilbage til toppen.
    if (pathname.startsWith('/portfolio/')) return;
    if ((state as { keepScroll?: boolean } | null)?.keepScroll) return;
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
};

export default ScrollToTop;