import React from 'react';

interface SkeletonLoaderProps {
  className?: string;
  width?: string;
  height?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  lines?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  className = '',
  width = '100%',
  height = '1rem',
  variant = 'text',
  lines = 1
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'rectangular':
        return 'rounded-md';
      case 'text':
      default:
        return 'rounded';
    }
  };

  const skeletonClasses = `
    bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 
    animate-shimmer bg-[length:200%_100%] 
    ${getVariantClasses()} 
    ${className}
  `;

  if (lines > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={skeletonClasses}
            style={{
              width: index === lines - 1 ? '75%' : width,
              height
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={skeletonClasses}
      style={{ width, height }}
    />
  );
};

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({ lines = 3, className = '' }) => (
  <SkeletonLoader variant="text" lines={lines} className={className} />
);

interface SkeletonImageProps {
  width?: string;
  height?: string;
  className?: string;
}

export const SkeletonImage: React.FC<SkeletonImageProps> = ({ 
  width = '100%', 
  height = '200px', 
  className = '' 
}) => (
  <SkeletonLoader variant="rectangular" width={width} height={height} className={className} />
);

interface SkeletonButtonProps {
  width?: string;
  height?: string;
  className?: string;
}

export const SkeletonButton: React.FC<SkeletonButtonProps> = ({ 
  width = '120px', 
  height = '40px', 
  className = '' 
}) => (
  <SkeletonLoader variant="rectangular" width={width} height={height} className={className} />
);