import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import EditableContent from '../components/EditableContent';
import SEO from '../components/SEO';
import { useData } from '../contexts/DataContext';
import { SkeletonLoader } from '../components/SkeletonLoader';
import PortfolioGalleryModal from '../components/PortfolioGalleryModal';
import { PortfolioMediaPlayer, PortfolioMediaThumb } from '../components/PortfolioMediaView';
import { getTaskLayout } from '../utils/portfolioMedia';
import type { PortfolioImage } from '../types';

// Skeleton that matches a task card: title, description, then the media row.
const PortfolioTaskSkeleton: React.FC = () => (
  <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-5 md:p-8">
    <SkeletonLoader height="2.25rem" className="mb-4" width="50%" />
    <SkeletonLoader height="1rem" className="mb-2" width="90%" />
    <SkeletonLoader height="1rem" className="mb-6" width="70%" />
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
      <div className="aspect-video w-full animate-shimmer rounded-lg bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%]" />
      <div className="aspect-video w-full animate-shimmer rounded-lg bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%]" />
    </div>
  </div>
);

/**
 * One portfolio task = one row, always — on every screen size.
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
/** Til at matche `project` fra hero'ens content-nøgle mod en opgaves titel. */
const normalizeProjectName = (s: string | null | undefined) =>
  (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const PortfolioTaskCard: React.FC<{ task: PortfolioImage }> = ({ task }) => {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const { video, cover, gallery } = useMemo(() => getTaskLayout(task), [task]);

  const title = task.title?.trim() ?? '';
  const description = task.description?.trim();
  const hasBoth = !!video && !!cover;

  return (
    <article
      id={`portfolio-task-${task.id}`}
      className="scroll-mt-24 rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl md:p-8"
    >
      {/* 1. Logo (small, above the title) */}
      {task.business_logo_url && (
        <a
          href={task.business_website_url || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-block md:mb-5"
          title={task.business_website_url ? 'Besøg hjemmeside' : undefined}
          onClick={(e) => { if (!task.business_website_url) e.preventDefault(); }}
          style={task.business_website_url ? undefined : { cursor: 'default' }}
        >
          <img
            src={task.business_logo_url}
            alt=""
            className="w-auto object-contain [--logo-h:2.5rem] [--logo-mw:200px] md:[--logo-h:3rem] md:[--logo-mw:240px]"
            style={{
              height: `calc(var(--logo-h) * ${(task.business_logo_scale ?? 100) / 100})`,
              maxWidth: `min(100%, calc(var(--logo-mw) * ${(task.business_logo_scale ?? 100) / 100}))`,
            }}
          />
        </a>
      )}

      {/* 2. Title — identical to the "Se mere" title */}
      <h2 className="text-2xl font-bold leading-tight text-white md:text-4xl">{title}</h2>

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
          {cover && (
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
          )}
        </div>
      )}

      {/* 5. "Se alle billeder" */}
      {gallery.length > 1 && (
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

const PortfolioPage: React.FC = () => {
  const { portfolioImages, isPortfolioLoaded, getContent } = useData();

  // Highest `array` first (default 50) — same ordering as before. The sort is
  // stable, so equal values keep the newest-first order from the query.
  const tasks = useMemo(
    () =>
      [...portfolioImages]
        .filter((t) => (t.media && t.media.length > 0) || t.image_url)
        .sort((a, b) => (b.array ?? 50) - (a.array ?? 50)),
    [portfolioImages],
  );

  // Kommer man fra hero-knappen på forsiden, ligger projektets navn i
  // location.state.scrollToProject. Siden skal åbne allerede scrollet ned til
  // projektet — uden animation — så det sker i et layout-effect (før browseren
  // tegner siden) og med behavior 'instant'. ScrollToTop springer sin
  // nulstilling over i det tilfælde. Kører kun én gang pr. besøg.
  const location = useLocation();
  const scrollToProject = (location.state as { scrollToProject?: string } | null)?.scrollToProject;
  const hasScrolledRef = useRef(false);

  useLayoutEffect(() => {
    if (hasScrolledRef.current || !scrollToProject || !isPortfolioLoaded) return;
    const wanted = normalizeProjectName(scrollToProject);
    const target = tasks.find((t) => normalizeProjectName(t.title) === wanted);
    if (!target) return;
    const el = document.getElementById(`portfolio-task-${target.id}`);
    if (!el) return;
    hasScrolledRef.current = true;
    el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
  }, [scrollToProject, isPortfolioLoaded, tasks]);

  return (
    <div className="pb-16 pt-20">
      <SEO
        title={getContent('portfolio-page-title', 'Projekter')}
        description="Se eksempler på vores dronefotografering og dronefilmning. Flai leverer professionelle luftoptagelser i hele Danmark."
        canonical="/portfolio"
      />
      <div className="mb-12 bg-primary/10 py-12">
        <div className="container">
          <EditableContent
            contentKey="portfolio-page-title"
            as="h1"
            className="mb-4 text-center text-3xl font-bold md:text-4xl"
            fallback="Projekter"
          />
          <EditableContent
            contentKey="portfolio-page-subtitle"
            as="p"
            className="mx-auto max-w-2xl text-center text-lg text-neutral-300"
            fallback="Udforsk mine projekter."
          />
        </div>
      </div>
      <div className="container">
        {/* One task per row, on every screen size */}
        <div className="mx-auto max-w-5xl space-y-8">
          {!isPortfolioLoaded ? (
            Array.from({ length: 3 }).map((_, i) => <PortfolioTaskSkeleton key={i} />)
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              <EditableContent
                contentKey="portfolio-no-images"
                as="p"
                fallback="Ingen portfolio billeder fundet endnu."
              />
            </div>
          ) : (
            tasks.map((task) => <PortfolioTaskCard key={task.id} task={task} />)
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioPage;
