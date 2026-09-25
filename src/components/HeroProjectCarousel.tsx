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

  // ── Logo size (content-key driven) ────────────────────────────────────
  // `active.logoSize` interpolates (and extrapolates past 100) the logo's
  // height against two *live-measured* references so it always tracks the
  // current responsive breakpoint instead of a hardcoded px value:
  //   0   → the "Udvalgt projekt" label's own single-line text height
  //   100 → the industry heading's own single-line text height
  //   200 → double the 100-value's height, 300 → triple, etc. — values
  //         above 100 are NOT capped, so the logo can be made larger than
  //         the heading (only clamped at 0 so it can't go negative/invert).
  // Both references are read via getComputedStyle(...).lineHeight rather
  // than getBoundingClientRect().height: the heading wraps to 2 lines for
  // longer industry names (e.g. "Safari og rundrejser"), which would
  // roughly double its *box* height and make the same logoSize value
  // render a much bigger logo on that project than on a one-line one.
  // lineHeight is the per-line text height regardless of how many lines
  // the box actually wraps to, so the 100% reference stays consistent
  // across every project at a given breakpoint.
  const labelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const [labelLineHeight, setLabelLineHeight] = useState(0)
  const [headingLineHeight, setHeadingLineHeight] = useState(0)

  useEffect(() => {
    const labelWrapper = labelRef.current
    const headingWrapper = headingRef.current
    if (!labelWrapper || !headingWrapper) return

    // Read (and observe) the element that actually carries the Tailwind
    // text classes (the AdaptiveShadowBox div, the wrapper's only child) —
    // the plain wrapper div itself has no font-size/line-height of its own.
    const labelEl = (labelWrapper.firstElementChild as HTMLElement | null) ?? labelWrapper
    const headingEl = (headingWrapper.firstElementChild as HTMLElement | null) ?? headingWrapper

    const readLineHeight = (el: HTMLElement) => {
      const computed = window.getComputedStyle(el)
      const parsed = parseFloat(computed.lineHeight)
      // 'normal' (unparseable) falls back to the element's own font-size ×
      // 1.2, the browser default ratio for 'normal' line-height.
      if (!Number.isNaN(parsed)) return parsed
      const fontSize = parseFloat(computed.fontSize)
      return Number.isNaN(fontSize) ? 0 : fontSize * 1.2
    }

    const measure = () => {
      setLabelLineHeight(readLineHeight(labelEl))
      setHeadingLineHeight(readLineHeight(headingEl))
    }
    measure()

    // Observing the TEXT elements themselves (not the outer wrapper) is
    // what makes this correctly re-measure across the md: breakpoint: the
    // wrapper's own box doesn't necessarily change size when only the
    // child's font-size changes (e.g. text-sm→text-base keeps the same
    // single-line box height in some cases), so a ResizeObserver on the
    // wrapper could miss a breakpoint change entirely — which was why the
    // logo matched the desktop size but never updated on mobile/resize.
    const ro = new ResizeObserver(measure)
    ro.observe(labelEl)
    ro.observe(headingEl)
    return () => ro.disconnect()
  }, [])

  const rawLogoSize = active.logoSize
  const logoSizePct = Math.max(typeof rawLogoSize === 'number' && !Number.isNaN(rawLogoSize) ? rawLogoSize : 0, 0)
  const logoSizeFraction = logoSizePct / 100
  const measuredLogoHeight =
    labelLineHeight > 0 && headingLineHeight > 0
      ? labelLineHeight + (headingLineHeight - labelLineHeight) * logoSizeFraction
      : null

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
      {/* small category-style label — also the "0%" size reference for the
          logo below. AdaptiveShadowBox doesn't forward refs (it uses its
          own internal ref for shadow sampling), so it's wrapped in a plain
          div that owns labelRef purely for measuring height — doesn't
          affect layout or the shadow effect. */}
      <div ref={labelRef}>
        <AdaptiveShadowBox
          kind="text"
          className="text-sm md:text-base font-medium tracking-wide uppercase text-neutral-200 mb-3"
        >
          Udvalgt projekt
        </AdaptiveShadowBox>
      </div>

      {/* client logo, replacing a client-name heading. Height is driven by
          the CMS "logoSize" field (0–100), interpolated live between the
          label above (0%) and the industry heading below (100%) — see the
          measuredLogoHeight calculation above. Until both are measured
          (first paint) it falls back to the original fixed h-12/h-16 sizing
          so there's no flash of an unsized logo. Wrapped in a plain <a>
          only when the project has a "website" in its CMS entry: no href
          means no pointer cursor / no link semantics, so older entries
          without a website keep behaving exactly as before. */}
      <a
        {...(active.website
          ? { href: active.website, target: '_blank', rel: 'noopener noreferrer' }
          : {})}
        aria-label={active.website ? `Besøg ${active.industry}s hjemmeside (åbner i ny fane)` : undefined}
        className={`mb-3 inline-block ${
          active.website ? 'cursor-pointer transition-opacity duration-200 hover:opacity-80' : ''
        }`}
      >
        <AdaptiveShadowBox kind="logo">
          <img
            src={active.clientLogoUrl}
            alt=""
            // maxWidth is intentionally against the VIEWPORT (94vw), not the
            // hero content column's own (narrow, padded) width: the <a> is
            // inline-block inside a `max-w-screen-xl px-6` column, which on
            // a phone is only a few hundred px wide. Capping width to 100%
            // of THAT column was silently shrinking a wide/landscape logo
            // back down on mobile even though its computed height (from
            // logoSize below) was correctly the same proportion as on
            // desktop — the width cap, not the height calc, was the actual
            // bottleneck. 94vw leaves a small margin so the logo never
            // touches the screen edges on very wide logos at small viewports.
            className={measuredLogoHeight == null ? 'h-12 md:h-16 w-auto object-contain' : 'w-auto object-contain'}
            style={measuredLogoHeight != null ? { height: `${measuredLogoHeight}px`, maxWidth: '94vw' } : { maxWidth: '94vw' }}
          />
        </AdaptiveShadowBox>
      </a>

      {/* big heading — the client's industry — also the "100%" size
          reference for the logo above (see labelRef note on why this is a
          plain wrapping div rather than a ref on AdaptiveShadowBox itself) */}
      <div ref={headingRef}>
        <AdaptiveShadowBox
          kind="text"
          as="div"
          className="text-3xl md:text-5xl font-bold text-white mb-8 md:mb-10 leading-tight"
        >
          {active.industry}
        </AdaptiveShadowBox>
      </div>

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
