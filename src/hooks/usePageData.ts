import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

export type PageDataKey =
  | 'products'
  | 'homeSections'
  | 'portfolio'
  | 'bookings'
  | 'discountCodes'
  | 'newsletters'
  | 'newsletterSubscribers'
  | 'newsletterTemplates'
  | 'addressZones';

export function usePageData(keys: PageDataKey[]) {
  const {
    refreshProducts,
    refreshHomeSections,
    refreshPortfolio,
    refreshBookings,
    refreshDiscountCodes,
    refreshNewsletters,
    refreshNewsletterSubscribers,
    refreshNewsletterTemplates,
    refreshAddressZones,
  } = useData();
  const { user } = useAuth();
  const hasFetched = useRef(false);

  useEffect(() => {
    return () => {
      hasFetched.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fetchers: Record<PageDataKey, () => Promise<void>> = {
      products:              refreshProducts,
      homeSections:          refreshHomeSections,
      portfolio:             refreshPortfolio,
      bookings:              refreshBookings,
      discountCodes:         refreshDiscountCodes,
      newsletters:           refreshNewsletters,
      newsletterSubscribers: refreshNewsletterSubscribers,
      newsletterTemplates:   refreshNewsletterTemplates,
      addressZones:          refreshAddressZones,
    };

    keys.forEach(key => {
      fetchers[key]?.().catch(err =>
        console.error(`usePageData: error fetching "${key}":`, err)
      );
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}