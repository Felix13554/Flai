/**
 * pageContentKeys.ts — STATIC MAP VERSION
 *
 * Keys are declared statically per route so Phase 1 can fire the DB query
 * INSTANTLY on navigation — no waiting for components to mount and register.
 *
 * Global keys (NavBar, Footer) are included on every page.
 */

import { hardcodedKeyRegistry, domRegistry } from '../components/ContentManagementPanel';

// ─── Global keys present on every page ───────────────────────────────────────
const GLOBAL_KEYS = ['site-logo', 'footer-description'];

// ─── Static key map per route ─────────────────────────────────────────────────
const ROUTE_KEYS: Record<string, string[]> = {
  '/': [
    'hero-subtitle',
    'hero-button-primary','hero-button-secondary',
    'drone-section-title','drone-section-description',
    'drone-section-image',
    'drone-feature-video','drone-feature-photo','drone-feature-coverage',
    'cta-title','cta-button-primary','cta-button-secondary',
  ],
  '/products': ['services-title','services-subtitle'],
  '/product': [
    'product-page-loading-text','product-page-not-found-title','product-page-not-found-message',
    'product-page-back-to-products-button','product-page-back-button',
    'product-page-description-title','product-page-links-title','product-page-features-title',
    'product-page-video-feature-1','product-page-video-feature-2','product-page-video-feature-3',
    'product-page-photo-feature-1','product-page-photo-feature-2','product-page-photo-feature-3',
    'product-page-editing-included-title','product-page-editing-included-description',
    'product-page-editing-title','product-page-editing-description','product-page-editing-price',
    'product-page-book-note',
  ],
  '/portfolio': ['portfolio-page-title','portfolio-no-images'],
  '/ratings': ['ratings-page-title'],
  '/booking': [
    'booking-loading-text','booking-product-not-found','booking-back-to-products-button',
    'booking-page-title','booking-product-info-title','booking-personal-info-title',
    'booking-guest-info-description','booking-guest-name-label','booking-guest-email-label',
    'booking-email-description','booking-user-name-description','booking-user-name-label',
    'booking-time-selection-title','booking-address-title','booking-address-description',
    'booking-address-label','booking-extras-title','booking-editing-included-title',
    'booking-editing-included-description','booking-editing-option-title',
    'booking-editing-option-description','booking-editing-option-price',
    'booking-summary-title','booking-summary-product-label','booking-summary-date-label',
    'booking-summary-time-label','booking-summary-editing-label','booking-summary-editing-included',
    'booking-summary-editing-yes','booking-summary-editing-no','booking-summary-total-label',
    'booking-back-button','booking-processing-text','booking-continue-button',
  ],
  '/payment': [
    'payment-page-title','payment-discount-code-title',
    'credits_payment_section_title','credits_payment_available_text',
    'credits_payment_option_none','credits_payment_option_all','credits_payment_option_custom',
    'credits_payment_using_text','credits_payment_remaining_text',
    'payment-method-title','payment-credits-option-title','payment-credits-option-description',
    'payment-credits-instant','payment-card-option-title','payment-card-option-description',
    'payment-card-types','payment-invoice-option-title','payment-invoice-option-description',
    'payment-cash-option-title','payment-cash-option-description','payment-cash-types',
    'payment-processing-text','credits_payment_pay_credits_button',
    'payment-complete-booking-button','payment-cash-booking-button',
    'payment-order-summary-title','payment-summary-product-label','payment-summary-date-label',
    'payment-summary-time-label','payment-summary-address-label','payment-summary-base-price-label',
    'payment-summary-editing-label','payment-summary-discount-label','payment-summary-credits-label',
    'payment-summary-total-label','payment-terms-notice',
  ],
  '/booking-success': [],
  '/auth': ['auth-page-title','auth-page-subtitle','auth-page-footer-text'],
  '/login': ['auth-page-title','auth-page-subtitle','auth-page-footer-text'],
  '/profile': [
    'profile-page-title','credits_profile_balance_label','credits_profile_balance_subtitle',
    'credits_profile_credits_label','credits_profile_buy_button',
    'profile-bookings-tab','profile-settings-tab','profile-change-password-title',
    'profile-new-password-label','profile-confirm-password-label','profile-update-password-button',
    'profile-loading-bookings-text','profile-no-bookings-title','profile-no-bookings-message',
    'profile-book-now-button','profile-booking-upcoming-badge','profile-booking-past-badge',
    'profile-booking-id-label','profile-payment-status-paid','profile-payment-status-failed',
    'profile-payment-status-pending','profile-booking-date-label','profile-booking-time-label',
    'profile-booking-address-label','profile-booking-editing-label',
    'profile-booking-editing-yes','profile-booking-editing-no','profile-contact-us-button',
  ],
  '/buy-credits': [
    'credits_buy_page_title','credits_buy_page_subtitle','credits_profile_balance_label',
    'credits_buy_custom_amount_title','credits_buy_price_info','credits_buy_button_text',
    'credits_buy_how_it_works_title','credits_buy_step_1_title','credits_buy_step_1_description',
    'credits_buy_step_2_title','credits_buy_step_2_description',
    'credits_buy_step_3_title','credits_buy_step_3_description',
  ],
  '/coverage': [
    'coverage-page-title','coverage-page-subtitle','coverage-check-title',
    'coverage-checking-text','coverage-check-button','coverage-valid-title',
    'coverage-valid-subtitle','coverage-invalid-title','coverage-cities-title',
    'coverage-zones-title','coverage-no-zones',
  ],
  '/simple-request': [
    'simple-loading-text','simple-product-label','simple-product-name',
    'simple-product-selection-title','simple-personal-info-title',
    'simple-name-label','simple-email-label','simple-address-label',
    'simple-editing-title','simple-editing-option-title','simple-editing-description',
    'simple-editing-price','simple-payment-method-title','simple-payment-now-title',
    'simple-payment-now-description','simple-payment-invoice-title','simple-payment-invoice-description',
    'simple-payment-onsite-title','simple-payment-onsite-description',
    'simple-total-label','simple-cancel-button','simple-submitting-button',
    'simple-submit-button','simple-payment-section-title','simple-payment-section-description',
  ],
  '/search': [
    'search-page-title','search-results-for','search-results-count','search-loading-text',
    'search-no-query-title','search-no-query-description','search-no-results-title',
    'search-no-results-description','search-browse-products-button',
    'search-products-section-title','search-portfolio-section-title',
    'search-pages-section-title','search-content-section-title',
  ],
  '/contact': [
    'contact-page-title','contact-page-subtitle','contact-info-title',
    'contact-email-label','contact-email','contact-email-note',
    'contact-phone-label','contact-phone','contact-hours',
    'contact-location-label','contact-location',
    'newsletter-subscribe-title','newsletter-subscribe-description',
    'newsletter-email-label','newsletter-subscribe-button','newsletter-privacy-note',
    'faq-title','faq-booking-question','faq-booking-answer',
    'faq-weather-question','faq-weather-answer','faq-delivery-question','faq-delivery-answer',
    'faq-newsletter-question','faq-newsletter-answer',
  ],
  '/admin': [
    'admin-access-denied-title','admin-access-denied-message','admin-overview-title',
    'admin-total-bookings-label','admin-completed-bookings-label','admin-pending-bookings-label',
    'admin-total-revenue-label','admin-products-overview-title','admin-active-products-label',
    'admin-portfolio-overview-title','admin-portfolio-images-label','admin-ratings-overview-title',
    'admin-average-rating-label','admin-newsletter-overview-title','admin-newsletter-subscribers-label',
    'admin-recent-activity-title','admin-page-title',
  ],
  '/404': ['404-error-code','404-page-title','404-page-message','404-home-button'],
};

// ─── Main export: instant key resolution ─────────────────────────────────────
export function getKeysForPathname(pathname: string): string[] {
  const norm = pathname.replace(/\/$/, '') || '/';

  // Find matching route (exact first, then prefix)
  let keys: string[] = [];
  if (ROUTE_KEYS[norm]) {
    keys = ROUTE_KEYS[norm];
  } else {
    // Try prefix match (e.g. /product/123 → /product)
    const prefix = '/' + norm.split('/')[1];
    keys = ROUTE_KEYS[prefix] ?? [];
  }

  return [...new Set([...GLOBAL_KEYS, ...keys])];
}

// ─── DOM sorting (still used for progressive stagger render order) ────────────
function getDOMPosition(key: string): { top: number; left: number } {
  const element = domRegistry.get(key);
  const elem = element ?? document.querySelector(`[data-content-key="${key}"]`);
  if (!elem) return { top: Infinity, left: Infinity };
  const rect = elem.getBoundingClientRect();
  return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
}

export function sortKeysByDOMPosition(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = getDOMPosition(a);
    const pb = getDOMPosition(b);
    const vd = pa.top - pb.top;
    if (Math.abs(vd) > 10) return vd;
    return pa.left - pb.left;
  });
}

// ─── Legacy compat ────────────────────────────────────────────────────────────
export function getCriticalContentKeys(pathname: string): string[] {
  return getKeysForPathname(pathname);
}
export function getVisibleKeys(keys: string[]): string[] { return keys; }
export function prioritizeKeys(keys: string[]) {
  return { critical: keys, high: [] as string[], normal: [] as string[] };
}