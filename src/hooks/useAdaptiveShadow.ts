import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react'
import { HeroFrameContext } from '../contexts/HeroFrameContext'
import {
  registerShadowTarget,
  textShadowForIntensity,
  logoShadowForIntensity,
  FALLBACK_INTENSITY,
  type ShadowKind,
} from './heroContrastEngine'

/**
 * useAdaptiveShadow
 * ─────────────────────────────────────────────────────────────────────────
 * Attach the returned `ref` to the actual DOM node you want protected
 * (an <img> logo, a text container, …) and spread `style` onto it.
 *
 * Must be used inside a <HeroVideoSection> to get live sampling — outside
 * of one it just returns the static fallback shadow, so it's always safe
 * to use even if a component is sometimes rendered elsewhere.
 *
 *   const [ref, style] = useAdaptiveShadow<HTMLImageElement>('logo')
 *   <img ref={ref} style={style} src={logo} />
 */
export function useAdaptiveShadow<T extends HTMLElement = HTMLElement>(
  kind: ShadowKind
): [React.RefObject<T>, CSSProperties] {
  const ctx = useContext(HeroFrameContext)
  const elRef = useRef<T | null>(null)
  const [style, setStyle] = useState<CSSProperties>(() =>
    kind === 'text' ? textShadowForIntensity(FALLBACK_INTENSITY) : logoShadowForIntensity(FALLBACK_INTENSITY)
  )

  useEffect(() => {
    if (!ctx) return // Not inside a HeroVideoSection — keep the static fallback.
    const el = elRef.current
    if (!el) return
    return registerShadowTarget(ctx, el, kind, setStyle)
  }, [ctx, kind])

  return [elRef, style]
}
