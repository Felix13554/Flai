/**
 * ColorSyncProvider.tsx
 *
 * Mounts once at the app root. Calls syncDerivedColors() on mount and
 * re-runs it whenever:
 *   - the window fires 'siteContentUpdated'  (dispatched after every content save)
 *   - the window fires 'adminSettingsChanged' (dispatched after admin setting saves)
 *
 * This keeps --primary-hover, --primary-tint, etc. always in sync with
 * whatever colour values the admin has set via the CMS.
 *
 * Usage: wrap your app root (or just inside AuthProvider) with <ColorSyncProvider>
 */
import { useEffect } from 'react';
import { setupColorSync } from '../utils/colorUtils';

const ColorSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    // Sets up listeners and does an immediate sync.
    // Returns a cleanup function that removes the listeners.
    const cleanup = setupColorSync();
    return cleanup;
  }, []);

  return <>{children}</>;
};

export default ColorSyncProvider;