import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import CloudinaryVideoPlayer from './CloudinaryVideoPlayer'
import { extractCloudinaryPublicId } from '../utils/heroPreload'
import type { HeroProjectItem } from '../content/heroProjects'

export interface HeroProjectModalProps {
  /** The project to show (the active hero project). */
  project: HeroProjectItem | undefined
  open: boolean
  onClose: () => void
}

/**
 * "Se mere" container — opens over the hero video when the visitor presses
 * the "Se mere" button on a hero project (HomePage also pauses the hero video
 * while this is open, via HeroVideoSection's `paused` prop).
 *
 * Layout, top to bottom:
 *   1. project title       (`industry` from the CMS "content" key)
 *   2. project description (`description` from the CMS "content" key)
 *   3. "Se videoen med lyd"
 *   4. the project's Cloudinary video — NO autoplay and NOT muted (the
 *      visitor presses play, and it then plays with sound)
 *
 * Closes on the X button, a click on the dark backdrop, or Escape. Page
 * scroll is locked while open. Rendered through a portal so it always sits
 * above the NavBar (z-50) and the hero's own stacking context.
 */
const HeroProjectModal: React.FC<HeroProjectModalProps> = ({ project, open, onClose }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Escape to close + lock page scroll + focus the close button.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open || !project || typeof document === 'undefined') return null

  const publicId = extractCloudinaryPublicId(project.cloudinaryVideoUrl)
  const description = project.description?.trim()

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 md:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={project.industry}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-full overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 md:p-8 shadow-2xl"
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Luk"
          className="absolute top-3 right-3 md:top-4 md:right-4 rounded-full p-2 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <X size={22} />
        </button>

        {/* 1. Title */}
        <h2 className="pr-10 text-2xl md:text-4xl font-bold leading-tight text-white">
          {project.industry}
        </h2>

        {/* 2. Description (from the "content" key) */}
        {description && (
          <p className="mt-4 md:mt-5 whitespace-pre-line text-base md:text-lg leading-relaxed text-neutral-300">
            {description}
          </p>
        )}

        {/* 3 + 4. Label directly above the video, then the video */}
        {publicId && (
          <div className="mt-6 md:mt-8">
            <p className="mb-2 text-sm md:text-base font-medium text-neutral-200">
              Se videoen med lyd
            </p>
            <CloudinaryVideoPlayer
              // key → a fresh player (no leftover playback) for every project
              key={publicId}
              publicId={publicId}
              title={project.industry}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default HeroProjectModal
