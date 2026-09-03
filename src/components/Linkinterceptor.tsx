import { useEffect, useState } from 'react';
import { getAdminSettings, type AdminSettings } from './ContentManagementPanel';
import { useAuth } from '../contexts/AuthContext';

/**
 * Mount this component once near the root of your app (e.g. inside App.tsx).
 *
 * It attaches a capture-phase click listener to the document that intercepts
 * every click on ANY <a> element — including React Router <Link> components,
 * plain HTML anchors, and nav items — and prevents navigation when the admin
 * has toggled "Links deaktiveret" in the Content Management Panel.
 *
 * This is the correct fix: component-level href=undefined only works for
 * EditableContent-wrapped anchors. A capture-phase document listener is the
 * only reliable way to intercept ALL links, including those outside our
 * control (router links, third-party components, etc.).
 */
const LinkInterceptor: React.FC = () => {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<AdminSettings>(getAdminSettings);

  // Stay in sync with panel toggles
  useEffect(() => {
    const handler = (e: Event) => setSettings((e as CustomEvent<AdminSettings>).detail);
    window.addEventListener('adminSettingsChanged', handler);
    return () => window.removeEventListener('adminSettingsChanged', handler);
  }, []);

  // Install / uninstall the capture-phase interceptor
  useEffect(() => {
    if (!isAdmin || !settings.disableLinks) return;

    const intercept = (e: MouseEvent) => {
      // Walk up the DOM from the click target to find the nearest <a>
      let el = e.target as HTMLElement | null;
      while (el && el.tagName !== 'A') el = el.parentElement;

      if (!el) return;

      // Allow clicks inside the CMS panel itself (z-50 modal) so the
      // admin can still interact with the panel's own links/buttons.
      if (el.closest('[data-cms-panel]')) return;

      // Block everything else
      e.preventDefault();
      e.stopPropagation();
    };

    // useCapture = true ensures we intercept before React's synthetic events
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [isAdmin, settings.disableLinks]);

  return null; // purely behavioural, no DOM output
};

export default LinkInterceptor;