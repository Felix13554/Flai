import { createContext } from 'react'

/**
 * HeroFrameContext
 * ─────────────────────────────────────────────────────────────────────────
 * Exposes the live <video> element and its containing <section> to any
 * descendant of <HeroVideoSection>. This is the only thing the adaptive
 * contrast-shadow engine needs to sample what's currently behind the hero
 * logo/subtitle/client-logos: the video element (to draw frames from a
 * canvas) and the section (to know each protected element's position
 * relative to the video, since the video is cropped via object-fit:cover).
 *
 * Kept deliberately tiny — this is plumbing, not state. The heavy lifting
 * (canvas sampling, luminance, smoothing) lives in
 * `hooks/heroContrastEngine.ts`.
 */
export interface HeroFrameContextValue {
  videoRef: React.RefObject<HTMLVideoElement | null>
  sectionRef: React.RefObject<HTMLElement | null>
}

export const HeroFrameContext = createContext<HeroFrameContextValue | null>(null)
