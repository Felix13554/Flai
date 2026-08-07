import React from 'react'
import { useAdaptiveShadow } from '../hooks/useAdaptiveShadow'
import type { ShadowKind } from '../hooks/heroContrastEngine'

export interface AdaptiveShadowBoxProps {
  /** 'text' → multi-layer text-shadow behind the box's text content.
   *  'logo' → drop-shadow filter around whatever's painted inside the box
   *  (works for a wrapping <div> exactly as it would applied to the <img>
   *  directly, since there's nothing else in the box to affect the silhouette). */
  kind: ShadowKind
  as?: 'div' | 'span'
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

/**
 * Wraps hero content (the FLAI logo, the subtitle, a client logo, …) so its
 * shadow intensity tracks how bright the video is right behind it, instead
 * of a single static shadow that's either too weak on bright shots or too
 * heavy-handed on dark ones. Must render somewhere inside a
 * <HeroVideoSection> to get live sampling — otherwise it just keeps the
 * safe static fallback (see useAdaptiveShadow).
 */
const AdaptiveShadowBox: React.FC<AdaptiveShadowBoxProps> = ({
  kind,
  as = 'div',
  className,
  style,
  children,
}) => {
  const [ref, shadowStyle] = useAdaptiveShadow<HTMLDivElement & HTMLSpanElement>(kind)
  const Tag = as
  return (
    <Tag ref={ref} className={className} style={{ ...style, ...shadowStyle }}>
      {children}
    </Tag>
  )
}

export default AdaptiveShadowBox
