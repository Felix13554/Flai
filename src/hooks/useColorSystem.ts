import { useEffect } from 'react';
import { useSiteContent } from './useSiteContent';
import { syncDerivedColors } from '../utils/colorUtils';

export const useColorSystem = () => {
  const { content, loading } = useSiteContent();

  useEffect(() => {
    if (loading || !content) return;

    const colorItems = Object.values(content).filter(item => item.type === 'color');
    if (colorItems.length === 0) {
      // No CMS colours yet — still derive from whatever is in :root (the CSS defaults)
      syncDerivedColors();
      return;
    }

    const root = document.documentElement;

    const cssVarMap: Record<string, string> = {
      'primary-color':   '--primary',
      'secondary-color': '--secondary',
      'accent-color':    '--accent',
      'success-color':   '--success',
      'warning-color':   '--warning',
      'error-color':     '--error',
    };

    // Step 1: write the raw CMS colour values to :root
    colorItems.forEach(item => {
      const cssVar = cssVarMap[item.key];
      if (cssVar && item.value) {
        root.style.setProperty(cssVar, item.value);
      }
    });

    // Step 2: derive hover / active / tint variants from the now-updated :root vars
    // (colorUtils reads getComputedStyle so it sees what we just wrote above)
    syncDerivedColors();

  }, [content, loading]);

  return { loading };
};

export default useColorSystem;