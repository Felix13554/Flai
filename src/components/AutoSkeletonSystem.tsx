import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * AutoSkeletonSystem - Automatic skeleton generation for lazy-loaded pages
 * 
 * ARCHITECTURE:
 * 1. Wraps page content and scans DOM as elements mount
 * 2. Creates position-matched skeletons for unloaded elements
 * 3. Works alongside EditableContent skeletons (doesn't duplicate them)
 * 4. Progressively hides skeletons as real content loads
 * 5. Zero layout shift - skeletons overlay in exact positions
 * 
 * PERFORMANCE:
 * - Uses requestAnimationFrame for smooth scanning
 * - Debounced mutations for efficiency
 * - Automatic cleanup after 3s
 * - Skips elements with existing skeleton classes
 * 
 * NO IMPORTS NEEDED IN PAGES - completely automatic
 */

interface SkeletonData {
  id: string;
  type: 'text' | 'image' | 'block' | 'button';
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  lines?: number;
  priority: number; // Higher = render first
}

interface AutoSkeletonSystemProps {
  children: React.ReactNode;
  enabled?: boolean;
}

export const AutoSkeletonSystem: React.FC<AutoSkeletonSystemProps> = ({ 
  children, 
  enabled = true 
}) => {
  const [skeletons, setSkeletons] = useState<SkeletonData[]>([]);
  const [isActive, setIsActive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const processedElementsRef = useRef<WeakSet<Element>>(new WeakSet());

  // Check if element should be skipped
  const shouldSkipElement = useCallback((element: Element): boolean => {
    const tagName = element.tagName.toLowerCase();
    
    // Skip non-visual elements
    if (['script', 'style', 'noscript', 'svg', 'path', 'meta', 'link', 'br', 'hr'].includes(tagName)) {
      return true;
    }

    // Skip elements that already have skeleton loaders
    if (
      element.classList.contains('animate-shimmer') ||
      element.classList.contains('animate-pulse') ||
      element.getAttribute('aria-hidden') === 'true'
    ) {
      return true;
    }

    // Skip hidden or tiny elements
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    if (
      rect.width < 10 || 
      rect.height < 8 || 
      style.display === 'none' || 
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) < 0.1
    ) {
      return true;
    }

    // Skip elements with loaded content
    const text = element.textContent?.trim();
    if (text && text.length > 2 && !text.includes('...') && text !== 'Loading') {
      return true;
    }

    // Skip loaded images
    if (tagName === 'img') {
      const img = element as HTMLImageElement;
      if (img.complete && img.naturalHeight > 0) {
        return true;
      }
    }

    // Skip if already processed
    if (processedElementsRef.current.has(element)) {
      return true;
    }

    return false;
  }, []);

  // Determine element type for skeleton
  const getElementType = useCallback((element: Element, style: CSSStyleDeclaration): SkeletonData['type'] => {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'img' || style.backgroundImage !== 'none') {
      return 'image';
    }
    
    if (tagName === 'button' || element.classList.contains('btn')) {
      return 'button';
    }
    
    // Check for text content
    const text = element.textContent?.trim();
    if (text && element.children.length === 0) {
      return 'text';
    }
    
    return 'block';
  }, []);

  // Calculate priority (higher number = more important)
  const calculatePriority = useCallback((element: Element, rect: DOMRect): number => {
    let priority = 0;
    
    // Viewport position (higher in viewport = higher priority)
    priority += Math.max(0, 100 - (rect.top / window.innerHeight) * 100);
    
    // Size (larger elements = higher priority)
    priority += (rect.width * rect.height) / 10000;
    
    // Headers and images get bonus
    const tagName = element.tagName.toLowerCase();
    if (['h1', 'h2', 'h3'].includes(tagName)) priority += 50;
    if (tagName === 'img') priority += 30;
    
    return priority;
  }, []);

  // Scan DOM efficiently
  const scanDOM = useCallback(() => {
    if (!containerRef.current || !enabled || !isActive) return;

    const newSkeletons: SkeletonData[] = [];
    const elements = containerRef.current.querySelectorAll('*');
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    elements.forEach((element) => {
      if (shouldSkipElement(element)) return;

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const type = getElementType(element, style);
      
      // Calculate lines for text
      let lines: number | undefined;
      if (type === 'text') {
        const lineHeight = parseFloat(style.lineHeight) || 20;
        lines = Math.max(1, Math.min(3, Math.ceil(rect.height / lineHeight)));
      }

      const priority = calculatePriority(element, rect);

      newSkeletons.push({
        id: `skel-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type,
        rect: {
          top: rect.top + scrollY,
          left: rect.left + scrollX,
          width: rect.width,
          height: rect.height,
        },
        lines,
        priority,
      });

      processedElementsRef.current.add(element);
    });

    // Sort by priority and limit to top 50 for performance
    const sortedSkeletons = newSkeletons
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 50);

    setSkeletons(sortedSkeletons);
  }, [enabled, isActive, shouldSkipElement, getElementType, calculatePriority]);

  // Initial scan with requestAnimationFrame
  useEffect(() => {
    if (!enabled) return;

    rafRef.current = requestAnimationFrame(() => {
      scanTimeoutRef.current = setTimeout(scanDOM, 100);
    });

    // Auto-deactivate after 2 seconds
    const deactivateTimer = setTimeout(() => {
      setIsActive(false);
      setSkeletons([]);
    }, 2000);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      clearTimeout(deactivateTimer);
    };
  }, [enabled, scanDOM]);

  // Observe DOM changes with debouncing
  useEffect(() => {
    if (!containerRef.current || !enabled || !isActive) return;

    let debounceTimeout: NodeJS.Timeout;

    observerRef.current = new MutationObserver(() => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(scanDOM);
      }, 150);
    });

    observerRef.current.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [enabled, isActive, scanDOM]);

  // Render skeleton element
  const renderSkeleton = useCallback((skeleton: SkeletonData) => {
    const baseClass = 'absolute bg-neutral-800/50 backdrop-blur-sm animate-pulse';
    const style: React.CSSProperties = {
      top: skeleton.rect.top,
      left: skeleton.rect.left,
      width: skeleton.rect.width,
      height: skeleton.rect.height,
      zIndex: 9999,
      pointerEvents: 'none',
    };

    switch (skeleton.type) {
      case 'image':
        return (
          <div
            key={skeleton.id}
            className={`${baseClass} rounded-lg`}
            style={style}
          />
        );

      case 'text':
        if (skeleton.lines && skeleton.lines > 1) {
          return (
            <div
              key={skeleton.id}
              className="absolute flex flex-col gap-2"
              style={{ ...style, zIndex: 9999 }}
            >
              {Array.from({ length: skeleton.lines }).map((_, i) => (
                <div
                  key={i}
                  className="bg-neutral-800/50 rounded animate-pulse"
                  style={{
                    height: `${skeleton.rect.height / skeleton.lines! - 8}px`,
                    width: i === skeleton.lines! - 1 ? '70%' : '100%',
                  }}
                />
              ))}
            </div>
          );
        }
        return (
          <div
            key={skeleton.id}
            className={`${baseClass} rounded`}
            style={style}
          />
        );

      case 'button':
        return (
          <div
            key={skeleton.id}
            className={`${baseClass} rounded-lg`}
            style={style}
          />
        );

      default:
        return (
          <div
            key={skeleton.id}
            className={`${baseClass} rounded`}
            style={style}
          />
        );
    }
  }, []);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Skeleton overlay - only shown briefly during initial load */}
      {isActive && skeletons.length > 0 && (
        <div 
          className="fixed inset-0 pointer-events-none" 
          style={{ zIndex: 9998 }}
          aria-hidden="true"
        >
          {skeletons.map(renderSkeleton)}
        </div>
      )}

      {/* Actual page content */}
      <div ref={containerRef}>
        {children}
      </div>
    </>
  );
};

export default AutoSkeletonSystem;