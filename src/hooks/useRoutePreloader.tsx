import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
/**
 * Route Preloader — STRICT MODE
 *
 * Rule: NO pages are preloaded proactively.
 * - No predictive preloading based on current route
 * - No scroll-triggered preloading
 * - No idle-callback page preloading
 *
 * The ONLY thing allowed: preload a page's JS chunk when the user
 * hovers over a link to it — because at that point the user has
 * shown explicit intent to navigate there.
 */
const ROUTE_IMPORTS: Record<string, () => Promise<any>> = {
  '/': () => import('../pages/HomePage'),
  '/products': () => import('../pages/ProductsPage'),
  '/product': () => import('../pages/ProductPage'),
  '/portfolio': () => import('../pages/PortfolioPage'),
  '/ratings': () => import('../pages/RatingsPage'),
  '/booking': () => import('../pages/BookingPage'),
  '/payment': () => import('../pages/PaymentPage'),
  '/booking-success': () => import('../pages/BookingSuccessPage'),
  '/auth': () => import('../pages/AuthPage'),
  '/login': () => import('../pages/Login'),
  '/profile': () => import('../pages/ProfilePage'),
  '/buy-credits': () => import('../pages/BuyCreditsPage'),
  '/simple-request': () => import('../pages/SimpleRequestPage'),
  '/coverage': () => import('../pages/CoverageAreasPage'),
  '/search': () => import('../pages/SearchPage'),
  '/admin': () => import('../pages/AdminPage'),
};
const preloadedRoutes = new Set<string>();
const preloadRoute = (route: string) => {
  const normalized = route.split('/').slice(0, 2).join('/') || '/';
  if (preloadedRoutes.has(normalized)) return;
  const importFn = ROUTE_IMPORTS[normalized];
  if (importFn) {
    importFn()
      .then(() => preloadedRoutes.add(normalized))
      .catch(() => {});
  }
};
export const useRoutePreloader = () => {
  const location = useLocation();
  // Only preload on hover — user has shown intent
  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      preloadRoute(href);
    };
    document.addEventListener('mouseover', handleMouseOver, { passive: true });
    return () => document.removeEventListener('mouseover', handleMouseOver);
  }, [location.pathname]);
};
export const preloadRoutes = (routes: string[]) => {
  routes.forEach(preloadRoute);
};
export default useRoutePreloader;