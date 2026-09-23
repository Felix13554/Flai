/**
 * HeroVideoSection — v15
 *
 * Changes from v14:
 *
 * 1. NO POSTER FLASH ON MID-VIDEO VARIANT SWAP.
 *    When the viewport orientation/breakpoint changes and the project has a
 *    distinct mobile variant, the poster is never re-shown. Instead:
 *      a) the current video frame is captured to a canvas ("handoff frame")
 *         and shown above the video until the new source has decoded a frame
 *         at the resumed timestamp;
 *      b) the <video> element is NOT remounted (key is stable across the
 *         handoff) — its src is swapped in place and seeked to the old time.
 *    If canvas capture fails (tainted canvas etc.) the old frame simply stays
 *    on screen (the video keeps its last frame while loading) — never the
 *    frame-one poster.
 *
 * 2. VARIANT SELECTION BY REAL ORIENTATION ON MOBILE.
 *    Vertical version when the device is held portrait, horizontal version
 *    when landscape. Uses (orientation: portrait) media query, applied only
 *    on phone/tablet-class devices (coarse pointer or small screen) so that
 *    resizing a desktop browser window does not flip variants.
 *
 * Everything else is unchanged from v14.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useContext,
} from 'react'
import {
  getHeroVideo,
  cloudinaryMp4Url,
  cloudinaryPosterUrl,
  getConnectionInfo,
} from '../utils/heroPreload'
import { HeroFrameContext } from '../contexts/HeroFrameContext'

export interface HeroVideoSectionProps {
  className?: string
  children?: React.ReactNode
  /** Optional controlled Cloudinary public_id (desktop / horizontal video). */
  publicId?: string
  /**
   * Optional controlled Cloudinary public_id for the vertical variant.
   * Played when the device is in portrait orientation (phones/tablets).
   * Falls back to `publicId` when omitted.
   */
  mobilePublicId?: string
  /** Called when the current video finishes a full playthrough (disables loop). */
  onEnded?: () => void
  /** Called on every timeupdate tick with progress as a 0–1 fraction. */
  onProgress?: (fraction: number) => void
}

type AutoplayState = 'unknown' | 'allowed' | 'allowed-muted' | 'disallowed'

function getAutoplayState(): AutoplayState {
  if (typeof navigator === 'undefined') return 'unknown'
  if (typeof (navigator as any).getAutoplayPolicy === 'function') {
    return (navigator as any).getAutoplayPolicy('mediaelement') as AutoplayState
  }
  return 'unknown'
}

let _styleInjected = false
function injectControlHideStyle() {
  if (_styleInjected || typeof document === 'undefined') return
  _styleInjected = true
  const el = document.createElement('style')
  el.textContent = `
    [data-hero-video]                                                { pointer-events:none!important; outline:none!important; }
    [data-hero-video]::-webkit-media-controls                        { display:none!important; opacity:0!important; }
    [data-hero-video]::-webkit-media-controls-enclosure             { display:none!important; opacity:0!important; }
    [data-hero-video]::-webkit-media-controls-panel                 { display:none!important; opacity:0!important; }
    [data-hero-video]::-webkit-media-controls-play-button           { display:none!important; opacity:0!important; }
    [data-hero-video]::-webkit-media-controls-overlay-play-button   { display:none!important; opacity:0!important; }
    [data-hero-video]::-webkit-media-controls-start-playback-button { display:none!important; opacity:0!important; }
    [data-hero-video]::--internal-media-controls-button-panel       { display:none!important; opacity:0!important; }
  `
  document.head.prepend(el)
}

const FILL_STYLE: React.CSSProperties = {
  position:       'absolute',
  inset:          0,
  width:          '100%',
  height:         '100%',
  objectFit:      'cover',
  objectPosition: 'center',
  display:        'block',
  pointerEvents:  'none',
  userSelect:     'none',
}

const MOBILE_BREAKPOINT_PX = 768 // matches Tailwind's `md` breakpoint

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT_PX
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`)
    const handler = () => setIsMobile(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}

/**
 * True when the device is a phone/tablet-class device (touch-first OR a small
 * screen in either orientation). Used to gate orientation-based variant
 * selection so resizing a desktop browser window never swaps videos.
 * A phone in landscape can be wider than 768px, so we can't rely on the
 * width breakpoint alone.
 */
function isHandheldDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const smallSide = Math.min(window.screen?.width ?? Infinity, window.screen?.height ?? Infinity)
  return coarse && smallSide <= 1024
}

/**
 * Returns true when the vertical (mobile) variant should play:
 *  - handheld device: true when held in portrait, false in landscape
 *  - otherwise (desktop): true only when the viewport is below the mobile
 *    breakpoint (previous behaviour)
 */
function useWantsVerticalVariant() {
  const isMobileWidth = useIsMobileViewport()

  const [portrait, setPortrait] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(orientation: portrait)').matches
  })
  const [handheld, setHandheld] = useState(() => isHandheldDevice())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(orientation: portrait)')
    const update = () => {
      setPortrait(mq.matches)
      setHandheld(isHandheldDevice())
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return handheld ? portrait : isMobileWidth
}

// Measures viewport height ONCE (on mount) and freezes it — see v14 notes.
// Only re-measured on a genuine device rotation.
function useFrozenViewportHeight(active: boolean) {
  const [height, setHeight] = useState<number | null>(() => {
    if (typeof window === 'undefined' || !active) return null
    return window.innerHeight
  })

  useEffect(() => {
    if (!active || typeof window === 'undefined') return

    const initialTimer = window.setTimeout(() => {
      setHeight(window.innerHeight)
    }, 50)

    let lastOrientation =
      typeof screen !== 'undefined' && screen.orientation
        ? screen.orientation.type
        : null

    const remeasureAfterRotation = () => {
      window.setTimeout(() => setHeight(window.innerHeight), 200)
    }

    const handleOrientationApi = () => {
      const current = screen.orientation?.type ?? null
      if (current !== lastOrientation) {
        lastOrientation = current
        remeasureAfterRotation()
      }
    }

    if (typeof screen !== 'undefined' && screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationApi)
    } else {
      window.addEventListener('orientationchange', remeasureAfterRotation)
    }

    return () => {
      window.clearTimeout(initialTimer)
      if (typeof screen !== 'undefined' && screen.orientation) {
        screen.orientation.removeEventListener('change', handleOrientationApi)
      } else {
        window.removeEventListener('orientationchange', remeasureAfterRotation)
      }
    }
  }, [active])

  return height
}

const HeroVideoSection: React.FC<HeroVideoSectionProps> = ({
  className = '',
  children,
  publicId: controlledPublicId,
  mobilePublicId: controlledMobilePublicId,
  onEnded,
  onProgress,
}) => {
  useEffect(() => { injectControlHideStyle() }, [])

  // Layout split (unchanged): <768px is "mobile" for layout purposes.
  const isMobile = useIsMobileViewport()
  const frozenHeight = useFrozenViewportHeight(isMobile)

  // Variant split: orientation-driven on handheld devices.
  const wantsVertical = useWantsVerticalVariant()

  const effectiveControlledPublicId =
    wantsVertical && controlledMobilePublicId ? controlledMobilePublicId : controlledPublicId

  const isControlled = effectiveControlledPublicId != null && effectiveControlledPublicId !== ''

  const hasDistinctMobileVariant =
    controlledMobilePublicId != null &&
    controlledMobilePublicId !== '' &&
    controlledMobilePublicId !== controlledPublicId

  const ambientHeroFrameContext = useContext(HeroFrameContext)
  const ownVideoRef   = useRef<HTMLVideoElement>(null)
  const ownSectionRef = useRef<HTMLElement>(null)
  const videoRef   = ambientHeroFrameContext?.videoRef ?? ownVideoRef
  const sectionRef = ambientHeroFrameContext?.sectionRef ?? ownSectionRef
  const videoSrcRef = useRef<string>('')

  const onEndedRef = useRef<(() => void) | undefined>(onEnded)
  onEndedRef.current = onEnded

  const onProgressRef = useRef<((fraction: number) => void) | undefined>(onProgress)
  onProgressRef.current = onProgress

  const [videoReady,     setVideoReady]     = useState(false)
  const [publicId,       setPublicId]       = useState(() => effectiveControlledPublicId || getHeroVideo().public_id)
  const [posterStamp,    setPosterStamp]    = useState(() => getHeroVideo().posterStamp)
  const [videoKey,       setVideoKey]       = useState(0)
  const [showPlayButton, setShowPlayButton] = useState(false)

  // Snapshot of the frame the user was on when a variant handoff began.
  // Rendered above the video (below content) until the new source is showing
  // a decoded frame at the resumed time. null when no handoff is in progress.
  const [handoffFrameUrl, setHandoffFrameUrl] = useState<string | null>(null)
  // True while an in-place source swap is pending (no poster, no remount).
  const handoffPendingRef = useRef(false)

  const { isSlow, saveData } = useMemo(getConnectionInfo, [])
  const skipVideo  = isSlow || saveData
  const preloadVal = isSlow ? 'none' : 'auto'
  const autoplayState = useMemo(getAutoplayState, [])

  const videoSrc = useMemo(() => cloudinaryMp4Url(publicId), [publicId])
  videoSrcRef.current = videoSrc

  const resumeTimeRef = useRef<number | null>(null)

  // ── Ref callback ─────────────────────────────────────────────────────────────
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
    if (!el) return
    el.setAttribute('muted',              '')
    el.setAttribute('playsinline',        '')
    el.setAttribute('webkit-playsinline', '')
    el.setAttribute('x-webkit-airplay',   'deny')
    el.crossOrigin = 'anonymous'
    el.muted  = true
    el.volume = 0
    if (el.getAttribute('src') !== videoSrcRef.current) {
      el.src = videoSrcRef.current
    }
    el.play().catch(() => {})
  }, [])

  /**
   * Capture the currently displayed video frame as a data URL. Returns null
   * if the video has no frame yet or the canvas is tainted.
   */
  const captureCurrentFrame = useCallback((): string | null => {
    const el = videoRef.current
    if (!el || el.readyState < 2 || !el.videoWidth || !el.videoHeight) return null
    try {
      const canvas = document.createElement('canvas')
      // Cap resolution to keep this cheap; it's only shown for a few frames.
      const scale = Math.min(1, 1280 / el.videoWidth)
      canvas.width  = Math.round(el.videoWidth  * scale)
      canvas.height = Math.round(el.videoHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.85)
    } catch {
      return null
    }
  }, [videoRef])

  const publicIdRef = useRef(publicId)
  publicIdRef.current = publicId

  // Controlled mode: react to parent `publicId` changes AND to the responsive
  // variant flipping (portrait <-> landscape / breakpoint) for the same project.
  useEffect(() => {
    if (!isControlled) return
    const next = effectiveControlledPublicId as string

    if (next === publicIdRef.current) {
      if (!hasDistinctMobileVariant) return
      // Same id requested again — restart that clip (genuine project re-select).
      setVideoReady(false)
      setShowPlayButton(false)
      setVideoKey((k) => k + 1)
      return
    }

    const isOrientationHandoff =
      hasDistinctMobileVariant &&
      (next === controlledMobilePublicId || next === controlledPublicId) &&
      (publicIdRef.current === controlledMobilePublicId || publicIdRef.current === controlledPublicId)

    if (isOrientationHandoff) {
      const currentEl = videoRef.current
      const midVideo =
        !!currentEl &&
        isFinite(currentEl.currentTime) &&
        currentEl.currentTime > 0.05 &&
        videoReady // video was actually on screen (not still on the poster)

      if (midVideo) {
        // MID-VIDEO HANDOFF: never bring the frame-one poster back.
        resumeTimeRef.current = currentEl!.currentTime
        handoffPendingRef.current = true
        // Freeze the frame the user is on, so there is no black gap while the
        // new variant loads. If capture fails we simply keep the old <video>
        // frame visible (it is not remounted, so it holds its last frame).
        setHandoffFrameUrl(captureCurrentFrame())
        // Intentionally DO NOT reset videoReady / showPlayButton.
        setPublicId(next)
        return
      }

      // Handoff before the video ever became visible (still on poster):
      // nothing mid-video to preserve — fall through to normal load.
      resumeTimeRef.current = null
    } else {
      resumeTimeRef.current = null
    }

    // Genuine project change (or pre-ready handoff): normal poster/loading flow.
    handoffPendingRef.current = false
    setHandoffFrameUrl(null)
    setVideoReady(false)
    setShowPlayButton(false)
    setPublicId(next)
  }, [
    effectiveControlledPublicId,
    isControlled,
    wantsVertical,
    hasDistinctMobileVariant,
    controlledMobilePublicId,
    controlledPublicId,
  ])

  // CMS replacement listener — uncontrolled mode only.
  useEffect(() => {
    if (isControlled) return
    const handler = (e: Event) => {
      const { publicId: newId, stamp } =
        (e as CustomEvent<{ publicId: string; stamp: number }>).detail ?? {}
      if (newId) {
        handoffPendingRef.current = false
        setHandoffFrameUrl(null)
        setVideoReady(false)
        setShowPlayButton(false)
        if (newId !== publicId) setPublicId(newId)
        else                    setVideoKey((k) => k + 1)
      }
      if (typeof stamp === 'number' && stamp !== posterStamp) setPosterStamp(stamp)
    }
    window.addEventListener('heroVideoChanged', handler)
    return () => window.removeEventListener('heroVideoChanged', handler)
  }, [publicId, posterStamp, isControlled])

  // Posters
  const posterUrl    = useMemo(() => cloudinaryPosterUrl(publicId, 1920, 'good', posterStamp), [publicId, posterStamp])
  const poster480    = useMemo(() => cloudinaryPosterUrl(publicId,  480, 'eco',  posterStamp), [publicId, posterStamp])
  const poster960    = useMemo(() => cloudinaryPosterUrl(publicId,  960, 'eco',  posterStamp), [publicId, posterStamp])
  const posterSrcSet = useMemo(
    () => `${poster480} 480w, ${poster960} 960w, ${posterUrl} 1920w`,
    [poster480, poster960, posterUrl]
  )

  // ── Main playback effect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (skipVideo) return
    if (autoplayState === 'disallowed') {
      setShowPlayButton(true)
      return
    }

    const video = videoRef.current
    if (!video) return

    video.muted = true
    video.setAttribute('muted', '')

    let destroyed = false
    let revealTimer: number | undefined
    let attemptInFlight = false

    // Finish a mid-video variant handoff: drop the frozen frame once the new
    // source has actually decoded a frame at the resumed position.
    const finishHandoff = () => {
      if (!handoffPendingRef.current) return
      handoffPendingRef.current = false
      setHandoffFrameUrl(null)
    }

    const markReady = () => {
      if (destroyed) return
      window.clearTimeout(revealTimer)
      const commit = () => {
        if (destroyed) return
        setVideoReady(true)
        setShowPlayButton(false)
        finishHandoff()
      }
      if (typeof (video as any).requestVideoFrameCallback === 'function') {
        ;(video as any).requestVideoFrameCallback(() => {
          requestAnimationFrame(commit)
        })
      } else {
        requestAnimationFrame(() => requestAnimationFrame(commit))
      }
    }

    const attemptPlay = () => {
      if (destroyed || attemptInFlight) return
      attemptInFlight = true
      window.clearTimeout(revealTimer)
      video.muted = true
      const p = video.play()
      if (!p) {
        attemptInFlight = false
        return
      }
      p.then(() => {
        attemptInFlight = false
        window.clearTimeout(revealTimer)
        setShowPlayButton(false)
      }).catch(() => {
        attemptInFlight = false
        if (destroyed) return
        revealTimer = window.setTimeout(() => {
          if (destroyed || !video.paused) return
          setShowPlayButton(true)
          const gesturePlay = () => {
            video.muted = true
            video.play().then(markReady).catch(() => {})
            document.removeEventListener('touchstart', gesturePlay)
            document.removeEventListener('click',      gesturePlay)
          }
          document.addEventListener('touchstart', gesturePlay, { once: true })
          document.addEventListener('click',      gesturePlay, { once: true })
        }, 800)
      })
    }

    ;(video as any).__heroMarkReady   = markReady
    ;(video as any).__heroAttemptPlay = attemptPlay

    // ── In-place source swap (variant handoff) ─────────────────────────────
    // The <video> element is NOT remounted on a handoff, so ref-callback
    // doesn't run again. Apply the new src + resume position here.
    if (handoffPendingRef.current) {
      const resumeAt = resumeTimeRef.current
      resumeTimeRef.current = null
      if (video.getAttribute('src') !== videoSrcRef.current) {
        video.src = videoSrcRef.current
      }
      const seekWhenReady = () => {
        video.removeEventListener('loadedmetadata', seekWhenReady)
        if (resumeAt != null && isFinite(video.duration)) {
          try { video.currentTime = Math.min(resumeAt, Math.max(0, video.duration - 0.05)) } catch {}
        }
      }
      video.addEventListener('loadedmetadata', seekWhenReady)
      video.load()
    }

    const onPlaying    = () => markReady()
    // After the seek lands, the first painted frame is at the resumed time.
    const onSeeked     = () => { if (handoffPendingRef.current && !video.paused) markReady() }
    const onLoadedData = () => { if (!destroyed && video.paused) attemptPlay() }
    const onError      = () => {
      if (destroyed || !video.error) return
      console.warn('[HeroVideo] error', video.error.code, video.error.message)
      // Never leave the frozen frame stuck if the new variant fails to load.
      finishHandoff()
    }
    let firedEnded = false
    const onEndedEvt = () => {
      if (destroyed || firedEnded) return
      firedEnded = true
      onEndedRef.current?.()
    }

    // Don't report progress 0 during a mid-video handoff (would make the
    // progress line jump back); the next timeupdate reports the real value.
    if (!handoffPendingRef.current) onProgressRef.current?.(0)
    const onTimeUpdate = () => {
      if (destroyed) return
      const duration = video.duration
      if (!duration || !isFinite(duration)) return
      onProgressRef.current?.(video.currentTime / duration)
    }

    video.addEventListener('playing',    onPlaying)
    video.addEventListener('seeked',     onSeeked)
    video.addEventListener('loadeddata', onLoadedData, { once: true })
    video.addEventListener('error',      onError)
    video.addEventListener('ended',      onEndedEvt)
    video.addEventListener('timeupdate', onTimeUpdate)

    if (
      !handoffPendingRef.current &&
      (video.networkState === HTMLMediaElement.NETWORK_EMPTY ||
       video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)
    ) {
      video.load()
    }

    let observer: IntersectionObserver | null = null
    if (handoffPendingRef.current) {
      // Already on screen — resume immediately, no need to wait for visibility.
      attemptPlay()
    } else if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            observer?.disconnect()
            attemptPlay()
          }
        },
        { threshold: 0 }
      )
      observer.observe(video)
    } else {
      attemptPlay()
    }

    return () => {
      destroyed = true
      window.clearTimeout(revealTimer)
      observer?.disconnect()
      video.removeEventListener('playing',    onPlaying)
      video.removeEventListener('seeked',     onSeeked)
      video.removeEventListener('error',      onError)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('ended',      onEndedEvt)
      video.removeEventListener('timeupdate', onTimeUpdate)
      delete (video as any).__heroMarkReady
      delete (video as any).__heroAttemptPlay
      // During a handoff the same element continues with a new src, so don't
      // pause/blank it here — that would flash the poster/black. Cleanup for
      // real unmounts / project changes is handled below.
      if (!handoffPendingRef.current) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [skipVideo, autoplayState, publicId, videoKey])

  // ── Tab visibility ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (skipVideo) return
    let retryTimer: number | undefined
    const handle = () => {
      const video = videoRef.current
      if (!video) return
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(retryTimer)
      } else {
        video.muted = true
        retryTimer = window.setTimeout(() => {
          const el = videoRef.current
          if (!el) return
          const attempt = (el as any).__heroAttemptPlay as (() => void) | undefined
          if (attempt) {
            attempt()
          } else {
            el.play()
              .then(() => {
                const ready = (el as any).__heroMarkReady as (() => void) | undefined
                if (ready) ready()
                else setVideoReady(true)
              })
              .catch(() => {})
          }
        }, 0)
      }
    }
    document.addEventListener('visibilitychange', handle)
    return () => {
      window.clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', handle)
    }
  }, [skipVideo])

  const handleManualPlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = true
    video.play()
      .then(() => setShowPlayButton(false))
      .catch(() => {})
  }, [])

  // Poster only shows when the video has never been ready for the current
  // project. A mid-video variant handoff never re-raises it (videoReady stays
  // true), so the frame-one poster cannot reappear.
  const posterOpaque = !videoReady || skipVideo

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className={`relative w-full overflow-hidden flex flex-col ${!isMobile ? 'h-screen' : ''} ${className}`}
      style={{
        backgroundColor: '#111',
        ...(isMobile
          ? { height: frozenHeight != null ? `${frozenHeight}px` : '100vh' }
          : {}),
      }}
    >
      {/* z=0 — video layer */}
      {!skipVideo && (
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}
        >
          <video
            // Key intentionally excludes `publicId` so a variant handoff swaps
            // src IN PLACE (no remount, no blank frame). videoKey still bumps
            // for genuine restarts. A genuine project change also reuses the
            // element; the main effect resets src/ready state for it.
            key={`hero-${videoKey}`}
            ref={setVideoRef}
            muted
            loop={!onEnded}
            playsInline
            controls={false}
            disablePictureInPicture
            preload={preloadVal}
            {...({
              disableRemotePlayback:  true,
              'webkit-playsinline':   'true',
              'x-webkit-airplay':     'deny',
              'data-hero-video':      'true',
            } as any)}
            style={{
              ...FILL_STYLE,
              opacity: 1,
            }}
          />
        </div>
      )}

      {/* z=1 — frozen handoff frame (only during a mid-video variant swap) */}
      {handoffFrameUrl && (
        <img
          aria-hidden="true"
          alt=""
          src={handoffFrameUrl}
          style={{ ...FILL_STYLE, zIndex: 1 }}
        />
      )}

      {/* z=1 — poster layer (initial load / project change only) */}
      <div
        onClick={showPlayButton ? handleManualPlay : undefined}
        aria-hidden="true"
        style={{
          ...FILL_STYLE,
          zIndex:        1,
          cursor:        showPlayButton ? 'pointer' : 'default',
          opacity:       posterOpaque ? 1 : 0,
          transition:    'none',
          pointerEvents: posterOpaque ? 'auto' : 'none',
        }}
      >
        <img
          key={`poster-${publicId}-${posterStamp}`}
          src={posterUrl}
          srcSet={posterSrcSet}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          {...({ fetchpriority: 'high' } as any)}
          decoding="sync"
          style={{ ...FILL_STYLE }}
        />

        {showPlayButton && (
          <div
            aria-label="Play video"
            style={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              background:     'rgba(0,0,0,0.25)',
            }}
          >
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
              <circle cx="36" cy="36" r="36" fill="rgba(255,255,255,0.15)" />
              <polygon points="29,22 54,36 29,50" fill="white" />
            </svg>
          </div>
        )}
      </div>

      {/* z=3 — content */}
      <div className="relative w-full h-full" style={{ zIndex: 3 }}>
        {children}
      </div>
    </section>
  )
}

export default HeroVideoSection
