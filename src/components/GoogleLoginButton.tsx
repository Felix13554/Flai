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

  // ── Full-page redirect flow (used on all devices) ──────────────────────────
  const handleGoogleLogin = async () => {
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
          console.warn('[Google Login] PKCE error, cleaning storage and reloading');
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
