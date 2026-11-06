import React from 'react';
import PanoramaViewer from './PanoramaViewer';
import CloudinaryVideoPlayer, { CloudinaryVideoThumb } from './CloudinaryVideoPlayer';
import { getCloudinaryMediaId } from '../utils/cloudinaryMedia';
import { getMediaKind, PANORAMA_PREFIX } from '../utils/portfolioMedia';

const GlobeIcon: React.FC<{ className?: string }> = ({ className = 'w-10 h-10 text-primary' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <ellipse cx="12" cy="12" rx="5" ry="10" />
    <path d="M2 12h20" />
  </svg>
);

const Badge360: React.FC = () => (
  <span className="rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold tracking-wider text-white">360°</span>
);

interface MediaProps {
  url: string;
  title?: string;
  className?: string;
}

/**
 * Static, lightweight tile for a medium (cover, gallery grid, admin lists).
 * Fills its parent — the parent decides the aspect ratio.
 * Never plays or loads an interactive viewer.
 */
export const PortfolioMediaThumb: React.FC<MediaProps> = ({ url, title = '', className = '' }) => {
  const kind = getMediaKind(url);

  if (kind === 'panorama') {
    const raw = url.slice(PANORAMA_PREFIX.length);
    return (
      <div className={`relative h-full w-full overflow-hidden bg-neutral-900 ${className}`}>
        <img
          src={raw}
          alt={title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-70"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
          <GlobeIcon />
          <Badge360 />
        </div>
      </div>
    );
  }

  if (kind === 'cloudinary') {
    return <CloudinaryVideoThumb publicId={getCloudinaryMediaId(url)} className={className} iconSize={24} />;
  }

  if (kind === 'youtube') {
    const id = url.split(':')[1];
    return (
      <div className={`relative h-full w-full overflow-hidden bg-neutral-800 ${className}`}>
        <img
          src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
          alt={title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="h-12 w-12 text-white/90 drop-shadow" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={title}
      loading="lazy"
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
    />
  );
};

/**
 * The playable / interactive version: video player, YouTube embed, 360° viewer
 * or a plain image. Used for the task video and the large view in the gallery.
 *
 * `fit="contain"` shows images in full (large view); `fit="cover"` fills a 16:9 box.
 */
export const PortfolioMediaPlayer: React.FC<MediaProps & { fit?: 'cover' | 'contain' }> = ({
  url,
  title = '',
  className = '',
  fit = 'cover',
}) => {
  const kind = getMediaKind(url);

  if (kind === 'panorama') {
    return (
      <div className={`relative w-full ${className}`}>
        <PanoramaViewer url={url.slice(PANORAMA_PREFIX.length)} title={title} autoRotate={0.8} className="w-full" />
        <div className="pointer-events-none absolute left-2 top-2 z-20">
          <Badge360 />
        </div>
      </div>
    );
  }

  if (kind === 'youtube') {
    return (
      <div className={`relative w-full pt-[56.25%] ${className}`}>
        <iframe
          className="absolute inset-0 h-full w-full rounded-lg"
          src={`https://www.youtube.com/embed/${url.split(':')[1]}`}
          title={title || 'YouTube video player'}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  if (kind === 'cloudinary') {
    return (
      <CloudinaryVideoPlayer
        // key → a fresh player (no leftover playback) per video
        key={url}
        publicId={getCloudinaryMediaId(url)}
        title={title}
        className={className}
      />
    );
  }

  if (fit === 'contain') {
    return (
      <img
        src={url}
        alt={title}
        decoding="async"
        className={`mx-auto max-h-[70vh] w-full rounded-lg object-contain ${className}`}
      />
    );
  }

  return <img src={url} alt={title} decoding="async" className={`aspect-video w-full rounded-lg object-cover ${className}`} />;
};
