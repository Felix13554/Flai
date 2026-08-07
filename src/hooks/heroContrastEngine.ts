import type { CSSProperties, RefObject } from 'react'
import type { HeroFrameContextValue } from '../contexts/HeroFrameContext'

/**
 * heroContrastEngine
 * ─────────────────────────────────────────────────────────────────────────
 * Per-frame(ish) brightness sampling for the hero video, driving how strong
 * the drop-shadow/text-shadow behind the logo, subtitle, and client logos
 * needs to be to stay readable against whatever footage is currently
 * playing underneath.
 *
 * How it works
 * 1. One tiny offscreen canvas per <HeroVideoSection> instance (160px wide,
 *    height matched to the section's aspect ratio).
 * 2. Each analysis tick, the current video frame is drawn into that canvas
 *    — accounting for the `object-fit: cover` crop, so canvas pixels line
 *    up 1:1 (as fractions) with what's visible on screen.
 * 3. For every registered element (logo, subtitle, a client logo, …) we
 *    read back just the pixels under its bounding box and average their
 *    WCAG-weighted luminance (0.2126R + 0.7152G + 0.0722B).
 * 4. That luminance maps to a 0–1 "shadow intensity", smoothed over time
 *    so a single bright flash in the footage doesn't snap the shadow
 *    instantly — and eased further on the CSS side via `transition`.
 *
 * On sampling rate: the footage runs at 30fps, but a *shadow* only needs to
 * track the footage's slowly-changing average brightness, not every frame —
 * sampling at video-frame-rate and re-running getImageData 30x/sec per
 * element would burn CPU for a change nobody can perceive faster than the
 * ~260ms CSS transition already applies. We piggy-back on
 * requestVideoFrameCallback (so sampling is exactly in sync with decoded
 * frames, not a separate timer racing the video) but only actually run the
 * canvas readback every ANALYSIS_INTERVAL_MS. This is easy to tighten if a
 * specific clip needs snappier tracking — see ANALYSIS_INTERVAL_MS below.
 *
 * On WCAG: WCAG's contrast-ratio formula assumes two flat colours. A shadow
 * doesn't change the actual background pixel behind a glyph, so we can't
 * claim a literal WCAG ratio the way you could for solid-colour UI. What we
 * *can* do — and what this engine does — is use WCAG's relative-luminance
 * weighting to decide how much of a dark halo white text/logos need to
 * *read* as high-contrast against the footage, which is the same underlying
 * idea Red Bull's own treatment relies on.
 */

export type ShadowKind = 'text' | 'logo'

// ── Tunables ────────────────────────────────────────────────────────────────
const CANVAS_WIDTH = 160 // wide enough to sample small regions accurately, cheap to read back
const ANALYSIS_INTERVAL_MS = 90 // ~11 samples/sec; see rationale above
const SMOOTHING = 0.35 // exponential smoothing factor applied per analysis tick
const MIN_DELTA_TO_UPDATE = 0.008 // ignore imperceptible intensity changes (skip a React re-render)
const LUM_LOW = 0.32 // background luminance at/below this → intensity floors at MIN_VISIBLE_INTENSITY
const LUM_HIGH = 0.72 // background luminance at/above this → intensity 1 (max shadow)
// Never let the shadow disappear entirely, even over already-dark footage —
// a *little* separation is always present (this is what Red Bull's own
// treatment does too: the shadow is always there, just much stronger over
// bright shots). Also acts as a safety floor: see safeIntensity() below.
const MIN_VISIBLE_INTENSITY = 0.22
// Safe default used before any real sample exists (first paint, poster still showing,
// or if canvas sampling is unavailable/blocked) — errs toward the stronger shadow.
export const FALLBACK_INTENSITY = 0.8

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Guards against ever emitting an invalid CSS value (NaN/undefined slipping
// through from a bad import or an unexpected sampling edge case). An
// invalid value in a shorthand like `filter`/`text-shadow` makes the browser
// silently drop the ENTIRE property — no console error, the shadow just
// doesn't render. Every intensity value is funnelled through this before
// it reaches a style builder.
function safeIntensity(t: number): number {
  if (typeof t !== 'number' || Number.isNaN(t)) return FALLBACK_INTENSITY
  return Math.max(MIN_VISIBLE_INTENSITY, clamp(t, 0, 1))
}

// ── Style builders ──────────────────────────────────────────────────────────
export function textShadowForIntensity(t: number): CSSProperties {
  t = safeIntensity(t)
  const a1 = lerp(0.35, 0.92, t)
  const a2 = lerp(0.18, 0.65, t)
  const a3 = lerp(0.08, 0.42, t)
  const b1 = lerp(1, 3, t)
  const b2 = lerp(4, 14, t)
  const b3 = lerp(8, 26, t)
  const o1 = lerp(1, 2, t)
  const o2 = lerp(2, 4, t)
  const o3 = lerp(4, 8, t)
  return {
    textShadow: [
      `0px ${o1.toFixed(1)}px ${b1.toFixed(1)}px rgba(0,0,0,${a1.toFixed(2)})`,
      `0px ${o2.toFixed(1)}px ${b2.toFixed(1)}px rgba(0,0,0,${a2.toFixed(2)})`,
      `0px ${o3.toFixed(1)}px ${b3.toFixed(1)}px rgba(0,0,0,${a3.toFixed(2)})`,
    ].join(', '),
    transition: 'text-shadow 260ms ease-out',
  }
}

export function logoShadowForIntensity(t: number): CSSProperties {
  t = safeIntensity(t)
  const blur = lerp(4, 11, t)
  const alpha = lerp(0.45, 0.85, t)
  const offsetY = lerp(2, 4, t)
  return {
    filter: `drop-shadow(0px ${offsetY.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${alpha.toFixed(2)}))`,
    transition: 'filter 260ms ease-out',
  }
}

function luminanceToIntensity(lum: number): number {
  const raw = clamp((lum - LUM_LOW) / (LUM_HIGH - LUM_LOW), 0, 1)
  return MIN_VISIBLE_INTENSITY + (1 - MIN_VISIBLE_INTENSITY) * raw
}

// ── Registration bookkeeping ────────────────────────────────────────────────
interface Registration {
  el: HTMLElement
  kind: ShadowKind
  // null until the first real canvas sample comes in. Distinguishing "no
  // real sample yet" from "a real sample of exactly FALLBACK_INTENSITY"
  // matters: the very first sample should SNAP to its target rather than
  // being smoothed in from the synthetic fallback (see analyzeAndApply) —
  // otherwise every newly-registered element (a client logo mounting, the
  // hero logo on load, …) visibly eases down/up from the strong fallback
  // shadow over the first several ticks, which reads as a brief "flash".
  lastIntensity: number | null
  onUpdate: (style: CSSProperties) => void
}

interface Engine {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  registrations: Set<Registration>
  running: boolean
  lastAnalysisTime: number
  tainted: boolean
  timeoutHandle: number | null
}

// One engine per <HeroVideoSection> instance, keyed by the context value
// object itself (stable for the section's lifetime — see HeroVideoSection).
const engines = new WeakMap<HeroFrameContextValue, Engine>()

function getOrCreateEngine(key: HeroFrameContextValue): Engine {
  let engine = engines.get(key)
  if (!engine) {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_WIDTH
    canvas.height = Math.round((CANVAS_WIDTH * 9) / 16)
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    engine = {
      canvas,
      ctx,
      registrations: new Set(),
      running: false,
      lastAnalysisTime: 0,
      tainted: false,
      timeoutHandle: null,
    }
    engines.set(key, engine)
  }
  return engine
}

function sampleRegionLuminance(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sectionRect: DOMRect,
  el: HTMLElement
): number | 'tainted' | null {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1 || sectionRect.width < 1 || sectionRect.height < 1) return null

  const fx = clamp((r.left - sectionRect.left) / sectionRect.width, 0, 1)
  const fy = clamp((r.top - sectionRect.top) / sectionRect.height, 0, 1)
  const fw = clamp(r.width / sectionRect.width, 0, 1)
  const fh = clamp(r.height / sectionRect.height, 0, 1)

  const sx = Math.floor(fx * canvas.width)
  const sy = Math.floor(fy * canvas.height)
  const sw = Math.max(1, Math.min(Math.round(fw * canvas.width), canvas.width - sx))
  const sh = Math.max(1, Math.min(Math.round(fh * canvas.height), canvas.height - sy))
  if (sw <= 0 || sh <= 0) return null

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(sx, sy, sw, sh).data
  } catch {
    return 'tainted'
  }

  // Cap the number of pixels actually inspected — a big logo bar doesn't
  // need every pixel to get a stable average.
  const totalPixels = sw * sh
  const stride = 4 * Math.max(1, Math.floor(totalPixels / 400))
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += stride) {
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    sum += lum
    count++
  }
  return count > 0 ? sum / count : null
}

function analyzeAndApply(engine: Engine, video: HTMLVideoElement, section: HTMLElement) {
  const rect = section.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return

  // Keep the canvas's aspect ratio matched to the section so element
  // bounding boxes map onto it as simple fractions (width stays fixed).
  const desiredHeight = Math.max(1, Math.round(CANVAS_WIDTH / (rect.width / rect.height)))
  if (Math.abs(engine.canvas.height - desiredHeight) > 1) {
    engine.canvas.height = desiredHeight
  }

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return

  // object-fit: cover crop — figure out which sub-rect of the source frame
  // is actually visible, so canvas coordinates line up with on-screen ones.
  const containerAspect = rect.width / rect.height
  const videoAspect = vw / vh
  let sx = 0
  let sy = 0
  let sw = vw
  let sh = vh
  if (videoAspect > containerAspect) {
    sw = vh * containerAspect
    sx = (vw - sw) / 2
  } else if (videoAspect < containerAspect) {
    sh = vw / containerAspect
    sy = (vh - sh) / 2
  }

  try {
    engine.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, engine.canvas.width, engine.canvas.height)
  } catch {
    engine.tainted = true
    console.warn(
      '[HeroContrast] Canvas sampling blocked (likely a CORS-tainted video source). ' +
        'Falling back to the static shadow. Ensure the video CDN sends ' +
        'Access-Control-Allow-Origin and <video> has crossOrigin="anonymous".'
    )
    return
  }

  for (const reg of engine.registrations) {
    const lum = sampleRegionLuminance(engine.ctx, engine.canvas, rect, reg.el)
    if (lum === 'tainted') {
      engine.tainted = true
      return
    }
    if (lum == null || Number.isNaN(lum)) continue

    const target = luminanceToIntensity(lum)
    // First real sample for this element: snap straight to it. Smoothing
    // from FALLBACK_INTENSITY (a synthetic "before we know anything" value,
    // not a real reading) rather than from a genuine previous sample would
    // just replay the fallback→real gap as a fake transition every time an
    // element mounts.
    const smoothed =
      reg.lastIntensity == null ? target : reg.lastIntensity + (target - reg.lastIntensity) * SMOOTHING
    if (reg.lastIntensity == null || Math.abs(smoothed - reg.lastIntensity) > MIN_DELTA_TO_UPDATE) {
      reg.lastIntensity = smoothed
      reg.onUpdate(reg.kind === 'text' ? textShadowForIntensity(smoothed) : logoShadowForIntensity(smoothed))
    }
  }
}

function scheduleTick(
  engine: Engine,
  videoRef: RefObject<HTMLVideoElement | null>,
  sectionRef: RefObject<HTMLElement | null>
) {
  const tick = (now: number) => {
    if (engine.registrations.size === 0) {
      engine.running = false
      return
    }

    if (!document.hidden && !engine.tainted) {
      const video = videoRef.current
      const section = sectionRef.current
      // Skip the tick while the video is mid-seek. The <video> loops, and
      // the seek back to time 0 on each loop briefly hands back stale/
      // transitional frame data — sampling that as if it were a genuine
      // frame is what produces the "one frame very dark, then corrects"
      // clip: the engine reacts to a frame that was never really shown.
      if (video && section && !video.paused && !video.seeking && video.readyState >= 2) {
        if (now - engine.lastAnalysisTime >= ANALYSIS_INTERVAL_MS) {
          engine.lastAnalysisTime = now
          analyzeAndApply(engine, video, section)
        }
      }
    }

    scheduleNext()
  }

  const scheduleNext = () => {
    const video = videoRef.current
    if (video && typeof (video as any).requestVideoFrameCallback === 'function') {
      ;(video as any).requestVideoFrameCallback((rvfcNow: number) => tick(rvfcNow))
    } else {
      // Fallback for browsers without rVFC (e.g. older Firefox): a plain
      // timer at roughly the same cadence as our analysis interval.
      engine.timeoutHandle = window.setTimeout(() => tick(performance.now()), ANALYSIS_INTERVAL_MS)
    }
  }

  scheduleNext()
}

function ensureLoop(
  engine: Engine,
  videoRef: RefObject<HTMLVideoElement | null>,
  sectionRef: RefObject<HTMLElement | null>
) {
  if (engine.running) return
  engine.running = true
  scheduleTick(engine, videoRef, sectionRef)
}

function stopLoopIfIdle(engine: Engine) {
  if (engine.registrations.size > 0) return
  engine.running = false
  if (engine.timeoutHandle != null) {
    window.clearTimeout(engine.timeoutHandle)
    engine.timeoutHandle = null
  }
}

/**
 * Registers a DOM element to be tracked by the adaptive shadow engine for a
 * given <HeroVideoSection>. Returns an unregister function.
 */
export function registerShadowTarget(
  context: HeroFrameContextValue,
  el: HTMLElement,
  kind: ShadowKind,
  onUpdate: (style: CSSProperties) => void
): () => void {
  const engine = getOrCreateEngine(context)
  const reg: Registration = { el, kind, lastIntensity: null, onUpdate }
  engine.registrations.add(reg)
  ensureLoop(engine, context.videoRef, context.sectionRef)

  return () => {
    engine.registrations.delete(reg)
    stopLoopIfIdle(engine)
  }
}
