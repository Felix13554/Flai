import React, { useState, useEffect, useMemo } from 'react';
import { Package, ChevronDown, ChevronUp } from 'lucide-react';
import EditableContent from '../components/EditableContent';
import SEO from '../components/SEO';
import { useData } from '../contexts/DataContext';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { supabase } from '../utils/supabase';
import PanoramaViewer from '../components/PanoramaViewer';

// Portfolio-specific skeleton that matches actual portfolio card dimensions
const PortfolioCardSkeleton: React.FC = () => (
  <div className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700">
    <div className="relative">
      <div className="w-full aspect-video bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%] rounded-t-lg" />
    </div>
    <div className="p-4">
      <SkeletonLoader height="1.25rem" className="mb-1" width="60%" />
      <SkeletonLoader height="0.875rem" className="mb-2" width="40%" />
      <SkeletonLoader height="0.875rem" width="80%" />
    </div>
  </div>
);

interface Bundle {
  id: string;
  name: string;
  created_at: string;
}

const PortfolioPage: React.FC = () => {
  const { portfolioImages, isPortfolioLoaded, getContent } = useData();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBundles();
  }, []);

  const loadBundles = async () => {
    try {
      const { data, error } = await supabase
        .from('portfolio_bundles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBundles(data || []);
    } catch (err) {
      console.error('Error loading bundles:', err);
    }
  };

  const toggleBundle = (bundleId: string) => {
    setExpandedBundles(prev => {
      const newSet = new Set(prev);
      newSet.has(bundleId) ? newSet.delete(bundleId) : newSet.add(bundleId);
      return newSet;
    });
  };

  // ─── Pure array-based ordering ─────────────────────────────────────────────
  const imageKey = portfolioImages.map(i => `${i.id}:${i.array ?? 50}`).join(',');

  const imageScores = useMemo(() => {
    if (portfolioImages.length === 0) return new Map<string, number>();
    const map = new Map<string, number>();
    portfolioImages.forEach(img => {
      map.set(img.id, img.array ?? 50);
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey]);

  const sortedImages = useMemo(() => {
    return [...portfolioImages].sort((a, b) => {
      const scoreA = imageScores.get(a.id) ?? 0;
      const scoreB = imageScores.get(b.id) ?? 0;
      return scoreB - scoreA;
    });
  }, [portfolioImages, imageScores]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const getMediaType = (url: string): 'panorama' | 'youtube' | 'image' => {
    if (url.startsWith('panorama:')) return 'panorama';
    if (url.startsWith('youtube:'))  return 'youtube';
    return 'image';
  };

  const renderMedia = (image: any) => {
    const mediaType = getMediaType(image.image_url);

    if (mediaType === 'panorama') {
      const rawUrl = image.image_url.replace('panorama:', '');
      return (
        <div className="relative w-full">
          <PanoramaViewer
            url={rawUrl}
            title={image.title}
            autoRotate={0.8}
            className="w-full"
          />
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 pointer-events-none">
            <svg className="w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <ellipse cx="12" cy="12" rx="5" ry="10" />
              <path d="M2 12h20" />
            </svg>
            <span className="text-white text-xs font-bold tracking-wider">360°</span>
          </div>
        </div>
      );
    }

    if (mediaType === 'youtube') {
      const videoId = image.image_url.split(':')[1];
      return (
        <div className="relative w-full pt-[56.25%]">
          <iframe
            className="absolute inset-0 w-full h-full rounded-lg"
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      );
    }

    return (
      <img
        src={image.image_url}
        alt={image.title}
        className="w-full aspect-video object-cover rounded-lg"
      />
    );
  };

  const renderImageCard = (image: any) => (
    <div key={image.id} className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700">
      <div className="relative">{renderMedia(image)}</div>
      <div className="p-4 flex items-stretch gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium mb-1">{image.title}</h3>
          {image.image_name && (
            <p className="text-sm text-neutral-400 mb-2">{image.image_name}</p>
          )}
          {image.description && (
            <p className="text-sm text-neutral-300 leading-relaxed">{image.description}</p>
          )}
        </div>
        {image.business_logo_url && (
          <a
            href={image.business_website_url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center justify-end"
            title={image.business_website_url ? 'Besøg hjemmeside' : undefined}
            onClick={(e) => { if (!image.business_website_url) e.preventDefault(); }}
          >
            <img
              src={image.business_logo_url}
              alt=""
              className="h-full max-h-16 w-auto object-contain"
            />
          </a>
        )}
      </div>
    </div>
  );

  const getThumbnailElement = (imageUrl: string, className: string = '') => {
    if (imageUrl.startsWith('panorama:')) {
      return (
        <div className={`w-full h-full bg-neutral-900 flex items-center justify-center ${className}`}>
          <svg className="w-12 h-12 text-primary/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <ellipse cx="12" cy="12" rx="5" ry="10" />
            <path d="M2 12h20" />
          </svg>
        </div>
      );
    }
    if (imageUrl.startsWith('youtube:')) {
      return (
        <div className={`w-full h-full bg-neutral-800 flex items-center justify-center ${className}`}>
          <svg className="w-12 h-12 text-neutral-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
          </svg>
        </div>
      );
    }
    return <img src={imageUrl} alt="" className={`w-full h-full object-cover ${className}`} />;
  };

  // ─── Grid items ─────────────────────────────────────────────────────────────
  const renderGrid = () => {
    const renderedBundles = new Set<string>();

    return sortedImages.map((image) => {
      if (image.bundle_id) {
        if (renderedBundles.has(image.bundle_id)) return null;
        renderedBundles.add(image.bundle_id);

        const bundle = bundles.find(b => b.id === image.bundle_id);
        const bundleImages = sortedImages.filter(img => img.bundle_id === image.bundle_id);
        const isExpanded = expandedBundles.has(image.bundle_id);

        if (!isExpanded) {
          return (
            <div key={`bundle-${image.bundle_id}`} className="relative pb-8 pr-8">
              <div className="relative cursor-pointer group" onClick={() => toggleBundle(image.bundle_id!)}>
                {bundleImages.length > 2 && bundleImages[2] && (
                  <div className="absolute inset-0 rounded-xl border-2 border-neutral-600 transform translate-x-6 translate-y-6 transition-all duration-300 group-hover:translate-x-8 group-hover:translate-y-8 overflow-hidden origin-top-left">
                    {getThumbnailElement(bundleImages[2].image_url, '')}
                    <div className="absolute inset-0 bg-gradient-to-br from-neutral-900/40 via-neutral-900/50 to-neutral-900/60" />
                  </div>
                )}
                {bundleImages.length > 1 && bundleImages[1] && (
                  <div className="absolute inset-0 rounded-xl border-2 border-neutral-600 transform translate-x-3 translate-y-3 transition-all duration-300 group-hover:translate-x-4 group-hover:translate-y-4 overflow-hidden origin-top-left">
                    {getThumbnailElement(bundleImages[1].image_url, '')}
                    <div className="absolute inset-0 bg-gradient-to-br from-neutral-900/30 via-neutral-900/40 to-neutral-900/50" />
                  </div>
                )}
                <div className="relative bg-neutral-800 rounded-xl overflow-hidden border-2 border-neutral-600 transition-all duration-300">
                  <div className="relative">
                    {bundleImages[0].image_url.startsWith('panorama:') ? (
                      <div className="w-full aspect-video bg-neutral-900 flex flex-col items-center justify-center gap-2">
                        <svg className="w-14 h-14 text-primary/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <ellipse cx="12" cy="12" rx="5" ry="10" />
                          <path d="M2 12h20" />
                        </svg>
                        <span className="text-xs text-neutral-500"><EditableContent contentKey="portfolio-page-360-panorama" fallback="360° Panorama" /></span>
                      </div>
                    ) : (
                      renderMedia(bundleImages[0])
                    )}
                    <div className="absolute top-3 right-3 bg-neutral-900/90 backdrop-blur-sm px-3 py-2 rounded-lg flex items-center space-x-2 border border-neutral-600">
                      <Package size={16} className="text-neutral-300" />
                      <span className="text-sm font-medium">{bundleImages.length}</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Package size={16} className="text-neutral-300" />
                        <h3 className="font-semibold">{bundle?.name || 'Bundle'}</h3>
                      </div>
                      <button className="text-neutral-300 hover:text-white text-sm font-medium flex items-center">
                        <EditableContent contentKey="portfolio-page-se-alle" fallback="Se alle" /> <ChevronDown size={16} className="ml-1" />
                      </button>
                    </div>
                    <p className="text-sm text-neutral-400 mt-1">
                      {bundleImages.length} {bundleImages.length === 1 ? 'billede' : 'billeder'}
                    </p>
                    {bundleImages[0]?.description && (
                      <p className="text-sm text-neutral-300 mt-2 leading-relaxed line-clamp-2">
                        {bundleImages[0].description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // Expanded bundle — spans full width, then individual cards in 2-col grid
        return (
          <React.Fragment key={`bundle-${image.bundle_id}`}>
            <div className="col-span-1 md:col-span-2">
              <div
                className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-4 cursor-pointer hover:from-primary/15 hover:to-primary/10 transition-all border-2 border-primary/30"
                onClick={() => toggleBundle(image.bundle_id!)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ChevronUp size={24} className="text-primary" />
                    <Package size={24} className="text-primary" />
                    <div>
                      <h3 className="text-xl font-semibold">{bundle?.name || 'Bundle'}</h3>
                      <p className="text-neutral-400 text-sm">
                        {bundleImages.length} {bundleImages.length === 1 ? 'billede' : 'billeder'}
                      </p>
                    </div>
                  </div>
                  <button className="text-primary hover:text-primary/80 font-medium"><EditableContent contentKey="portfolio-page-luk" fallback="Luk" /></button>
                </div>
              </div>
            </div>
            {bundleImages.map((bundleImage, index) => (
              <div
                key={bundleImage.id}
                className="animate-in fade-in slide-in-from-top-4"
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
              >
                <div className="relative">
                  <div className="absolute -inset-1 bg-primary/10 rounded-xl" />
                  <div className="relative border-2 border-primary/40 rounded-xl overflow-hidden">
                    {renderImageCard(bundleImage)}
                  </div>
                </div>
              </div>
            ))}
          </React.Fragment>
        );
      }

      return renderImageCard(image);
    });
  };

  return (
    <div className="pt-20 pb-16">
      <SEO
        title={getContent('portfolio-page-title', "Vores arbejde")}
        description="Se eksempler på vores dronefotografering og dronefilmning. Flai leverer professionelle luftoptagelser i hele Danmark."
        canonical="/portfolio"
      />
      <div className="bg-primary/10 py-12 mb-12">
        <div className="container">
          <EditableContent
            contentKey="portfolio-page-title"
            as="h1"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
            fallback="Vores arbejde"
          />
          <EditableContent
            contentKey="portfolio-page-subtitle"
            as="p"
            className="text-center text-lg text-neutral-300 max-w-2xl mx-auto"
            fallback="Udforsk vores seneste film og projekter."
          />
        </div>
      </div>
      <div className="container">
        {!isPortfolioLoaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {Array.from({ length: 4 }).map((_, i) => <PortfolioCardSkeleton key={i} />)}
          </div>
        ) : portfolioImages.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">
            <EditableContent
              contentKey="portfolio-no-images"
              as="p"
              fallback="Ingen portfolio billeder fundet endnu."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {renderGrid()}
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioPage;
