import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import EditableContent from './EditableContent';
import { PortfolioMediaPlayer, PortfolioMediaThumb } from './PortfolioMediaView';
import type { PortfolioMediaItem } from '../types';

export interface PortfolioGalleryModalProps {
  open: boolean;
  onClose: () => void;
  /** Task title — shown at the top, styled like the "Se mere" title. */
  title: string;
  /** The gallery: every image / 360° of the task (the primary video is not part of it). */
  items: PortfolioMediaItem[];
}

/**
 * "Se alle billeder" container — same container as the hero's "Se mere"
 * (HeroProjectModal): blurred transparent backdrop, dark bordered box,
 * max-w-4xl, X button, closes on click outside / Escape, page scroll locked,
 * rendered through a portal above the NavBar.
 *
 * Two views inside the same box:
 *   1. grid of every image of the task
 *   2. large view of one image, filling the container (back button + arrows)
 *      — opened by clicking an image in the grid
 */
const PortfolioGalleryModal: React.FC<PortfolioGalleryModalProps> = ({ open, onClose, title, items }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // null = grid, number = large view of items[activeIndex]
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Every time the container opens: start in the grid — or straight in the
  // large view when the task only has one image.
  useEffect(() => {
    if (open) setActiveIndex(items.length === 1 ? 0 : null);
  }, [open, items.length]);

  // Escape / arrow keys.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeIndex !== null && items.length > 1) setActiveIndex(null);
        else onClose();
      } else if (activeIndex !== null && items.length > 1) {
        if (e.key === 'ArrowRight') setActiveIndex((i) => (i === null ? i : (i + 1) % items.length));
        if (e.key === 'ArrowLeft') setActiveIndex((i) => (i === null ? i : (i - 1 + items.length) % items.length));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, activeIndex, items.length]);

  // Lock page scroll + focus the close button (only while open).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Same scrollbar compensation as HeroProjectModal: no layout jump behind the box.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  if (!open || typeof document === 'undefined' || items.length === 0) return null;

  const active = activeIndex !== null ? items[activeIndex] : null;
  const canGoBackToGrid = active !== null && items.length > 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-transparent p-3 backdrop-blur-md md:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Billeder'}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-full w-full max-w-4xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl md:p-8"
      >
        {/* Tilbage-ikon i stedet for X: samme placering og samme størrelse som X'et
            (size 22, p-2, øverst til højre). Lukker galleriet og går tilbage til kortet. */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Tilbage"
          className="absolute right-3 top-3 rounded-full p-2.5 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:right-4 md:top-4"
        >
          <ArrowLeft size={26} />
        </button>

        {/* Title — identical styling to the "Se mere" title */}
        <h2 className="pr-16 text-2xl font-bold leading-tight text-white md:text-4xl">{title}</h2>

        {active === null ? (
          /* ── 1. Grid with all images ─────────────────────────────────── */
          <div className="mt-6 grid grid-cols-2 gap-3 md:mt-8 md:grid-cols-3 md:gap-4">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Åbn billede ${i + 1} af ${items.length}`}
                className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <PortfolioMediaThumb
                  url={item.url}
                  title={`${title} ${i + 1}`}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        ) : (
          /* ── 2. Large view — fills the container ────────────────────── */
          <div className="mt-6 md:mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              {canGoBackToGrid ? (
                <button
                  type="button"
                  onClick={() => setActiveIndex(null)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                >
                  <ArrowLeft size={18} />
                  <EditableContent contentKey="portfolio-page-alle-billeder-tilbage" fallback="Alle billeder" />
                </button>
              ) : (
                <span />
              )}
              {items.length > 1 && (
                <span className="text-sm text-neutral-400">
                  {(activeIndex ?? 0) + 1} / {items.length}
                </span>
              )}
            </div>

            <div className="relative">
              <PortfolioMediaPlayer
                key={active.id}
                url={active.url}
                title={`${title} ${(activeIndex ?? 0) + 1}`}
                fit="contain"
              />
              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => ((i ?? 0) - 1 + items.length) % items.length)}
                    aria-label="Forrige billede"
                    className="absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => ((i ?? 0) + 1) % items.length)}
                    aria-label="Næste billede"
                    className="absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PortfolioGalleryModal;
