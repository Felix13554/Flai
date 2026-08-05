import EditableContent from '../components/EditableContent';
import { useEffect } from 'react';
import { supabase } from '../utils/supabase';

/**
 * AuthCallback — the OAuth redirect landing page.
 *
 * Google → AuthCallback (main tab) → exchangeCodeForSession → navigate to
 * postAuthRedirect (or '/').
 */
export default function AuthCallback() {
  useEffect(() => {
    const handle = async () => {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.search
        );

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
