/**
 * Auth Storage Cleanup Utility
 * 
 * Handles cleanup of orphaned PKCE verifiers and auth state from browser storage.
 * Prevents "PKCE validation failed" errors when storage is cleared but OAuth state persists.
 */

/**
 * Cleans up orphaned PKCE verifiers and auth state from storage.
 * Call this on auth errors or when detecting inconsistent state.
 */
export function cleanupAuthStorage(): void {
  try {
    // Supabase stores PKCE data with these key patterns
    const localKeysToRemove: string[] = [];
    
    // Find all Supabase auth-related keys in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('supabase.auth.') ||
        key.includes('code_verifier') ||
        key.includes('pkce') ||
        key.includes('-code-verifier') ||
        key.includes('auth-code-')
      )) {
        localKeysToRemove.push(key);
      }
    }
    
    // Remove them from localStorage
    localKeysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[Auth Cleanup] Removed localStorage key: ${key}`);
    });
    
    // Also clear sessionStorage auth items
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.startsWith('supabase.auth.') ||
        key.includes('code_verifier') ||
        key.includes('pkce') ||
        key.includes('-code-verifier') ||
        key.includes('auth-code-')
      )) {
        sessionKeysToRemove.push(key);
      }
    }
    
    sessionKeysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
      console.log(`[Auth Cleanup] Removed sessionStorage key: ${key}`);
    });
    
    if (localKeysToRemove.length > 0 || sessionKeysToRemove.length > 0) {
      console.log('[Auth Cleanup] Removed orphaned auth storage items');
    }
  } catch (error) {
    console.error('[Auth Cleanup] Error cleaning storage:', error);
  }
}

/**
 * Check if we're in a potentially broken auth state.
 * Returns true if PKCE verifier exists without corresponding session.
 */
export function isAuthStateCorrupted(): boolean {
  try {
    // Check for PKCE verifier without corresponding session
    let hasVerifier = false;
    let hasSession = false;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      if (key.includes('code_verifier') || key.includes('pkce')) {
        hasVerifier = true;
      }
      
      if (key.startsWith('supabase.auth.token') || key.includes('sb-') && key.includes('-auth-token')) {
        hasSession = true;
      }
    }
    
    // If we have a verifier but no session, state is corrupted
    const isCorrupted = hasVerifier && !hasSession;
    
    if (isCorrupted) {
      console.warn('[Auth State Check] Detected corrupted state - verifier exists without session');
    }
    
    return isCorrupted;
  } catch (error) {
    console.error('[Auth State Check] Error checking state:', error);
    return false;
  }
}

/**
 * Check if an error is PKCE-related
 */
export function isPKCEError(error: Error | { message?: string } | null | undefined): boolean {
  if (!error) return false;
  
  const errorMessage = typeof error === 'string' ? error : error.message || '';
  const lowerMessage = errorMessage.toLowerCase();
  
  return (
    lowerMessage.includes('pkce') ||
    lowerMessage.includes('code_verifier') ||
    lowerMessage.includes('code_challenge') ||
    lowerMessage.includes('code verifier') ||
    lowerMessage.includes('invalid grant')
  );
}

/**
 * Safe cleanup with logging
 */
export function safeCleanupAuthStorage(context: string): void {
  console.log(`[Auth Cleanup] Triggered from: ${context}`);
  cleanupAuthStorage();
}
