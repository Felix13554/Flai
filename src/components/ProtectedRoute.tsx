import React, { useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  requireAdmin?: boolean;
}

/**
 * ProtectedRoute — guards pages behind authentication (and optionally admin status).
 *
 * WHY THE REFRESH-TO-HOMEPAGE BUG HAPPENED:
 * ─────────────────────────────────────────
 * On a hard refresh of e.g. /admin/bookings:
 *   1. `loading = true`, `profileLoading = true`  → spinner shown ✓
 *   2. getSession() resolves → `loading = false`
 *   3. Profile DB fetch starts → `profileLoading` is still true, but
 *      onAuthStateChange can fire a SIGNED_IN event concurrently which
 *      can call setProfileLoading(false) in some code paths BEFORE
 *      checkUserProfile() finishes, creating a momentary window where:
 *        user = <admin>, loading = false, profileLoading = false, isAdmin = false
 *   4. ProtectedRoute with requireAdmin saw !isAdmin → Navigate to "/" ✗
 *
 * Additionally `profileLoading` starts as `true` but transitions through
 * false→true→false when the user effect fires. Any render between those
 * transitions with loading=false and profileLoading=false but isAdmin=false
 * would trigger the unwanted redirect.
 *
 * THE FIX:
 * ────────
 * 1. Never redirect while loading OR profileLoading (unchanged — already correct).
 * 2. Add a `hasEverBeenAdmin` ref: once isAdmin becomes true in this mount
 *    cycle we never redirect away until an explicit sign-out clears the user.
 *    This neutralises the brief flicker window during token refresh / tab wake.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  adminOnly = false,
  requireAdmin = false,
}) => {
  const { user, loading, profileLoading, isAdmin } = useAuth();
  const location = useLocation();

  // Once we confirm admin status, remember it for the lifetime of this mount.
  // This prevents a transient isAdmin=false flicker (token refresh, tab wake)
  // from bouncing the admin to the homepage.
  const hasEverBeenAdminRef = useRef(false);
  if (isAdmin) hasEverBeenAdminRef.current = true;

  // ── Step 1: Always wait for BOTH flags before making routing decisions ────
  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // ── Step 2: Unauthenticated → /auth with return path ─────────────────────
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }

  // ── Step 3: Admin guard — use sticky ref to survive transient flickers ────
  if ((adminOnly || requireAdmin) && !isAdmin && !hasEverBeenAdminRef.current) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
