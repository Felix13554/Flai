import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';
import { cleanupAuthStorage, isAuthStateCorrupted, safeCleanupAuthStorage } from '../utils/authCleanup';

interface AuthContextType {
  user: SupabaseUser | null;
  isAdmin: boolean;
  isAdminConfirmed: boolean;
  credits: number;
  loading: boolean;
  profileLoading: boolean;
  signUp: (email: string, password: string, redirectPath?: string, fullName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: (returnPath?: string) => Promise<void>;
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState(0);

  // CRITICAL: Both start as TRUE so ProtectedRoute always waits for the full
  // auth + profile resolution cycle before making any redirect decisions.
  // loading        = session not yet fetched from storage / Supabase
  // profileLoading = session resolved but DB profile fetch not yet complete
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  // Track whether we've completed the very first session check so the
  // visibility-change handler doesn't interfere before init is done.
  const initializedRef = useRef(false);
  // Keep a stable ref to the current user id for the visibility handler
  const userIdRef = useRef<string | null>(null);
  // Monotonically increasing counter — each profile fetch gets a unique id.
  // When the fetch completes we only commit results if the id still matches,
  // preventing a stale fetch from clobbering results from a newer one and
  // from prematurely setting profileLoading=false.
  const profileFetchGenRef = useRef(0);
  // Sticky ref: once isAdmin has been confirmed true for the current user,
  // we remember it here so ProtectedRoute never redirects on a transient
  // isAdmin=false flicker (e.g. during a token refresh or tab wake).
  // Cleared on SIGNED_OUT so a different (non-admin) user can log in cleanly.
  const isAdminConfirmedRef = useRef(false);

  const checkUserProfile = async (userId: string) => {
    try {
      const { data: userData, error } = await supabase
        .from('profiles')
        .select('is_admin, credits')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error checking user profile:', error);
        return { isAdmin: false, credits: 0 };
      }

      return {
        isAdmin: userData?.is_admin || false,
        credits: userData?.credits || 0,
      };
    } catch (err) {
      console.error('Error in checkUserProfile:', err);
      return { isAdmin: false, credits: 0 };
    }
  };

  const refreshCredits = async () => {
    if (!userIdRef.current) return;
    try {
      const { data: userData, error } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userIdRef.current)
        .single();

      if (error) {
        console.error('Error refreshing credits:', error);
        return;
      }
      setCredits(userData?.credits || 0);
    } catch (err) {
      console.error('Error in refreshCredits:', err);
    }
  };

  useEffect(() => {
    // Check for corrupted auth state on mount (PKCE verifier without session)
    if (isAuthStateCorrupted()) {
      console.warn('[Auth] Detected corrupted auth state on mount, cleaning up...');
      safeCleanupAuthStorage('mount-corruption-check');
    }

    // ── Official Supabase React pattern ──────────────────────────────────────
    // getSession() for initial load; onAuthStateChange for everything after.
    // CRITICAL: Never await Supabase DB calls inside onAuthStateChange —
    // the library holds an internal lock during the callback and any awaited
    // supabase query will deadlock. Profile fetch lives in a separate useEffect.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      userIdRef.current = sessionUser?.id ?? null;
      setLoading(false);
      if (!sessionUser) {
        setProfileLoading(false);
      }
      initializedRef.current = true;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      userIdRef.current = sessionUser?.id ?? null;

      // NOTE: We intentionally do NOT handle postAuthRedirect here.
      //
      // Desktop popup: GoogleLoginButton's storage-event listener detects the
      // session, shows the toast, and navigates — all in the parent tab.
      //
      // Mobile redirect: AuthCallback sets showWelcomeToast in sessionStorage
      // and calls window.location.replace(redirect) directly before this
      // event even fires in the new page context.
      //
      // Handling it here as well caused double-navigation on desktop (the
      // popup's SIGNED_IN fired in the parent tab too, racing with the
      // storage listener) and swallowed the mobile toast timing.

      if (event === 'SIGNED_OUT') {
        setIsAdmin(false);
        setCredits(0);
        // Invalidate any in-flight profile fetch so its result is discarded.
        profileFetchGenRef.current += 1;
        // Clear the sticky admin confirmation so the next user (who may not be
        // admin) doesn't inherit it.
        isAdminConfirmedRef.current = false;
        // Only set profileLoading false on sign-out (no profile to fetch).
        // For SIGNED_IN / TOKEN_REFRESHED we intentionally let the
        // separate user-effect drive profileLoading so there is no window
        // where loading=false AND profileLoading=false AND isAdmin=false
        // before checkUserProfile() has actually finished.
        setProfileLoading(false);
        toast.success('Du er nu logget ud');
        // Clean up any orphaned PKCE state to prevent future login issues
        safeCleanupAuthStorage('signed-out-event');
      }

      // TOKEN_REFRESHED fires when tab wakes from sleep and Supabase
      // successfully refreshes the token — no action needed, state already updated.
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Consume post-auth toast flags set by AuthCallback (mobile flow) ─────────
  // These are written to sessionStorage before window.location.replace() so
  // they survive the navigation and are read once the destination page mounts.
  useEffect(() => {
    if (sessionStorage.getItem('showWelcomeToast')) {
      sessionStorage.removeItem('showWelcomeToast');
      toast.success('Velkommen! 👋');
    }
    if (sessionStorage.getItem('showAuthErrorToast')) {
      const msg = sessionStorage.getItem('showAuthErrorToast')!;
      sessionStorage.removeItem('showAuthErrorToast');
      toast.error(`Login fejlede: ${msg}`);
    }
  }, []);

  // Fetch profile whenever user identity changes — runs outside the auth lock.
  //
  // WHY THE GENERATION COUNTER:
  // React can run this effect multiple times for the same user.id if state
  // updates cause re-renders before the async fetch finishes (e.g. Supabase
  // firing onAuthStateChange after getSession in the same cycle). Without the
  // counter, a slow first fetch could finish AFTER a fast second fetch and
  // set profileLoading=false + isAdmin=false, overwriting correct results.
  // The counter ensures only the most-recent fetch's result is committed.
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setCredits(0);
      setProfileLoading(false);
      return;
    }
    // Claim this generation — any prior in-flight fetch will see a stale gen
    // and discard its result without touching state.
    profileFetchGenRef.current += 1;
    const myGen = profileFetchGenRef.current;

    setProfileLoading(true);
    checkUserProfile(user.id).then((profile) => {
      // Only commit if we are still the latest fetch for this user.
      if (myGen !== profileFetchGenRef.current) return;
      if (profile.isAdmin) isAdminConfirmedRef.current = true;
      setIsAdmin(profile.isAdmin);
      setCredits(profile.credits);
      setProfileLoading(false);
    });
  }, [user?.id]);

  // ── Tab visibility / sleep reconnection ─────────────────────────────────
  // When a browser tab wakes from sleep the Supabase WS connection may be
  // stale. We proactively call getSession() on visibility change so the token
  // is refreshed and realtime reconnects cleanly — preventing the "logged-out
  // on wake" flash that ProtectedRoute would otherwise trigger.
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!initializedRef.current) return;

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Session refresh on tab focus failed:', error);
          return;
        }
        const freshUserId = session?.user?.id ?? null;
        const currentUserId = userIdRef.current;

        // Only update state if the user actually changed — avoids unnecessary
        // profile re-fetches on every tab switch.
        if (freshUserId !== currentUserId) {
          const sessionUser = session?.user ?? null;
          setUser(sessionUser);
          userIdRef.current = sessionUser?.id ?? null;
          if (!sessionUser) {
            setIsAdmin(false);
            setCredits(0);
            setProfileLoading(false);
          }
        }
      } catch (err) {
        console.warn('Visibility-change session check error:', err);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Set up real-time subscription for credits updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('profile_credits_changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new && 'credits' in payload.new) {
          setCredits(payload.new.credits);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const signUp = async (email: string, password: string, redirectPath?: string, fullName?: string) => {
    try {
      const postAuthPath = redirectPath && redirectPath !== '/' ? redirectPath : '/profile';
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${postAuthPath}`,
          data: fullName ? { full_name: fullName, name: fullName } : undefined,
        },
      });

      if (error) throw error;
      toast.success('Konto oprettet! Du kan nu logge ind.');
      return { error: null };
    } catch (error: any) {
      console.error('Error in signUp:', error);
      toast.error('Kunne ikke oprette konto');
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };
      if (!data.session) {
        return { error: new Error('Ingen session returneret fra login') };
      }
      return { error: null };
    } catch (error: any) {
      console.error('Error in signIn:', error);
      return { error };
    }
  };

  const signOut = async (returnPath?: string) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setIsAdmin(false);
      setCredits(0);
      
      // Clean up all auth storage to prevent PKCE issues on next login
      safeCleanupAuthStorage('manual-signout');

      window.location.href = returnPath || '/';
    } catch (error) {
      console.error('Error signing out:', error);
      // Even if sign out fails, clean storage to ensure fresh state
      safeCleanupAuthStorage('signout-error');
      toast.error('Kunne ikke logge ud');
    }
  };

  const value = {
    user,
    isAdmin,
    isAdminConfirmed: isAdminConfirmedRef.current,
    credits,
    loading,
    profileLoading,
    signUp,
    signIn,
    signOut,
    refreshCredits,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
