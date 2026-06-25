import EditableContent from './EditableContent';
import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';
import { isPKCEError, safeCleanupAuthStorage } from '../utils/authCleanup';

interface GoogleLoginButtonProps {
  buttonText?: string;
  redirectTo?: string;
  bookingState?: {
    productId?: string;
    selectedTimeSlot?: any;
    address?: string;
    includeEditing?: boolean;
    totalPrice?: number;
    customerAddress?: string;
    wantsEditing?: boolean;
    paymentMethod?: string;
  };
  compact?: boolean;
  className?: string;
}

// Detect mobile devices — they don't support the popup OAuth flow reliably
const isMobile = () =>
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  );

// ── PKCE verifier cookie helpers ──────────────────────────────────────────────
// The PKCE code_verifier is written to localStorage by Supabase during
// signInWithOAuth. In the popup flow the callback runs in a *different*
// window, so it cannot read the parent's localStorage. Copying the verifier
// into a same-site cookie (readable by all windows on the same origin) fixes
// the "PKCE code verifier not found" error.

const VERIFIER_COOKIE = 'sb-pkce-verifier';

/**
 * After Supabase writes the verifier to localStorage, find it and mirror it
 * into a session cookie so the callback window can read it.
 */
const copyVerifierToCookie = () => {
  // Supabase stores the verifier under a key like:
  //   sb-<project-ref>-auth-code-verifier   (older SDKs)
  // or inside the JSON blob at:
  //   sb-<project-ref>-auth-token-code-verifier  (newer SDKs)
  // We scan all localStorage keys to be SDK-version agnostic.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.includes('code-verifier') || key.includes('code_verifier')) {
      const value = localStorage.getItem(key);
      if (value) {
        // SameSite=Lax is sufficient — the callback is same-origin.
        document.cookie = `${VERIFIER_COOKIE}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
        return;
      }
    }
  }
};

/**
 * Read the verifier cookie (called from the callback window / page).
 * Returns null if not found.
 */
export const readVerifierFromCookie = (): string | null => {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${VERIFIER_COOKIE}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
};

/**
 * Delete the verifier cookie once it has been consumed.
 */
export const clearVerifierCookie = () => {
  document.cookie = `${VERIFIER_COOKIE}=; path=/; max-age=0`;
};

/**
 * Restore the verifier from the cookie back into localStorage so Supabase's
 * exchangeCodeForSession can find it. Call this at the TOP of your
 * /auth/callback page/component, before calling exchangeCodeForSession.
 *
 * Usage in your AuthCallback component:
 *
 *   import { restoreVerifierFromCookie } from '../components/GoogleLoginButton';
 *
 *   // at the very start of the callback handler:
 *   restoreVerifierFromCookie();
 *   const { data, error } = await supabase.auth.exchangeCodeForSession(code);
 */
export const restoreVerifierFromCookie = () => {
  const verifier = readVerifierFromCookie();
  if (!verifier) return;

  // Mirror into every plausible key pattern Supabase might look for.
  // The SDK resolves the storage key from the project URL, so we match
  // whatever key is already present in localStorage (or write both patterns).
  let wrote = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.includes('code-verifier') || key.includes('code_verifier')) {
      localStorage.setItem(key, verifier);
      wrote = true;
    }
  }

  // If localStorage was empty (fresh popup callback window), derive the key
  // from the Supabase URL env var — works for CRA / Vite / Next public envs.
  if (!wrote) {
    const supabaseUrl =
      (typeof process !== 'undefined' && (process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
      '';
    if (supabaseUrl) {
      try {
        const ref = new URL(supabaseUrl).hostname.split('.')[0];
        localStorage.setItem(`sb-${ref}-auth-code-verifier`, verifier);
      } catch {
        // Best-effort — exchangeCodeForSession will surface a clear error if
        // the key still can't be found.
      }
    }
  }

  clearVerifierCookie();
};

// ─────────────────────────────────────────────────────────────────────────────

const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({
  buttonText = 'Log ind med Google',
  redirectTo,
  bookingState,
  compact = false,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);

  // ── Persist pre-auth state so it survives the OAuth round-trip ─────────────
  const persistState = () => {
    if (bookingState) {
      if (bookingState.customerAddress || bookingState.paymentMethod) {
        sessionStorage.setItem('smartBookingState', JSON.stringify(bookingState));
      } else {
        sessionStorage.setItem('bookingState', JSON.stringify(bookingState));
      }
    }

    let postAuthPath = '/';
    if (redirectTo) {
      try {
        const url = new URL(redirectTo);
        postAuthPath = url.pathname + url.search;
      } catch {
        postAuthPath = redirectTo;
      }
    }
    if (postAuthPath && postAuthPath !== '/') {
      sessionStorage.setItem('postAuthRedirect', postAuthPath);
    }
  };

  // ── Mobile: full-page redirect flow ────────────────────────────────────────
  const handleRedirectFlow = async () => {
    try {
      setLoading(true);
      persistState();

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        if (isPKCEError(error)) {
          console.warn('[Google Login Redirect] PKCE error, cleaning storage and reloading');
          safeCleanupAuthStorage('google-redirect-pkce-error');
          toast.error('Autentifikationsfejl. Siden genindlæses...');
          
          // Reload page to get fresh state
          setTimeout(() => window.location.reload(), 1500);
        } else {
          throw error;
        }
      }
      // Page navigates away — keep loading=true so button stays disabled
    } catch (error: any) {
      console.error('Error logging in with Google:', error);
      toast.error('Kunne ikke logge ind med Google. Prøv venligst igen.');
      setLoading(false);
    }
  };

  // ── Desktop: popup flow ─────────────────────────────────────────────────────
  const handlePopupFlow = async () => {
    try {
      setLoading(true);

      const width = 500;
      const height = 620;
      const left = window.screenX + Math.round((window.outerWidth - width) / 2);
      const top  = window.screenY + Math.round((window.outerHeight - height) / 2);

      const popup = window.open(
        'about:blank',
        'google-oauth',
        `width=${width},height=${height},left=${left},top=${top},` +
          `toolbar=no,menubar=no,scrollbars=yes,resizable=yes,status=no`
      );

      // Popup blocked → fall back to redirect flow
      if (!popup) return handleRedirectFlow();

      popup.document.write(`
        <html><head><title>Logger ind…</title>
        <style>
          body { margin:0; display:flex; align-items:center; justify-content:center;
                 height:100vh; background:#171717; font-family:sans-serif; }
          p { color:#9ca3af; font-size:14px; }
        </style></head>
        <body><p>Logger ind med Google…</p></body></html>
      `);

      persistState();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error || !data?.url) {
        popup.close();
        
        if (error && isPKCEError(error)) {
          console.warn('[Google Login Popup] PKCE error, cleaning storage');
          safeCleanupAuthStorage('google-popup-pkce-error');
          toast.error('Autentifikationsfejl. Prøv igen om et øjeblik.');
          setLoading(false);
          return;
        }
        
        throw error ?? new Error('No OAuth URL returned');
      }

      // ⚡ Key fix: Supabase has now written the PKCE verifier to localStorage.
      // Copy it to a cookie so the popup's callback window can restore it.
      copyVerifierToCookie();

      // Write a marker into the popup's sessionStorage so AuthCallback can
      // detect it's running inside a popup. This is more reliable than
      // checking window.opener, which COOP severs on many hosts.
      try {
        popup.sessionStorage.setItem('sb-oauth-popup-open', '1');
      } catch {
        // Cross-origin: the popup is on about:blank still and the write
        // should succeed; if it throws for any reason we fall through
        // gracefully — the poll-based fallback will still close the popup.
      }

      popup.location.href = data.url;

      let settled = false;

      const onSuccess = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try { popup.close(); } catch { /* COOP may block */ }
        setLoading(false);
        toast.success('Velkommen! 👋');

        if (redirectTo) {
          try {
            new URL(redirectTo);
            window.location.href = redirectTo;
          } catch {
            window.location.pathname = redirectTo;
          }
        }
      };

      const onCancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        setLoading(false);
        // Silent — user just closed the popup without completing login
      };

      const cleanup = () => {
        window.removeEventListener('storage', onStorage);
        clearInterval(pollInterval);
      };

      // Primary signal: Supabase writes sb-*-auth-token to localStorage
      // on our origin when the session is established in AuthCallback.
      const onStorage = (e: StorageEvent) => {
        if (!e.key?.includes('-auth-token')) return;
        if (!e.newValue) return; // key removed, not added
        onSuccess();
      };

      window.addEventListener('storage', onStorage);

      // Fallback poll: check session directly every 600ms.
      const pollInterval = setInterval(async () => {
        if (settled) return;

        let popupClosed = false;
        try { popupClosed = Boolean(popup.closed); } catch { /* COOP blocked */ }

        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          onSuccess();
          return;
        }

        if (popupClosed) {
          onCancel();
        }
      }, 600);

    } catch (error: any) {
      console.error('Error logging in with Google:', error);
      
      if (isPKCEError(error)) {
        safeCleanupAuthStorage('google-popup-catch-pkce-error');
        toast.error('Autentifikationsfejl. Prøv igen.');
      } else {
        toast.error('Kunne ikke logge ind med Google. Prøv venligst igen.');
      }
      
      setLoading(false);
    }
  };

  const handleGoogleLogin = () =>
    isMobile() ? handleRedirectFlow() : handlePopupFlow();

  // ── Compact variant ─────────────────────────────────────────────────────────
  if (compact) {
    return (
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        type="button"
        className={`flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-neutral-600 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        title="Udfyld med Google"
      >
        <span className="text-sm text-gray-600 whitespace-nowrap"><EditableContent contentKey="google-login-button-udfyld-med" fallback="Udfyld med" /></span>
        {loading ? (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900" />
        ) : (
          <GoogleLogo className="w-5 h-5" />
        )}
      </button>
    );
  }

  // ── Full button variant ─────────────────────────────────────────────────────
  return (
    <button
      onClick={handleGoogleLogin}
      disabled={loading}
      type="button"
      className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900" />
      ) : (
        <>
          <GoogleLogo className="w-5 h-5" />
          {buttonText}
        </>
      )}
    </button>
  );
};

// ── Google logo SVG ───────────────────────────────────────────────────────────
const GoogleLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.8055 10.2292C19.8055 9.55156 19.7501 8.86719 19.6323 8.19531H10.2002V12.0492H15.6014C15.3734 13.2911 14.6571 14.3898 13.6179 15.0875V17.5867H16.8294C18.7172 15.8449 19.8055 13.2729 19.8055 10.2292Z" fill="#4285F4" />
    <path d="M10.2002 20.0008C12.9515 20.0008 15.2664 19.1152 16.8294 17.5867L13.6179 15.0875C12.7368 15.6977 11.6007 16.0437 10.2002 16.0437C7.54788 16.0437 5.30085 14.2828 4.52314 11.9102H1.22559V14.4821C2.81488 17.6437 6.33844 20.0008 10.2002 20.0008Z" fill="#34A853" />
    <path d="M4.52314 11.9102C4.05271 10.6683 4.05271 9.33309 4.52314 8.09121V5.51934H1.22559C-0.408529 8.77684 -0.408529 12.2246 1.22559 15.4821L4.52314 11.9102Z" fill="#FBBC04" />
    <path d="M10.2002 3.95766C11.6761 3.93594 13.1005 4.47203 14.1824 5.45547L17.0317 2.60547C15.1765 0.904844 12.7314 -0.0234375 10.2002 0.000390625C6.33844 0.000390625 2.81488 2.35734 1.22559 5.51934L4.52314 8.09121C5.30085 5.71859 7.54788 3.95766 10.2002 3.95766Z" fill="#EA4335" />
  </svg>
);

export default GoogleLoginButton;
