import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import EditableContent from '../components/EditableContent';
import SEO from '../components/SEO';
import { useData } from '../contexts/DataContext';
import { SkeletonLoader } from '../components/SkeletonLoader';
import PortfolioTaskCard from '../components/PortfolioTaskCard';
import { projectKey } from '../utils/portfolioMedia';

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

  // Siden kan åbne allerede scrollet ned til et projekt — uden animation — på to måder:
  //  1. location.state.scrollToProject (projektets navn).
  //  2. Et projektnavn i URL'en: /portfolio/<navn>. Når der er scrollet, nulstilles
  //     URL'en til /portfolio (replace, så Tilbage-knappen ikke havner på
  //     /portfolio/<navn> igen), og ScrollToTop lader siden blive stående.
  // Det sker i et layout-effect (før browseren tegner siden) med behavior 'instant'.
  // Kører kun én gang pr. besøg. Findes navnet ikke, nulstilles URL'en bare.
  //
  // Hero-knappen "Se projekt" på forsiden sender ikke længere hertil — den åbner
  // kortet (PortfolioTaskCard) i en modal oven på forsiden.
  const location = useLocation();
  const navigate = useNavigate();
  const { project: projectParam } = useParams<{ project?: string }>();
  const scrollToProject = (location.state as { scrollToProject?: string } | null)?.scrollToProject;
  const wantedProject = scrollToProject ?? projectParam;
  const hasHandledRef = useRef(false);

  useLayoutEffect(() => {
    if (hasHandledRef.current || !wantedProject || !isPortfolioLoaded) return;
    hasHandledRef.current = true;
    const wanted = projectKey(wantedProject);
    const target = wanted ? tasks.find((t) => projectKey(t.title) === wanted) : undefined;
    const el = target ? document.getElementById(`portfolio-task-${target.id}`) : null;
    if (el) el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    if (projectParam) navigate('/portfolio', { replace: true, state: { keepScroll: !!el } });
  }, [wantedProject, projectParam, isPortfolioLoaded, tasks, navigate]);

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
