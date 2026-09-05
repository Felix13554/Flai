import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link, ChevronLeft, ChevronRight } from 'lucide-react';
import { Product } from '../types';
import { SkeletonLoader, SkeletonText, SkeletonButton } from './SkeletonLoader';
import EditableContent from './EditableContent';
import PanoramaViewer from './PanoramaViewer';

interface ProductCardSkeletonProps {
  className?: string;
}

export const ProductCardSkeleton: React.FC<ProductCardSkeletonProps> = ({ className = '' }) => (
  <div className={`bg-neutral-800 rounded-xl shadow-md overflow-hidden border border-neutral-700 ${className}`}>
    <div className="w-full aspect-video bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 animate-shimmer bg-[length:200%_100%] rounded-t-lg" />
    <div className="p-4">
      <SkeletonLoader height="1.5rem" className="mb-2" />
      <SkeletonText lines={2} className="mb-4" />
      <div className="mt-4">
        <div className="flex items-center mb-3">
          <SkeletonLoader width="80px" height="1.5rem" />
          <SkeletonButton width="100px" height="36px" className="ml-4 flex-1" />
        </div>
        <div className="flex flex-col space-y-2">
          <SkeletonButton width="100%" height="80px" />
          <SkeletonButton width="100%" height="80px" />
        </div>
      </div>
    </div>
  </div>
);

interface ProductCardProps {
  product: Product;
}

const SWIPE_THRESHOLD = 40;

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwiping = useRef(false);

  const handleOrderClick = () => navigate(`/booking/${product.id}`);
  const handleSimpleRequestClick = () =>
    navigate(`/simple-request?product_id=${product.id}&product_name=${encodeURIComponent(product.name)}`);
  const handleViewProduct = () => navigate(`/product/${encodeURIComponent(product.name)}`);

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentImageIndex((prev) =>
      prev === 0 ? product.images.length - 1 : prev - 1
    );
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentImageIndex((prev) =>
      prev === product.images.length - 1 ? 0 : prev + 1
    );
  };

  const currentImage       = product.images[currentImageIndex];
  const isCurrentYoutube   = currentImage?.startsWith('youtube:');
  const isCurrentPanorama  = currentImage?.startsWith('panorama:');
  const hasMultipleImages  = product.images.length > 1;

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isCurrentYoutube || isCurrentPanorama) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (isCurrentYoutube || isCurrentPanorama || !hasMultipleImages) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (isCurrentYoutube || isCurrentPanorama || !hasMultipleImages) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      isSwiping.current = true;
      if (deltaX < 0) nextImage();
      else prevImage();
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setTimeout(() => { isSwiping.current = false; }, 100);
  };

  const renderMedia = () => {
    // ── 360° Panorama ──────────────────────────────────────────────────────────
    if (isCurrentPanorama) {
      const rawUrl = currentImage.replace('panorama:', '');
      return (
        <div className="relative w-full">
          <PanoramaViewer
            url={rawUrl}
            title={product.name}
            autoRotate={0.6}
            className="w-full"
          />
          {/* 360° badge */}
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

    // ── YouTube ────────────────────────────────────────────────────────────────
    if (isCurrentYoutube) {
      const videoId = currentImage.split(':')[1];
      return (
        <div className="relative w-full aspect-video">
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

    // ── Regular image ──────────────────────────────────────────────────────────
    return (
      <div className="w-full aspect-video overflow-hidden">
        <img
          src={currentImage || "https://images.pexels.com/photos/336232/pexels-photo-336232.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    );
  };

  // Arrows hidden for panorama (Pannellum handles its own drag) and YouTube
  const showArrows =
    isHovering &&
    hasMultipleImages &&
    !isCurrentYoutube &&
    !isCurrentPanorama;

  return (
    <div className="card hover:shadow-lg group">
      <div
        className="relative overflow-hidden rounded-lg mb-4"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {renderMedia()}

        {showArrows && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/75 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/75 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}

        {hasMultipleImages && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {product.images.map((img, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentImageIndex ? 'bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <h3 className="text-xl font-semibold">
        {product.name}
      </h3>
      <p className="text-neutral-300 my-3 line-clamp-3">{product.description}</p>

      {product.links && product.links.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {product.links.map((link, index) => (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-sm text-primary hover:text-primary-dark transition-colors"
            >
              <Link size={14} className="mr-1" />
              {link.title}
            </a>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center mb-3">
          <span className="text-xl font-bold text-primary whitespace-nowrap">
            {product.price} <EditableContent contentKey="product-card-kr" fallback="kr" />
          </span>
          <button onClick={handleViewProduct} className="ml-4 flex-1 btn-secondary text-sm px-4 py-2">
            <EditableContent contentKey="product-card-se-detaljer" fallback="Se detaljer" />
          </button>
        </div>

        <div className="flex flex-col space-y-2">
          <button
            onClick={handleSimpleRequestClick}
            className="w-full btn-primary text-sm px-4 py-3 flex flex-col items-center"
          >
            <span className="font-bold text-base block">
              <EditableContent contentKey="product-card-smart-booking" fallback="Smart Booking" />
            </span>
            <span className="text-xs opacity-80 font-normal">
              <EditableContent
                contentKey="product-card-vi-vaelger-dato-og-tid"
                fallback="Vi vælger dato og tid efter lysforholdende"
              />
            </span>
          </button>

          <button
            onClick={handleOrderClick}
            className="w-full btn-secondary text-sm px-4 py-3 border-2 border-primary/30 hover:border-primary/60 transition-colors flex flex-col items-center"
          >
            <span className="font-bold text-base block">
              <EditableContent contentKey="product-card-book-nu" fallback="Book Nu" />
            </span>
            <span className="text-xs opacity-80 font-normal text-neutral-400">
              <EditableContent
                contentKey="product-card-du-vaelger-selv-tid-og"
                fallback="Du vælger selv tid og dato efter dine behov"
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
