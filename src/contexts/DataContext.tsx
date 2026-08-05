import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { unknownKeysMap } from '../content/unknown-keys';

// ─── Shop types (exported for use in merch/admin components) ──────────────────
export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  images?: string[];
  category?: string;
  sizes?: string[];
  colors?: string[];
  stock?: number;
  active: boolean;
}

export interface CartItem {
  product: ShopProduct;
  quantity: number;
  size?: string;
  color?: string;
}


import {
  Product,
  AddressZone,
  PortfolioImage,
  DiscountCode,
  NewsletterSubscriber,
  Newsletter,
  NewsletterTemplate,
  BookingWithProduct,
  ClientLogo,
} from '../types';
import { useAuth } from './AuthContext';
import { useLoading } from './LoadingContext';


// ─── Types ────────────────────────────────────────────────────────────────────
interface SiteContent {
  id: string;
  key: string;
  type: 'text' | 'image' | 'color';
  value: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
  /** When true, this key is excluded from "Deploy til GitHub" and stays database-only. */
  no_deploy?: boolean;
}
interface HomeSection {
  id: string;
  title: string;
  description: string;
  image_url: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface Bundle {
  id: string;
  name: string;
  created_at: string;
}

interface DataContextType {
  // Products
  products: Product[];
  // Site Content
  siteContent: Record<string, SiteContent>;
  getContent: (key: string, fallback?: string) => string;
  getContentItem: (key: string) => SiteContent | undefined;
  getContentLoadingState: (key: string) => 'idle' | 'loading' | 'loaded' | 'error';
  // Home Sections
  homeSections: HomeSection[];
  // Portfolio
  portfolioImages: PortfolioImage[];
  // Client Logos
  clientLogos: ClientLogo[];
  // Bundles
  bundles: Bundle[];
  // Address Zones
  addressZones: AddressZone[];
  // Bookings
  bookings: BookingWithProduct[];
  bookingsLoading: boolean;
  bookingsError: string | null;
  // Discount Codes
  discountCodes: DiscountCode[];
  // Newsletter
  newsletterSubscribers: NewsletterSubscriber[];
  newsletters: Newsletter[];
  newsletterTemplates: NewsletterTemplate[];
  // Loading states
  isDataLoaded: boolean;
  dataError: string | null;
  isSiteContentLoaded: boolean;
  isProductsLoaded: boolean;
  isPortfolioLoaded: boolean;
  isClientLogosLoaded: boolean;
  isHomeSectionsLoaded: boolean;
  isBookingsLoaded: boolean;
  isDiscountCodesLoaded: boolean;
  isNewslettersLoaded: boolean;
  isNewsletterSubscribersLoaded: boolean;
  isNewsletterTemplatesLoaded: boolean;
  isAddressZonesLoaded: boolean;
  // Shop / Merchandise
  shopProducts: ShopProduct[];
  isShopProductsLoaded: boolean;
  refreshShopProducts: () => Promise<void>;
  // Cart
  cart: CartItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (product: ShopProduct, size?: string, color?: string) => void;
  removeFromCart: (productId: string, size?: string, color?: string) => void;
  updateCartQuantity: (productId: string, size: string | undefined, color: string | undefined, qty: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartItemCount: number;
  // Refresh functions
  refreshProducts: () => Promise<void>;
  refreshSiteContent: () => Promise<void>;
  optimisticRemoveContent: (keys: string | string[]) => void;
  refreshHomeSections: () => Promise<void>;
  refreshPortfolio: () => Promise<void>;
  refreshClientLogos: () => Promise<void>;
  refreshBundles: () => Promise<void>;
  refreshBookings: () => Promise<void>;
  refreshDiscountCodes: () => Promise<void>;
  refreshNewsletterSubscribers: () => Promise<void>;
  refreshNewsletters: () => Promise<void>;
  refreshNewsletterTemplates: () => Promise<void>;
  refreshAddressZones: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { setLoadingProgress, setLoadingMessage } = useLoading();
  const location = useLocation();

  // ─── Data states ──────────────────────────────────────────────────────────
  const [products, setProducts]                         = useState<Product[]>([]);
  const [shopProducts, setShopProducts]                 = useState<ShopProduct[]>([]);
  const [siteContent, setSiteContent]                   = useState<Record<string, SiteContent>>({});
  const [homeSections, setHomeSections]                 = useState<HomeSection[]>([]);
  const [portfolioImages, setPortfolioImages]           = useState<PortfolioImage[]>([]);
  const [clientLogos, setClientLogos]                   = useState<ClientLogo[]>([]);
  const [bundles, setBundles]                           = useState<Bundle[]>([]);
  const [addressZones, setAddressZones]                 = useState<AddressZone[]>([]);
  const [bookings, setBookings]                         = useState<BookingWithProduct[]>([]);
  const [discountCodes, setDiscountCodes]               = useState<DiscountCode[]>([]);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [newsletters, setNewsletters]                   = useState<Newsletter[]>([]);
  const [newsletterTemplates, setNewsletterTemplates]   = useState<NewsletterTemplate[]>([]);

  // ─── Loading flags ────────────────────────────────────────────────────────
  const [isDataLoaded, setIsDataLoaded]                             = useState(false);
  const [dataError, setDataError]                                   = useState<string | null>(null);
  const [bookingsLoading, setBookingsLoading]                       = useState(false);
  const [bookingsError, setBookingsError]                           = useState<string | null>(null);
  const [isSiteContentLoaded, setIsSiteContentLoaded]               = useState(false);
  const [isProductsLoaded, setIsProductsLoaded]                     = useState(false);
  const [isPortfolioLoaded, setIsPortfolioLoaded]                   = useState(false);
  const [isClientLogosLoaded, setIsClientLogosLoaded]               = useState(false);
  const [isHomeSectionsLoaded, setIsHomeSectionsLoaded]             = useState(false);
  const [isBookingsLoaded, setIsBookingsLoaded]                     = useState(false);
  const [isDiscountCodesLoaded, setIsDiscountCodesLoaded]           = useState(false);
  const [isNewslettersLoaded, setIsNewslettersLoaded]               = useState(false);
  const [isNewsletterSubscribersLoaded, setIsNewsletterSubscribersLoaded] = useState(false);
  const [isNewsletterTemplatesLoaded, setIsNewsletterTemplatesLoaded]     = useState(false);
  const [isAddressZonesLoaded, setIsAddressZonesLoaded]             = useState(false);
  const [isShopProductsLoaded, setIsShopProductsLoaded]             = useState(false);

  // ─── Cart state ───────────────────────────────────────────────────────────
  const [cart, setCart]         = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('flai_cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem('flai_cart', JSON.stringify(cart)); } catch {}
  }, [cart]);

  // ─── Internal refs ────────────────────────────────────────────────────────
  const hasInitiallyLoaded      = useRef(false);
  const [realtimeKey, setRealtimeKey]               = useState(0);
  const subscriptionRefs        = useRef<Map<string, any>>(new Map());

  // ─── Auth-gated cache invalidation ────────────────────────────────────────
  type PageDataKey = 'products' | 'homeSections' | 'portfolio' | 'bundles'
    | 'bookings' | 'discountCodes' | 'newsletters' | 'newsletterSubscribers'
    | 'newsletterTemplates' | 'addressZones' | 'shopProducts' | 'clientLogos';

  const loadedCache = useRef<Set<PageDataKey>>(new Set());
  const prevUserId  = useRef<string | undefined>(user?.id);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getContent     = (key: string, fallback: string = '') => siteContent[key]?.value || unknownKeysMap[key] || fallback;
  const getContentItem = (key: string) => siteContent[key];
  const getContentLoadingState = (_key: string): 'idle' | 'loading' | 'loaded' | 'error' => {
    return isSiteContentLoaded ? 'loaded' : 'loading';
  };

  // ─── Cart helpers ─────────────────────────────────────────────────────────
  const addToCart = useCallback((product: ShopProduct, size?: string, color?: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.size === size && i.color === color);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id && i.size === size && i.color === color
            ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1, size, color }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string, size?: string, color?: string) => {
    setCart(prev => prev.filter(i => !(i.product.id === productId && i.size === size && i.color === color)));
  }, []);

  const updateCartQuantity = useCallback((productId: string, size: string | undefined, color: string | undefined, qty: number) => {
    if (qty <= 0) { removeFromCart(productId, size, color); return; }
    setCart(prev => prev.map(i =>
      i.product.id === productId && i.size === size && i.color === color ? { ...i, quantity: qty } : i
    ));
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
    try { localStorage.removeItem('flai_cart'); } catch {}
  }, []);

  const cartTotal     = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const cartItemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  /**
   * SINGLE-SHOT CONTENT LOAD
   * Fetches all site_content rows in one query. No phases, no debouncing,
   * no sequential round-trips. Fastest possible approach — one DB call,
   * everything lands in state at once, isSiteContentLoaded flips true.
   * Subsequent calls are no-ops because allContentLoaded guards them.
   */
  const allContentLoaded = useRef(false);

  const fetchAllContent = useCallback(async () => {
    // Already have everything — instant return, no DB call.
    if (allContentLoaded.current) {
      setIsSiteContentLoaded(true);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('*')
        .order('key');
      if (error) throw error;
      setSiteContent(prev => {
        const next = { ...prev };
        (data || []).forEach(item => { next[item.key] = item; });
        return next;
      });
      allContentLoaded.current = true;
      setIsSiteContentLoaded(true);
    } catch (err) {
      console.error('DataContext: fetchAllContent error:', err);
      setIsSiteContentLoaded(true); // unblock UI on error
    }
  }, []);

  // ─── Full refresh (for realtime updates & after admin edits) ─────────────
  const refreshSiteContent = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('*')
        .order('key');
      if (error) throw error;
      setSiteContent(prev => {
        const next = { ...prev };
        (data || []).forEach(item => { next[item.key] = item; });
        return next;
      });
      allContentLoaded.current = true;
    } catch (err) {
      console.error('Error refreshing site content:', err);
    }
  }, []);

  // ─── Optimistic local remove (instant UI update before DB confirms) ───────
  const optimisticRemoveContent = useCallback((keys: string | string[]) => {
    const toRemove = new Set(Array.isArray(keys) ? keys : [keys]);
    setSiteContent(prev => {
      const next = { ...prev };
      toRemove.forEach(k => delete next[k]);
      return next;
    });
  }, []);
  const refreshProducts = useCallback(async () => {
    try {
      setLoadingMessage('Henter produkter...');
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('array', { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error fetching products:', err);
    } finally {
      // Always unblock the UI, even on error, so the skeleton doesn't spin forever.
      setIsProductsLoaded(true);
    }
  }, [setLoadingMessage]);

  const refreshHomeSections = useCallback(async () => {
    try {
      setLoadingMessage('Henter sektioner...');
      const { data, error } = await supabase
        .from('home_sections')
        .select('*')
        .eq('is_active', true)
        .order('order_index');
      if (error) throw error;
      setHomeSections(data || []);
    } catch (err: any) {
      console.error('Error fetching home sections:', err);
    } finally {
      setIsHomeSectionsLoaded(true);
    }
  }, [setLoadingMessage]);

  const refreshPortfolio = useCallback(async () => {
    try {
      setLoadingMessage('Henter portfolio...');
      const { data, error } = await supabase
        .from('portfolio_images')
        .select(`
          *,
          portfolio_bundles (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPortfolioImages(data || []);
    } catch (err: any) {
      console.error('Error fetching portfolio:', err);
    } finally {
      // Always unblock the UI, even on error, so the skeleton doesn't spin forever.
      setIsPortfolioLoaded(true);
    }
  }, [setLoadingMessage]);

  const refreshClientLogos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('client_logos')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setClientLogos(data || []);
    } catch (err: any) {
      console.error('Error fetching client logos:', err);
    } finally {
      setIsClientLogosLoaded(true);
    }
  }, []);

  const refreshBundles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('portfolio_bundles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBundles(data || []);
    } catch (err: any) {
      console.error('Error fetching bundles:', err);
    }
  }, []);

  const refreshBookings = useCallback(async () => {
    if (!user || !isAdmin) {
      setBookings([]);
      setIsBookingsLoaded(true);
      return;
    }
    try {
      setBookingsLoading(true);
      setLoadingMessage('Henter bookinger...');
      const { data, error } = await supabase
             .from('bookings_with_users')   // ← change this line
        .select(`
          *,
          products (
            id,
            name,
            price,
            description
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBookings(data || []);
      setBookingsError(null);
    } catch (err: any) {
      console.error('Error fetching bookings:', err);
      setBookingsError(err.message);
    } finally {
      setIsBookingsLoaded(true);
      setBookingsLoading(false);
    }
  }, [user, isAdmin, setLoadingMessage]);

  const refreshDiscountCodes = useCallback(async () => {
    if (!isAdmin) {
      setIsDiscountCodesLoaded(true);
      return;
    }
    try {
      setLoadingMessage('Henter rabatkoder...');
      const { data, error } = await supabase
        .from('discount_codes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDiscountCodes(data || []);
    } catch (err: any) {
      console.error('Error fetching discount codes:', err);
    } finally {
      setIsDiscountCodesLoaded(true);
    }
  }, [isAdmin, setLoadingMessage]);

  const refreshNewsletters = useCallback(async () => {
    if (!isAdmin) {
      setIsNewslettersLoaded(true);
      return;
    }
    try {
      setLoadingMessage('Henter nyhedsbreve...');
      const { data, error } = await supabase
        .from('newsletters')
        .select('*')
        .order('sent_at', { ascending: false });
      if (error) throw error;
      setNewsletters(data || []);
    } catch (err: any) {
      console.error('Error fetching newsletters:', err);
    } finally {
      setIsNewslettersLoaded(true);
    }
  }, [isAdmin, setLoadingMessage]);

  const refreshNewsletterSubscribers = useCallback(async () => {
    if (!isAdmin) {
      setIsNewsletterSubscribersLoaded(true);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNewsletterSubscribers(data || []);
    } catch (err: any) {
      console.error('Error fetching newsletter subscribers:', err);
    } finally {
      setIsNewsletterSubscribersLoaded(true);
    }
  }, [isAdmin]);

  const refreshNewsletterTemplates = useCallback(async () => {
    if (!isAdmin) {
      setIsNewsletterTemplatesLoaded(true);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('newsletter_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNewsletterTemplates(data || []);
    } catch (err: any) {
      console.error('Error fetching newsletter templates:', err);
    } finally {
      setIsNewsletterTemplatesLoaded(true);
    }
  }, [isAdmin]);

  const refreshAddressZones = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('address_zones')
        .select('*')
        .order('name');
      if (error) throw error;
      setAddressZones(data || []);
    } catch (err: any) {
      console.error('Error fetching address zones:', err);
    } finally {
      setIsAddressZonesLoaded(true);
    }
  }, []);

  const refreshShopProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('shop_products')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setShopProducts(data || []);
      setIsShopProductsLoaded(true);
    } catch (err: any) {
      console.error('Error fetching shop products:', err);
      setIsShopProductsLoaded(true); // unblock UI on error
    }
  }, []);

  // ─── Initial load ─────────────────────────────────────────────────────────
  // Fire immediately on mount — do NOT wait for auth.
  // Page content (site_content) is public and needs no auth.
  // Admin-gated data fetches handle their own auth checks.
  useEffect(() => {
    if (hasInitiallyLoaded.current) return;
    hasInitiallyLoaded.current = true;

    // Fire single content load immediately — no phases
    fetchAllContent();

    setLoadingProgress(100);
    setLoadingMessage('Klar!');
    setIsDataLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Route change: fetch new page content ─────────────────────────────────
  // Only fires on actual navigation — initial load is handled in initializeApp.
  // fetchAllContent() internally guards with allContentLoaded.current, which
  // is busted on tab-visibility / network recovery — so after a reconnect this
  // will always do a real DB call, preventing blank pages post-reconnect.
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (!isDataLoaded) return;
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    fetchAllContent();
  }, [location.pathname, isDataLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auth-gated cache invalidation ────────────────────────────────────────
  useEffect(() => {
    if (user?.id !== prevUserId.current) {
      loadedCache.current.clear();
      prevUserId.current = user?.id;
      console.log('DataContext: user changed — invalidated auth-gated cache');
    }
  }, [user?.id]);

  // ─── Auto-fetch page data on route change ─────────────────────────────────
  // Also re-runs when isAdmin changes so admin-gated data is fetched after auth resolves.
  const { isAdmin: isAdminForEffect } = useAuth();
  useEffect(() => {
    if (!isDataLoaded) return;

    const path = location.pathname.replace(/\/$/, '') || '/';

    const getDataKeysForPath = (p: string): PageDataKey[] => {
      if (p === '/')                       return ['homeSections', 'clientLogos'];
      if (p === '/products')               return ['products'];
      if (p.startsWith('/products/'))      return ['products'];
      if (p.startsWith('/product/'))       return ['products'];
      if (p === '/portfolio')              return ['portfolio', 'bundles'];
      if (p === '/ratings')                return [];
      if (p === '/search')                 return ['products'];
      if (p.startsWith('/booking/'))       return ['products'];
      if (p.startsWith('/payment/'))       return ['bookings'];
      if (p === '/profile')                return ['bookings', 'discountCodes'];
      if (p === '/buy-credits')            return ['discountCodes'];
      if (p === '/coverage')               return ['addressZones'];
      if (p === '/merch')                  return ['shopProducts'];
      if (p.startsWith('/simple-request')) return ['products'];
      if (p === '/admin')                  return [
        'products', 'portfolio', 'bundles', 'bookings',
        'newsletters', 'newsletterSubscribers', 'newsletterTemplates',
        'discountCodes', 'addressZones', 'shopProducts', 'clientLogos',
      ];
      return [];
    };

    const fetchers: Record<PageDataKey, () => Promise<void>> = {
      products:              refreshProducts,
      homeSections:          refreshHomeSections,
      portfolio:             refreshPortfolio,
      bundles:               refreshBundles,
      bookings:              refreshBookings,
      discountCodes:         refreshDiscountCodes,
      newsletters:           refreshNewsletters,
      newsletterSubscribers: refreshNewsletterSubscribers,
      newsletterTemplates:   refreshNewsletterTemplates,
      addressZones:          refreshAddressZones,
      shopProducts:          refreshShopProducts,
      clientLogos:           refreshClientLogos,
    };

    const ADMIN_GATED_KEYS = new Set<PageDataKey>(['bookings', 'discountCodes', 'newsletters', 'newsletterSubscribers', 'newsletterTemplates']);

    const allKeys      = getDataKeysForPath(path);
    // For admin-gated keys, skip the cache when isAdmin is false — they must be re-fetched once auth resolves.
    const keysToFetch  = allKeys.filter(key => {
      if (loadedCache.current.has(key)) {
        // If it's admin-gated and isAdmin just became true, force re-fetch by removing from cache
        if (ADMIN_GATED_KEYS.has(key) && isAdminForEffect && !loadedCache.current.has(key as any)) return true;
        return false;
      }
      return true;
    });
    const cachedKeys   = allKeys.filter(key =>  loadedCache.current.has(key));

    if (cachedKeys.length > 0) {
      console.log(`DataContext: route "${path}" → cache hit for`, cachedKeys);
    }
    if (keysToFetch.length === 0) {
      console.log(`DataContext: route "${path}" → all page data cached`);
      return;
    }

    console.log(`DataContext: route "${path}" → fetching`, keysToFetch);
    keysToFetch.forEach(key => {
      // Only add admin-gated keys to cache when we're actually admin
      if (!ADMIN_GATED_KEYS.has(key) || isAdminForEffect) {
        loadedCache.current.add(key);
      }
      fetchers[key]?.().catch(err => {
        loadedCache.current.delete(key);
        console.error(`DataContext: auto-fetch error for "${key}":`, err);
      });
    });
  }, [location.pathname, isDataLoaded, isAdminForEffect, refreshProducts, refreshHomeSections, refreshPortfolio, refreshBundles,  refreshBookings, refreshDiscountCodes, refreshNewsletters, refreshNewsletterSubscribers, refreshNewsletterTemplates, refreshAddressZones, refreshShopProducts, refreshClientLogos]);

  // ─── Tab-visibility → reconnect realtime + bust caches on reconnect ────────
  // When the browser kills the WS (tab hidden, throttled, or network cut),
  // allContentLoaded and loadedCache still report "all good" — so the next
  // route-change fetch is silently skipped and the page goes black.
  // Fix: on every visible-event we bust both caches so the next navigation
  // (or an immediate inline refresh) always re-fetches from Supabase.
  useEffect(() => {
    const invalidateCaches = () => {
      allContentLoaded.current = false;
      loadedCache.current.clear();
      console.log('DataContext: caches invalidated after connection recovery');
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        // Attempt to refresh the auth session — this also probes whether the
        // Supabase connection is alive.
        await supabase.auth.refreshSession();
      } catch (err) {
        console.warn('DataContext: session refresh on tab focus failed:', err);
        // Even on failure, fall through — we still want to invalidate caches
        // and re-fetch so the page doesn't stay black.
      }
      // Always invalidate caches and reconnect realtime when tab becomes
      // visible again, regardless of whether the session refresh succeeded.
      invalidateCaches();
      setRealtimeKey(prev => prev + 1);
      // Re-fetch site content immediately so the current page isn't blank.
      fetchAllContent();
    };

    // Also recover when the device comes back online after a network cut.
    const handleOnline = () => {
      console.log('DataContext: network came back online — invalidating caches');
      invalidateCaches();
      setRealtimeKey(prev => prev + 1);
      fetchAllContent();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchAllContent]);

  // ─── Realtime subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (!isDataLoaded) return;

    const setupSubscription = (channelName: string, tableName: string, callback: () => void) => {
      try {
        const channel = supabase
          .channel(channelName)
          .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
            console.log(`DataContext: ${channelName} – change detected`);
            callback();
          })
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn(`DataContext: ${channelName} subscription issue: ${status}`);
            }
          });
        subscriptionRefs.current.set(channelName, channel);
        return channel;
      } catch (err) {
        console.error(`DataContext: Error setting up ${channelName}:`, err);
        return null;
      }
    };

    const subscriptions = [
      setupSubscription('products_changes',      'products',          refreshProducts),
      setupSubscription('site_content_changes',  'site_content',      refreshSiteContent),
      setupSubscription('home_sections_changes', 'home_sections',     refreshHomeSections),
      setupSubscription('portfolio_changes',     'portfolio_images',  refreshPortfolio),
      setupSubscription('client_logos_changes',  'client_logos',      refreshClientLogos),
      setupSubscription('bundles_changes',       'portfolio_bundles', refreshBundles),
      setupSubscription('bookings_changes',      'bookings',          refreshBookings),
      setupSubscription('newsletter_changes',    'newsletters',       refreshNewsletters),
      setupSubscription('address_zones_changes', 'address_zones',     refreshAddressZones),
    ].filter(Boolean);

    if (isAdmin) {
      subscriptions.push(
        setupSubscription('newsletter_subscribers_changes', 'newsletter_subscribers', refreshNewsletterSubscribers),
        setupSubscription('newsletter_templates_changes',   'newsletter_templates',   refreshNewsletterTemplates),
      );
    }

    return () => {
      subscriptions.forEach(sub => { if (sub) { try { supabase.removeChannel(sub); } catch {} } });
      subscriptionRefs.current.forEach(channel => { try { supabase.removeChannel(channel); } catch {} });
      subscriptionRefs.current.clear();
    };
  }, [isDataLoaded, isAdmin, realtimeKey, refreshProducts, refreshSiteContent, refreshHomeSections, refreshPortfolio, refreshBundles, refreshBookings,  refreshNewsletters, refreshNewsletterSubscribers, refreshNewsletterTemplates, refreshAddressZones, refreshClientLogos]);

  useEffect(() => {
    if (!user || !isDataLoaded) return;
    setRealtimeKey(prev => prev + 1);
  }, [user?.id, isDataLoaded]);

  // ─── Context value ─────────────────────────────────────────────────────────
  const value: DataContextType = {
    products,
    shopProducts,
    isShopProductsLoaded,
    refreshShopProducts,
    cart,
    cartOpen,
    setCartOpen,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    cartTotal,
    cartItemCount,
    siteContent,
    getContent,
    getContentItem,
    getContentLoadingState,
    homeSections,
    portfolioImages,
    clientLogos,
    bundles,
    addressZones,
    bookings,
    bookingsLoading,
    bookingsError,
    discountCodes,
    newsletterSubscribers,
    newsletters,
    newsletterTemplates,
    isDataLoaded,
    dataError,
    isSiteContentLoaded,
    isProductsLoaded,
    isPortfolioLoaded,
    isClientLogosLoaded,
    isHomeSectionsLoaded,
    isBookingsLoaded,
    isDiscountCodesLoaded,
    isNewslettersLoaded,
    isNewsletterSubscribersLoaded,
    isNewsletterTemplatesLoaded,
    isAddressZonesLoaded,
    refreshProducts,
    refreshSiteContent,
    optimisticRemoveContent,
    refreshHomeSections,
    refreshPortfolio,
    refreshClientLogos,
    refreshBundles,
    refreshBookings,
    refreshDiscountCodes,
    refreshNewsletterSubscribers,
    refreshNewsletters,
    refreshNewsletterTemplates,
    refreshAddressZones,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
