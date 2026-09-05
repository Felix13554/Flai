/**
 * PanoramaViewer.tsx
 *
 * Renders a 360° equirectangular panorama using Pannellum (loaded via CDN).
 * Reinitialises automatically if the tab was hidden long enough for the
 * WebGL context to be discarded.
 */

import EditableContent from './EditableContent';
import React, { useEffect, useRef, useCallback, useState } from 'react';

interface PannellumViewer {
  destroy(): void;
  getYaw(): number;
  setYaw(yaw: number): PannellumViewer;
  getPitch(): number;
  setPitch(pitch: number): PannellumViewer;
  getHfov(): number;
  setHfov(hfov: number): PannellumViewer;
  startAutoRotate(deg?: number): PannellumViewer;
  stopAutoRotate(): PannellumViewer;
  on(event: string, cb: (...args: unknown[]) => void): PannellumViewer;
}

interface PannellumConfig {
  type:         string;
  panorama:     string;
  autoLoad:     boolean;
  autoRotate:   number;
  pitch:        number;
  yaw:          number;
  hfov:         number;
  minHfov:      number;
  maxHfov:      number;
  showControls: boolean;
  mouseZoom:    boolean;
  keyboardZoom: boolean;
  compass:      boolean;
}

declare global {
  interface Window {
    pannellum: {
      viewer(container: HTMLElement, config: PannellumConfig): PannellumViewer;
    };
  }
}

const PANNELLUM_CSS = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
const PANNELLUM_JS  = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';

let pannellumLoaded  = false;
let pannellumLoading: Promise<void> | null = null;

function loadPannellum(): Promise<void> {
  if (pannellumLoaded)  return Promise.resolve();
  if (pannellumLoading) return pannellumLoading;

  pannellumLoading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${PANNELLUM_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel   = 'stylesheet';
      link.href  = PANNELLUM_CSS;
      document.head.appendChild(link);
    }

    if (!document.querySelector('style[data-pannellum-no-fs]')) {
      const style = document.createElement('style');
      style.setAttribute('data-pannellum-no-fs', '');
      style.textContent = '.pnlm-fullscreen-toggle-button { display: none !important; }';
      document.head.appendChild(style);
    }

    const script   = document.createElement('script');
    script.src     = PANNELLUM_JS;
    script.async   = true;
    script.onload  = () => { pannellumLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Pannellum'));
    document.head.appendChild(script);
  });

  return pannellumLoading;
}

interface PanoramaViewerProps {
  url:         string;
  autoLoad?:   boolean;
  autoRotate?: number;
  pitch?:      number;
  yaw?:        number;
  hfov?:       number;
  minHfov?:    number;
  maxHfov?:    number;
  className?:  string;
  onReady?:    () => void;
  onError?:    (err: string) => void;
}

const HIDDEN_REINIT_THRESHOLD_MS = 4000;

const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  url,
  autoLoad    = true,
  autoRotate  = 1,
  pitch       = 0,
  yaw         = 0,
  hfov        = 100,
  minHfov     = 50,
  maxHfov     = 120,
  className   = '',
  onReady,
  onError,
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const viewerRef     = useRef<PannellumViewer | null>(null);
  const hiddenAtRef   = useRef<number | null>(null);
  const hintDismissed = useRef(false);

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  const dismissHint = useCallback(() => {
    if (hintDismissed.current) return;
    hintDismissed.current = true;
    setShowHint(false);
  }, []);

  const initViewer = useCallback(async () => {
    if (!containerRef.current) return;
    setLoading(true);
    setError(null);
    hintDismissed.current = false;
    setShowHint(false);

    try {
      await loadPannellum();
    } catch {
      const msg = 'Kunne ikke indlæse 360° viewer';
      setError(msg);
      setLoading(false);
      onError?.(msg);
      return;
    }

    if (viewerRef.current) {
      try { viewerRef.current.destroy(); } catch { /* ignore */ }
      viewerRef.current = null;
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    try {
      const viewer = window.pannellum.viewer(containerRef.current!, {
        type:         'equirectangular',
        panorama:     url,
        autoLoad,
        autoRotate:   autoRotate !== 0 ? -autoRotate : 0,
        pitch,
        yaw,
        hfov,
        minHfov,
        maxHfov,
        showControls: false,
        mouseZoom:    true,
        keyboardZoom: true,
        compass:      false,
      });

      viewer.on('load', () => {
        setLoading(false);
        setShowHint(true);
        onReady?.();
      });

      viewer.on('error', (msg: unknown) => {
        const errMsg = typeof msg === 'string' ? msg : 'Fejl ved indlæsning';
        setError(errMsg);
        setLoading(false);
        onError?.(errMsg);
      });

      viewerRef.current = viewer;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ukendt fejl';
      setError(msg);
      setLoading(false);
      onError?.(msg);
    }
  }, [url, autoLoad, autoRotate, pitch, yaw, hfov, minHfov, maxHfov, onReady, onError]);

  useEffect(() => {
    initViewer();
    return () => {
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch { /* ignore */ }
        viewerRef.current = null;
      }
    };
  }, [initViewer]);

  // Attach dismiss listeners on the wrapper so ANY mousedown/touch dismisses the hint
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener('mousedown', dismissHint);
    el.addEventListener('touchstart', dismissHint, { passive: true });
    return () => {
      el.removeEventListener('mousedown', dismissHint);
      el.removeEventListener('touchstart', dismissHint);
    };
  }, [dismissHint]);

  // Reinit if WebGL context was likely discarded while tab was hidden
  useEffect(() => {
    const onVisChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        const duration = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        hiddenAtRef.current = null;
        if (duration >= HIDDEN_REINIT_THRESHOLD_MS) {
          initViewer();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [initViewer]);

  return (
    <>
      <style>{`
        @keyframes _pnlm-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes _pnlm-hint-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes _pnlm-hint-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
          50%       { transform: translate(-50%, -50%) scale(1.10); opacity: 0.8; }
        }
      `}</style>

      <div
        ref={wrapperRef}
        className={`relative overflow-hidden rounded-xl bg-neutral-900 ${className}`}
        style={{ aspectRatio: '16/9' }}
      >
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
          style={{ borderRadius: 'inherit' }}
        />

        {/* ── Interaction hint ─────────────────────────────────────────────── */}
        {showHint && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 30,
              pointerEvents: 'none',
              animation: '_pnlm-hint-in 0.5s ease both',
            }}
          >
            {/* Centre icon — pulsing circular button like Facebook */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              animation: '_pnlm-hint-pulse 2.2s ease-in-out infinite',
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.42)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: '1.5px solid rgba(255,255,255,0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Four-arrow pan icon */}
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L10.5 6.5H15.5L13 2Z"     fill="white"/>
                <path d="M13 24L15.5 19.5H10.5L13 24Z"   fill="white"/>
                <path d="M2 13L6.5 15.5V10.5L2 13Z"      fill="white"/>
                <path d="M24 13L19.5 10.5V15.5L24 13Z"   fill="white"/>
                <circle cx="13" cy="13" r="2.5"          fill="white"/>
              </svg>
            </div>

            {/* Bottom text — plain, shadow only, no pill/background */}
            <div style={{
              position: 'absolute',
              bottom: 16,
              left: 0,
              right: 0,
              textAlign: 'center',
            }}>
              <span style={{
                color: 'white',
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.6)',
                letterSpacing: '0.01em',
              }}>
                <EditableContent contentKey="panorama-viewer-klik-og-traek-for-at" fallback="Klik og træk for at se dig omkring" />
              </span>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 z-20 pointer-events-none">
            <div className="relative mb-4">
              <svg
                style={{ animation: '_pnlm-spin 1s linear infinite' }}
                className="w-14 h-14"
                viewBox="0 0 56 56"
                fill="none"
              >
                <circle cx="28" cy="28" r="24" stroke="#262626" strokeWidth="4" />
                <path d="M28 4 A24 24 0 0 1 52 28" stroke="#0F52BA" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <svg className="absolute inset-0 m-auto w-6 h-6" style={{ color: '#0F52BA' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <ellipse cx="12" cy="12" rx="4" ry="10" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <p className="text-neutral-400 text-sm"><EditableContent contentKey="panorama-viewer-indlaeser-360-panorama" fallback="Indlæser 360° panorama…" /></p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 z-20 px-4">
            <svg className="w-10 h-10 text-red-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
            <p className="text-neutral-300 text-sm font-medium mb-1 text-center"><EditableContent contentKey="panorama-viewer-panorama-kunne-ikke-indlaeses" fallback="Panorama kunne ikke indlæses" /></p>
            <p className="text-neutral-500 text-xs max-w-xs text-center mb-4">{error}</p>
            <button
              onClick={initViewer}
              className="px-4 py-2 text-white text-sm rounded-lg transition-colors"
              style={{ backgroundColor: '#0F52BA' }}
            >
              <EditableContent contentKey="panorama-viewer-proev-igen" fallback="Prøv igen" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default PanoramaViewer;
