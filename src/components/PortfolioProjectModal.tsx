import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import PortfolioTaskCard from './PortfolioTaskCard';
import type { PortfolioImage } from '../types';

export interface PortfolioProjectModalProps {
  /** The portfolio task (project) to show as a card. */
  task: PortfolioImage | undefined;
  open: boolean;
  onClose: () => void;
}

/**
 * Viser et portfolio-kort (PortfolioTaskCard) oven på den side, man står på —
 * bruges af hero-knappen "Se projekt" på forsiden i stedet for en redirect til
 * Projekter-siden.
 *
 * Baggrunden bag og rundt om kortet er blurret (som i HeroProjectModal).
 * Modalen lukkes med X i kortet, et klik på den blurrede baggrund eller Escape.
 * Sidens scroll er låst, mens den er åben. Vises via en portal, så den altid
 * ligger over NavBar og hero'ens egen stacking context.
 */
const PortfolioProjectModal: React.FC<PortfolioProjectModalProps> = ({ task, open, onClose }) => {
  // Escape + lås sidens scroll, mens modalen er åben.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // "Se alle billeder"-containeren oven på kortet håndterer selv sin Escape —
      // luk ikke projektkortet bag den samtidig.
      if (document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Scroll-lås fjerner scrollbaren og får ellers siden til at rykke i bredden —
    // kompensér med scrollbarens bredde, så baggrunden står helt stille.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, onClose]);

  if (!open || !task || typeof document === 'undefined') return null;

  return createPortal(
    // Ydre lag: den blurrede baggrund. Scroller, hvis kortet er højere end skærmen.
    <div
      className="fixed inset-0 z-[1000] overflow-y-auto bg-transparent backdrop-blur-md"
      role="presentation"
    >
      {/* Indre lag fylder hele skærmen og centrerer kortet; et klik på selve laget
          (altså på baggrunden rundt om kortet — ikke på kortet) lukker modalen. */}
      <div
        className="flex min-h-full items-center justify-center p-3 md:p-8"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="presentation"
      >
        <div role="dialog" aria-modal="true" aria-label={task.title?.trim() || 'Projekt'} className="w-full max-w-4xl">
          <PortfolioTaskCard task={task} withAnchor={false} onClose={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PortfolioProjectModal;
