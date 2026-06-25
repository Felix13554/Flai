/**
 * HeroVideoSection — v14
 *
 * Changes from v13:
 *
 * 1. INSTANT poster→video cut (no fade).
 *    The `transition` on the poster layer is unconditionally `'none'`.
 *    When videoReady flips true the poster disappears in the same paint frame.
 *
 * 2. Removed the `autoplay` HTML attribute from the <video> element.
 *    Per Mux / Chrome guidance the attribute gives you no error signal and
 *    behaves inconsistently. We already call el.play() imperatively in the
 *    ref callback and in attemptPlay(), which returns a catchable Promise.
 *
 * 3. `getAutoplayState` default changed 'allowed-muted' → 'unknown'.
 *    The old default silently skipped the play attempt on iOS Low Power Mode
 *    and WeChat WebView where even muted autoplay is blocked. Defaulting to
 *    'unknown' means we always try video.play() and handle rejection properly.
 *
 * 4. Slow-connection preload changed 'metadata' → 'none'.
 *    The src is assigned imperatively; letting the browser pre-fetch metadata
 *    on a slow connection wastes bytes before the IntersectionObserver fires.
 *
 * 5. visibilitychange re-play wrapped in a clearTimeout guard so the attempt
 *    can't fire after the effect has been torn down.
 *
 * Unchanged / confirmed correct by research:
 * - poster fetchpriority="high" + decoding="sync" (LCP best practice)
 * - requestVideoFrameCallback used for markReady (now baseline across all
 *   evergreen browsers: Chrome 83+, Safari 15.4+, Firefox 132+)
 * - IntersectionObserver threshold:0 (fire on first visible pixel)
 * - muted + playsinline + loop combo (only reliable autoplay setup)
 * - video.play() Promise catch + manual play button fallback
 */

import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react'
import {
  getHeroVideo,
  cloudinaryMp4Url,
  cloudinaryPosterUrl,
} from '../utils/heroPreload'

export interface HeroVideoSectionProps {
  className?: string
  children?: React.ReactNode
}

function getConnectionInfo() {
  if (typeof navigator === 'undefined') return { isSlow: false, saveData: false }
  const conn =
    (navigator as any).connection ??
    (navigator as any).mozConnection ??
    (navigator as any).webkitConnection
  return {
    isSlow:   conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g',
    saveData: conn?.saveData === true,
  }
}

// 'unknown' is the safe default: we always attempt play() and handle rejection.
// Previously defaulting to 'allowed-muted' caused silent failures on iOS Low
// Power Mode and WeChat WebView where even muted autoplay is blocked.
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

const HeroVideoSection: React.FC<HeroVideoSectionProps> = ({ className = '', children }) => {
  useEffect(() => { injectControlHideStyle() }, [])

  const videoRef    = useRef<HTMLVideoElement>(null)
  // Stable ref for current video src — avoids re-running setVideoRef on every render
  const videoSrcRef = useRef<string>('')

  const [videoReady,     setVideoReady]     = useState(false)
  const [publicId,       setPublicId]       = useState(() => getHeroVideo().public_id)
  const [posterStamp,    setPosterStamp]    = useState(() => getHeroVideo().posterStamp)
  const [videoKey,       setVideoKey]       = useState(0)
  const [showPlayButton, setShowPlayButton] = useState(false)

  const { isSlow, saveData } = useMemo(getConnectionInfo, [])
  const skipVideo  = isSlow || saveData
  // On slow connections avoid even metadata pre-fetch — src is assigned imperatively
  // so there's nothing to gain and it wastes bandwidth before the video is in view.
  const preloadVal = isSlow ? 'none' : 'auto'
  const autoplayState = useMemo(getAutoplayState, [])

  const videoSrc = useMemo(() => cloudinaryMp4Url(publicId), [publicId])
  videoSrcRef.current = videoSrc

  // ── Ref callback ─────────────────────────────────────────────────────────────
  // Intentionally stable (no deps). Reads src from videoSrcRef to avoid the
  // brief src-reassignment flicker that occurred when this ran on every render.
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
    if (!el) return
    el.setAttribute('muted',              '')
    el.setAttribute('playsinline',        '')
    el.setAttribute('webkit-playsinline', '')
    el.setAttribute('x-webkit-airplay',   'deny')
    el.muted  = true
    el.volume = 0
    el.src    = videoSrcRef.current
    el.play().catch(() => {})
  }, [])

  // CMS replacement listener
  useEffect(() => {
    const handler = (e: Event) => {
      const { publicId: newId, stamp } =
        (e as CustomEvent<{ publicId: string; stamp: number }>).detail ?? {}
      if (newId) {
        setVideoReady(false)
        setShowPlayButton(false)
        if (newId !== publicId) setPublicId(newId)
        else                    setVideoKey((k) => k + 1)
      }
      if (typeof stamp === 'number' && stamp !== posterStamp) setPosterStamp(stamp)
    }
    window.addEventListener('heroVideoChanged', handler)
    return () => window.removeEventListener('heroVideoChanged', handler)
  }, [publicId, posterStamp])

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

    // Single code path to "ready". We wait for requestVideoFrameCallback so the
    // poster is only removed once a real decoded frame has been composited —
    // eliminating any black-gap frame. rVFC is baseline across all evergreen
    // browsers (Chrome 83+, Safari 15.4+, Firefox 132+ as of Oct 2024).
    const markReady = () => {
      if (destroyed) return
      if (typeof (video as any).requestVideoFrameCallback === 'function') {
        // rVFC fires when the frame is sent to the compositor.
        // The nested rAF then waits for the *next screen paint* before
        // pulling the poster — guaranteeing the decoded frame is actually
        // visible on screen before the poster disappears. This eliminates
        // the 1-frame black gap that rVFC alone can't fully prevent.
        ;(video as any).requestVideoFrameCallback(() => {
          requestAnimationFrame(() => {
            if (!destroyed) {
              setVideoReady(true)
              setShowPlayButton(false)
            }
          })
        })
      } else {
        // Fallback: two rAFs push past the current paint cycle
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!destroyed) {
              setVideoReady(true)
              setShowPlayButton(false)
            }
          })
        })
      }
    }

    let revealTimer: number | undefined

    const attemptPlay = () => {
      video.muted = true
      const p = video.play()
      if (!p) return
      p.then(() => {
        window.clearTimeout(revealTimer)
        setShowPlayButton(false)
      }).catch(() => {
        if (destroyed) return
        // Brief grace period before showing the play button — the 'playing'
        // event may still fire quickly on fast connections.
        revealTimer = window.setTimeout(() => {
          if (destroyed || !video.paused) return
          setShowPlayButton(true)
          const gesturePlay = () => {
            video.muted = true
            video.play()
              .then(() => setShowPlayButton(false))
              .catch(() => {})
            document.removeEventListener('touchstart', gesturePlay)
            document.removeEventListener('click',      gesturePlay)
          }
          document.addEventListener('touchstart', gesturePlay, { once: true })
          document.addEventListener('click',      gesturePlay, { once: true })
        }, 800)
        video.addEventListener('playing', () => window.clearTimeout(revealTimer), { once: true })
      })
    }

    const onPlaying    = () => markReady()
    const onLoadedData = () => { if (!destroyed && video.paused) attemptPlay() }
    const onError      = () => {
      if (destroyed || !video.error) return
      console.warn('[HeroVideo] error', video.error.code, video.error.message)
    }

    video.addEventListener('playing',    onPlaying,    { once: true })
    video.addEventListener('loadeddata', onLoadedData, { once: true })
    video.addEventListener('error',      onError)

    if (
      video.networkState === HTMLMediaElement.NETWORK_EMPTY ||
      video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
    ) {
      video.load()
    }

    let observer: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      // threshold:0 fires as soon as a single pixel is visible — fastest trigger.
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
      video.removeEventListener('error',      onError)
      video.removeEventListener('loadeddata', onLoadedData)
      video.pause()
      video.removeAttribute('src')
      video.load()
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
        // Drop ready state so poster re-covers on tab return (avoids stale frame)
        setVideoReady(false)
      } else {
        video.muted = true
        retryTimer = window.setTimeout(() => {
          video.play().catch(() => {})
          // markReady fires again via the 'playing' event in the main effect
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

  // Poster is ALWAYS rendered and ALWAYS mounted — opacity snaps to 0 instantly
  // (no transition) when the video is ready. This keeps a pixel-perfect cover
  // over the video at all times with zero fade delay.
  const posterOpaque = !videoReady || skipVideo

  return (
    <section
      className={`relative h-screen w-full overflow-hidden flex flex-col ${className}`}
      style={{ backgroundColor: '#111' }}
    >
      {/* z=0 — video layer */}
      {!skipVideo && (
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}
        >
          <video
            key={`${publicId}-${videoKey}`}
            ref={setVideoRef}
            // NOTE: no `autoPlay` HTML attribute — we use video.play() imperatively
            // so we get a catchable Promise. The HTML attribute offers no error
            // signal and behaves inconsistently across browsers.
            muted
            loop
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
              // Video is always opacity:1. The poster on top controls visibility.
              opacity: 1,
            }}
          />
        </div>
      )}

      {/* z=1 — poster layer (always mounted, snaps off instantly when video is ready) */}
      <div
        onClick={showPlayButton ? handleManualPlay : undefined}
        aria-hidden="true"
        style={{
          ...FILL_STYLE,
          zIndex:        1,
          cursor:        showPlayButton ? 'pointer' : 'default',
          opacity:       posterOpaque ? 1 : 0,
          // No transition — instant cut from poster to video, as requested.
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
          // fetchpriority="high" is critical: the poster is typically the LCP element.
          // Only 17% of pages set this despite it being one of the easiest LCP wins.
          {...({ fetchpriority: 'high' } as any)}
          // decoding="sync" avoids a layout-then-paint gap for above-the-fold images.
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

      {/* z=2 — gradient overlay */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:         0,
          zIndex:        2,
          background:    'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* z=3 — content */}
      <div className="relative w-full h-full" style={{ zIndex: 3 }}>
        {children}
      </div>
    </section>
  )
}

export default HeroVideoSection
