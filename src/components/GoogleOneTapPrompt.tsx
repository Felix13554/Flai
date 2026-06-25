import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';
import { isPKCEError, safeCleanupAuthStorage } from '../utils/authCleanup';

const GOOGLE_CLIENT_ID = '430587810238-17cjcpbvhgacr8sirt75s10unrbvnqbq.apps.googleusercontent.com';
let hasShown = false;

const GoogleOneTapPrompt = () => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const scrollListenerRef = useRef<(() => void) | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    // Wait until auth has fully resolved before doing anything.
    // Without this, user is null for a brief moment even when signed in,
    // which causes the prompt to slip through.
    if (loading) return;

    if (user) {
      window.google?.accounts.id.cancel();
      document.body.classList.remove('one-tap-visible');
      return;
    }

    if (hasShown) return;

    const watchForPrompt = () => {
      observerRef.current = new MutationObserver(() => {
        const iframe = document.querySelector(
          'iframe[src*="accounts.google.com/gsi"]'
        );
        if (iframe) {
          document.body.classList.add('one-tap-visible');
          observerRef.current?.disconnect();

          const removeObserver = new MutationObserver(() => {
            if (!document.querySelector('iframe[src*="accounts.google.com/gsi"]')) {
              document.body.classList.remove('one-tap-visible');
              removeObserver.disconnect();
            }
          });
          removeObserver.observe(document.body, { childList: true, subtree: true });
        }
      });
      observerRef.current.observe(document.body, { childList: true, subtree: true });
    };

    const init = async () => {
      // Double-check user hasn't signed in between scroll and async init
      if (user) return;

      hasShown = true;

      if (scrollListenerRef.current) {
        window.removeEventListener('scroll', scrollListenerRef.current);
        scrollListenerRef.current = null;
      }

      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
      const hashedNonce = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: hashedNonce,
        callback: async ({ credential }: { credential: string }) => {
          try {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: credential,
              nonce,
            });
            
            document.body.classList.remove('one-tap-visible');
            
            if (error) {
              // Check if it's a PKCE-related error
              if (isPKCEError(error)) {
                console.warn('[Google One Tap] PKCE error detected, cleaning storage and allowing retry');
                safeCleanupAuthStorage('google-onetap-pkce-error');
                toast.error('Autentifikationsfejl. Prøv venligst igen.');
                
                // Allow user to retry after a moment
                setTimeout(() => {
                  hasShown = false; // Reset so they can trigger again
                }, 2000);
              } else {
                console.error('[Google One Tap] Auth error:', error);
                toast.error('Google login fejlede. Prøv igen.');
              }
            } else {
              toast.success('Velkommen! 👋');
            }
          } catch (err) {
            console.error('[Google One Tap] Unexpected error:', err);
            safeCleanupAuthStorage('google-onetap-unexpected-error');
            toast.error('Der opstod en uventet fejl. Prøv igen.');
          }
        },
        auto_select: true,
        cancel_on_tap_outside: false,
        itp_support: true,
      });

      watchForPrompt();
      window.google?.accounts.id.prompt();
    };

    const setupScrollTrigger = () => {
      const onScroll = () => {
        if (window.scrollY > 100) {
          window.removeEventListener('scroll', onScroll);
          // Guard here too — user may have signed in after scroll listener was registered
          if (!user) init();
        }
      };
      scrollListenerRef.current = onScroll;
      window.addEventListener('scroll', onScroll, { passive: true });
    };

    if (window.google) {
      setupScrollTrigger();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = setupScrollTrigger;
      document.head.appendChild(script);
    }

    return () => {
      if (scrollListenerRef.current) {
        window.removeEventListener('scroll', scrollListenerRef.current);
        scrollListenerRef.current = null;
      }
      observerRef.current?.disconnect();
    };
  }, [user, loading, pathname]);

  return null;
};

export default GoogleOneTapPrompt;
