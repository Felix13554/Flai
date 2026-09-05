import React, { useCallback, useEffect, useRef, useState } from 'react'
import AdaptiveShadowBox from './AdaptiveShadowBox'
import type { HeroProjectsContent } from '../content/heroProjects'

export interface HeroProjectCarouselProps {
  data: HeroProjectsContent
  activeIndex: number
  onChangeIndex: (index: number) => void
  /**
   * Playback progress of the active project's video, as a fraction (0–1).
   * Drawn as a line beneath the active number that grows from left to
   * right as the video plays — 0 at the start, 1 when it's finished.
   * Ignored for inactive numbers, which show only the plain (empty) track.
   */
  progress?: number
  /**
   * Auto-advance interval, ms. Set to 0 to disable this fixed-timer
   * auto-advance entirely — the default, since HomePage now advances the
   * carousel by listening for each project's video to finish playing
   * (HeroVideoSection's `onEnded`) rather than switching on a fixed clock.
   * Only pass a non-zero value if you want the OLD fixed-interval behavior
   * (e.g. as a fallback, or if a project's video is unusually long/short).
   */
  autoAdvanceMs?: number
}

/**
 * Bottom-left hero content — structurally modeled on smaafilm.dk's
 * hero-project-carousel (small label → big heading → numbered project
 * tabs), adapted to Flai's data: the heading is the client's industry
 * instead of their name, and a client logo image is shown instead of a
 * client-name text label. Flai's existing text style/colors are kept
 * unchanged — only this structure is new.
 *
 * Purely presentational: which project is active lives in the parent
 * (HomePage), since the parent also has to feed the same index's
 * cloudinary public_id into <HeroVideoSection>.
 */
const HeroProjectCarousel: React.FC<HeroProjectCarouselProps> = ({
  data,
  activeIndex,
  onChangeIndex,
  progress = 0,
  autoAdvanceMs = 0,
}) => {
  const items = data.content
  const active = items[activeIndex]

  // ── Auto-advance ────────────────────────────────────────────────────────
  // Runs alongside manual tab clicks (both are supported, per the task's
  // open question) — a click just jumps the index and the timer below
  // restarts from there, so it never fights the user's choice.
  const timerRef = useRef<number | undefined>(undefined)

  const restartTimer = useCallback(() => {
    window.clearTimeout(timerRef.current)
    if (!autoAdvanceMs || items.length <= 1) return
    timerRef.current = window.setTimeout(() => {
      onChangeIndex((activeIndex + 1) % items.length)
    }, autoAdvanceMs)
  }, [autoAdvanceMs, items.length, activeIndex, onChangeIndex])

  useEffect(() => {
    restartTimer()
    return () => window.clearTimeout(timerRef.current)
  }, [restartTimer])

  const handleSelect = (index: number) => {
    if (index === activeIndex) return
    onChangeIndex(index)
  }

  if (!active) return null

  return (
    <div className="flex flex-col items-start w-full max-w-screen-xl mx-auto px-6 pb-8 md:pb-12">
      {/* small category-style label */}
      <AdaptiveShadowBox kind="text" className="text-sm md:text-base font-medium tracking-wide uppercase text-neutral-200 mb-3">
        Udvalgt projekt
      </AdaptiveShadowBox>

      {/* client logo, replacing a client-name heading — sized a bit larger
          than the industry heading below it (h-12/16 vs the heading's
          text-3xl/5xl) so it reads as the visually dominant element. Wrapped
          in a plain <a> only when the project has a "website" in its CMS
          entry: no href means no pointer cursor / no link semantics, so
          older entries without a website keep behaving exactly as before. */}
      <a
        {...(active.website
          ? { href: active.website, target: '_blank', rel: 'noopener noreferrer' }
          : {})}
        aria-label={active.website ? `Besøg ${active.industry}s hjemmeside (åbner i ny fane)` : undefined}
        className={`mb-3 inline-block max-w-[240px] md:max-w-[320px] ${
          active.website ? 'cursor-pointer transition-opacity duration-200 hover:opacity-80' : ''
        }`}
      >
        <AdaptiveShadowBox kind="logo">
          <img
            src={active.clientLogoUrl}
            alt=""
            className="h-12 md:h-16 w-auto object-contain"
          />
        </AdaptiveShadowBox>
      </a>

      {/* big heading — the client's industry */}
      <AdaptiveShadowBox
        kind="text"
        as="div"
        className="text-3xl md:text-5xl font-bold text-white mb-8 md:mb-10 leading-tight"
      >
        {active.industry}
      </AdaptiveShadowBox>

      {/* numbered project tabs — every number stays fully white/opaque
          regardless of active state (no grey/dim treatment for the
          unselected ones); the active one is instead distinguished by the
          progress line beneath it, which fills left→right as its video
          plays. Inactive numbers show the same line as an empty track, so
          the layout doesn't shift when the active index changes. */}
      <div className="flex items-center gap-5 md:gap-7">
        {items.map((item, index) => {
          const isActive = index === activeIndex
          const fill = isActive ? Math.min(Math.max(progress, 0), 1) : 0
          return (
            <button
              key={item.number}
              type="button"
              onClick={() => handleSelect(index)}
              aria-current={isActive}
              aria-label={`Vis projekt ${item.number}`}
              className="appearance-none bg-transparent border-0 p-0 cursor-pointer flex flex-col items-center gap-1.5"
            >
              <AdaptiveShadowBox as="span" kind="text" className="text-sm md:text-base font-medium text-white">
                {item.number}
              </AdaptiveShadowBox>
              {/* Reserve the same vertical space for every number so they
                  don't jump when the active one changes — only the active
                  number's line is actually visible. */}
              <span className="relative block w-6 md:w-8 h-[2px] rounded-full overflow-hidden">
                {isActive && (
                  <>
                    <span className="absolute inset-0 bg-white/30 rounded-full" />
                    <span
                      className="absolute inset-y-0 left-0 bg-white rounded-full"
                      style={{
                        width: `${fill * 100}%`,
                        transition: 'width 150ms linear',
                      }}
                    />
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default HeroProjectCarousel
