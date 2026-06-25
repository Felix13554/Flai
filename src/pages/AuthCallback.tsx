import EditableContent from '../components/EditableContent';
import { useEffect } from 'react';
import { restoreVerifierFromCookie } from '../components/GoogleLoginButton';
import { supabase } from '../utils/supabase';

/**
 * AuthCallback — the OAuth redirect landing page.
 *
 * Desktop (popup) flow:
 *   Google → AuthCallback (in popup) → exchangeCodeForSession writes session
 *   to localStorage → storage event fires in parent tab → parent detects
 *   session, shows toast, navigates. We close the popup.
 *
 * Mobile (redirect) flow:
 *   Google → AuthCallback (main tab) → exchangeCodeForSession → navigate to
 *   postAuthRedirect (or '/').
 *
 * Popup detection: we write a marker key 'sb-oauth-popup-open' in the popup
 * window via GoogleLoginButton before navigating it to the OAuth URL. Here we
 * check sessionStorage for that marker — it's the most reliable signal because
 * window.opener is severed by COOP on many hosts.
 */
export default function AuthCallback() {
  useEffect(() => {
    const handle = async () => {
      try {
        // Restore the PKCE verifier from the cookie the parent wrote,
        // so exchangeCodeForSession can find it in localStorage.
        restoreVerifierFromCookie();

        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.search
        );

        // Popup detection — most reliable signal not affected by COOP.
        // GoogleLoginButton sets this in the popup's sessionStorage before
        // navigating it to the OAuth URL.
        const isPopup = sessionStorage.getItem('sb-oauth-popup-open') === '1';

        if (isPopup) {
          // ── Popup path ─────────────────────────────────────────────────────
          // Session is now written to localStorage. The parent tab's 'storage'
          // event listener in GoogleLoginButton will fire and handle the toast
          // + redirect. We just close ourselves.
          // The small delay ensures the localStorage write propagates before
          // the window disappears, and gives the storage event time to fire.
          sessionStorage.removeItem('sb-oauth-popup-open');
          setTimeout(() => {
            try { window.close(); } catch { /* COOP may block */ }
            // Belt-and-suspenders: if window.close() was blocked,
            // show a "you may close this window" message.
            // The parent poll will still detect the session.
          }, 300);
          return;
        }

        // ── Mobile / redirect fallback path ────────────────────────────────
        if (!error) {
          const redirect = sessionStorage.getItem('postAuthRedirect') || '/';
          sessionStorage.removeItem('postAuthRedirect');
          sessionStorage.setItem('showWelcomeToast', '1');
          window.location.replace(redirect);
        } else {
          sessionStorage.setItem('showAuthErrorToast', error.message);
          window.location.replace('/login');
        }
      } catch (err: any) {
        console.error('AuthCallback error:', err);
        try { window.close(); } catch { /* noop */ }
        window.location.replace('/');
      }
    };

    handle();
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#171717',
        gap: '14px',
      }}
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}
      >
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="18" cy="18" r="15" stroke="#3f3f3f" strokeWidth="3" />
        <path
          d="M18 3 A15 15 0 0 1 33 18"
          stroke="#4285F4"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <p style={{ margin: 0, fontSize: '14px', color: '#9ca3af', fontFamily: 'sans-serif' }}>
        <EditableContent contentKey="auth-callback-logger-ind" fallback="Logger ind…" />
      </p>
    </div>
  );
}
