/**
 * PanoramaViewerPage.tsx
 *
 * Full-screen 360° viewer page.
 * Reads the panorama URL and title from query parameters:
 *   /panorama?url=<encoded-url>&title=<encoded-title>
 *
 * This page is what the downloaded HTML preview files redirect to,
 * so customers see the same PanoramaViewer component as the rest of the site.
 */

import EditableContent from '../components/EditableContent';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PanoramaViewer from '../components/PanoramaViewer';

const PanoramaViewerPage: React.FC = () => {
  const [params] = useSearchParams();
  const url   = params.get('url')   ?? '';
  const title = params.get('title') ?? '360° Preview';

  if (!url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400 text-sm">
        <EditableContent contentKey="panorama-viewer-page-ingen-panorama-url-angivet" fallback="Ingen panorama-URL angivet." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      {/* Slim header */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      >
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <ellipse cx="12" cy="12" rx="5" ry="10" />
            <path d="M2 12h20" />
          </svg>
          <span className="text-white font-semibold text-sm truncate max-w-xs">{title}</span>
        </div>
        <span
          className="text-xs font-bold tracking-widest px-3 py-1 rounded-full border"
          style={{ color: '#3b82f6', borderColor: 'rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.1)' }}
        >
          360°
        </span>
      </div>

      {/* Viewer — fills remaining screen */}
      <div className="flex-1 relative">
        <PanoramaViewer
          url={url}
          autoRotate={0.5}
          autoLoad={true}
          className="!rounded-none w-full h-full absolute inset-0"
          style={{ aspectRatio: 'unset', borderRadius: 0 } as React.CSSProperties}
        />
      </div>

      {/* Hint bar */}
      <div
        className="text-center py-2 text-xs flex-shrink-0"
        style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.5)' }}
      >
        <EditableContent contentKey="panorama-viewer-page-traek-for-at-se-rundt" fallback="Træk for at se rundt · Scroll/knib for at zoome" />
      </div>
    </div>
  );
};

export default PanoramaViewerPage;
