import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import EditableContent from './EditableContent';
import PortfolioGalleryModal from './PortfolioGalleryModal';
import { PortfolioMediaPlayer, PortfolioMediaThumb } from './PortfolioMediaView';
import { getTaskLayout } from '../utils/portfolioMedia';
import type { PortfolioImage } from '../types';

export interface PortfolioTaskCardProps {
  task: PortfolioImage;
  /**
   * Sæt `id="portfolio-task-<id>"` på kortet, så Projekter-siden kan scrolle
   * til det. Slå fra, når kortet vises et sted, hvor siden allerede har et
   * kort med samme id (fx i modalen over portfolio-siden).
   */
  withAnchor?: boolean;
  /**
   * Når den er sat, vises et X øverst til højre i kortet, som kalder den.
   * Bruges af PortfolioProjectModal.
   */
  onClose?: () => void;
  className?: string;
}

/**
 * One portfolio task = one card — used everywhere on the site (the Projekter
 * page lists them, the hero's "Se projekt" button opens one in a modal).
 *
 * Design is taken from the hero's "Se mere" container (HeroProjectModal):
 * same dark bordered box, same title and description styling. Top to bottom:
 *   1. (small client logo — same logo + website link as before)
 *   2. title
 *   3. description
 *   4. media: video and cover image 50% / 50% side by side on desktop;
 *      on mobile the video is on top and the cover directly below it.
 *      If the task only has one of them, it fills the row.
 *   5. blue "Se alle billeder" button (only when there is more than one image)
 *
 * Clicking the cover image or the button opens the "Se alle billeder"
 * container (PortfolioGalleryModal) with every image of the task.
 */
const PortfolioTaskCard: React.FC<PortfolioTaskCardProps> = ({
  task,
  withAnchor = true,
  onClose,
  className = '',
}) => {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const { video, cover, gallery } = useMemo(() => getTaskLayout(task), [task]);

  const title = task.title?.trim() ?? '';
  const description = task.description?.trim();
  const hasBoth = !!video && !!cover;

  return (
    <article
      id={withAnchor ? `portfolio-task-${task.id}` : undefined}
      className={`relative scroll-mt-24 rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl md:p-8 ${className}`}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Luk"
          className="absolute right-3 top-3 z-10 rounded-full p-2.5 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:right-4 md:top-4"
        >
          <X size={26} />
        </button>
      )}

      {/* 1+2. Logo (small) next to the title — same row, so the logo no
          longer takes up a line of its own above the title. Wraps under the
          logo only if the title is too long for the row. */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 md:gap-x-5 ${onClose ? 'pr-16' : ''}`}>
        {task.business_logo_url && (
          <a
            href={task.business_website_url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block shrink-0"
            title={task.business_website_url ? 'Besøg hjemmeside' : undefined}
            onClick={(e) => { if (!task.business_website_url) e.preventDefault(); }}
            style={task.business_website_url ? undefined : { cursor: 'default' }}
          >
            <img
              src={task.business_logo_url}
              alt=""
              className="w-auto object-contain [--logo-h:2rem] [--logo-mw:140px] md:[--logo-h:2.5rem] md:[--logo-mw:180px]"
              style={{
                height: `calc(var(--logo-h) * ${(task.business_logo_scale ?? 100) / 100})`,
                maxWidth: `min(100%, calc(var(--logo-mw) * ${(task.business_logo_scale ?? 100) / 100}))`,
              }}
            />
          </a>
        )}
        {/* Title — identical to the "Se mere" title */}
        <h2 className="min-w-0 text-2xl font-bold leading-tight text-white md:text-4xl">{title}</h2>
      </div>

      {/* 3. Description — identical to the "Se mere" description */}
      {description && (
        <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-neutral-300 md:mt-5 md:text-lg">
          {description}
        </p>
      )}

      {/* 4. Media — video first in the DOM, so it is on top on mobile */}
      {(video || cover) && (
        <div className={`mt-6 grid grid-cols-1 gap-4 md:mt-8 md:gap-6 ${hasBoth ? 'md:grid-cols-2' : ''}`}>
          {video && (
            <div className="min-w-0">
              <PortfolioMediaPlayer url={video.url} title={title} />
            </div>
          )}
          {/* Cover image + (below IT, not below the video) "Se alle billeder".
              On desktop this is the right-hand column; on mobile it comes
              after the video, so the button ends up under the images there too. */}
          {cover && (
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                aria-label={`Se alle billeder – ${title}`}
                className="group relative block aspect-video w-full min-w-0 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 transition-colors hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <PortfolioMediaThumb
                  url={cover.url}
                  title={title}
                  className="transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </button>

              {/* 5. "Se alle billeder" */}
              {gallery.length > 1 && (
                <div className="mt-4 flex justify-center">
                  <button type="button" onClick={() => setGalleryOpen(true)} className="btn-primary">
                    <EditableContent contentKey="portfolio-page-se-alle-billeder" fallback="Se alle billeder" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* No cover (only a video + non-image gallery items): keep the button reachable. */}
      {!cover && gallery.length > 1 && (
        <div className="mt-4 md:mt-6">
          <button type="button" onClick={() => setGalleryOpen(true)} className="btn-primary">
            <EditableContent contentKey="portfolio-page-se-alle-billeder" fallback="Se alle billeder" />
          </button>
        </div>
      )}

      <PortfolioGalleryModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        title={title}
        items={gallery}
      />
    </article>
  );
};

export default PortfolioTaskCard;
