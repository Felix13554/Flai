import React, { useState, useEffect, useRef } from 'react';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  /** Load image eagerly (for above-fold images) */
  priority?: boolean;
  /** Aspect ratio to maintain layout (e.g., "16/9", "4/3", "1/1") */
  aspectRatio?: string;
  /** Custom placeholder while loading */
  placeholder?: React.ReactNode;
  /** Callback when image loads */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
}

/**
 * Optimized Image Component
 * 
 * Features:
 * - Native lazy loading for below-fold images
 * - Async decoding for better performance
 * - Intersection Observer for progressive loading
 * - Aspect ratio preservation to prevent layout shift
 * - Error handling with fallback
 * - Loading placeholder
 * 
 * Usage:
 * ```tsx
 * // Above-fold (hero) images
 * <OptimizedImage 
 *   src="/hero.jpg" 
 *   alt="Hero" 
 *   priority 
 *   aspectRatio="16/9"
 * />
 * 
 * // Below-fold images (lazy loaded)
 * <OptimizedImage 
 *   src="/product.jpg" 
 *   alt="Product" 
 *   aspectRatio="4/3"
 * />
 * ```
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  priority = false,
  aspectRatio,
  placeholder,
  onLoad,
  onError,
  className = '',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);

  // Intersection Observer for non-priority images
  useEffect(() => {
    if (priority || !imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px', // Start loading 50px before visible
      }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Container style with aspect ratio
  const containerStyle: React.CSSProperties = aspectRatio
    ? { aspectRatio, position: 'relative', overflow: 'hidden' }
    : { position: 'relative', overflow: 'hidden', minHeight: isLoaded ? undefined : '1px' };

  // Image style
  const imageStyle: React.CSSProperties = {
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
    display: 'block',
    ...(aspectRatio && { width: '100%', height: '100%', objectFit: 'cover' }),
  };

  return (
    <div 
      ref={imgRef} 
      style={containerStyle}
      className={`optimized-image-container ${className}`}
    >
      {/* Loading placeholder */}
      {!isLoaded && !hasError && (
        <div 
          className="absolute inset-0 bg-neutral-800 animate-pulse"
          style={aspectRatio ? { aspectRatio } : {}}
        >
          {placeholder}
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div 
          className="absolute inset-0 bg-neutral-800 flex items-center justify-center text-neutral-500"
          style={aspectRatio ? { aspectRatio } : {}}
        >
          <svg 
            className="w-12 h-12" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
        </div>
      )}

      {/* Actual image */}
      {shouldLoad && !hasError && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          style={imageStyle}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      )}
    </div>
  );
};

/**
 * Background Image Component with Lazy Loading
 * 
 * Usage:
 * ```tsx
 * <OptimizedBackgroundImage 
 *   src="/bg.jpg" 
 *   className="hero-section"
 * >
 *   <h1>Content over background</h1>
 * </OptimizedBackgroundImage>
 * ```
 */
export const OptimizedBackgroundImage: React.FC<{
  src: string;
  children: React.ReactNode;
  className?: string;
  priority?: boolean;
}> = ({ src, children, className = '', priority = false }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (priority || !containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!shouldLoad) return;

    const img = new Image();
    img.src = src;
    img.onload = () => setIsLoaded(true);
  }, [shouldLoad, src]);

  const backgroundStyle: React.CSSProperties = {
    backgroundImage: isLoaded ? `url(${src})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    transition: 'background-image 0.3s ease-in-out',
  };

  return (
    <div 
      ref={containerRef}
      className={className}
      style={backgroundStyle}
    >
      {!isLoaded && (
        <div className="absolute inset-0 bg-neutral-800 animate-pulse" />
      )}
      {children}
    </div>
  );
};

/**
 * Preload images for next page
 * 
 * Usage:
 * ```tsx
 * // In HomePage - preload products page images
 * useEffect(() => {
 *   const timer = setTimeout(() => {
 *     preloadImages([
 *       '/product1.jpg',
 *       '/product2.jpg',
 *       '/product3.jpg'
 *     ]);
 *   }, 2000); // Preload after 2 seconds
 *   return () => clearTimeout(timer);
 * }, []);
 * ```
 */
export const preloadImages = (urls: string[]) => {
  urls.forEach(url => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
  });
};

/**
 * Responsive Image Component with srcset
 * Automatically generates responsive image sources
 * 
 * Usage:
 * ```tsx
 * <ResponsiveImage
 *   src="/image.jpg"
 *   alt="Product"
 *   sizes="(max-width: 768px) 100vw, 50vw"
 *   aspectRatio="16/9"
 * />
 * ```
 */
export const ResponsiveImage: React.FC<{
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  aspectRatio?: string;
  className?: string;
}> = ({ src, alt, sizes, priority = false, aspectRatio, className }) => {
  // Generate srcset from base image URL
  // Assumes images are stored with width suffixes: image-400.jpg, image-800.jpg, etc.
  const generateSrcSet = (baseSrc: string) => {
    const widths = [400, 800, 1200, 1600];
    const ext = baseSrc.split('.').pop();
    const base = baseSrc.replace(`.${ext}`, '');
    
    return widths
      .map(w => `${base}-${w}.${ext} ${w}w`)
      .join(', ');
  };

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      srcSet={generateSrcSet(src)}
      sizes={sizes || '100vw'}
      priority={priority}
      aspectRatio={aspectRatio}
      className={className}
    />
  );
};

export default OptimizedImage;
