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
  /**
   * Optional controlled Cloudinary public_id. When provided, the section
   * plays this video instead of the global CMS-managed hero video singleton
   * (getHeroVideo()) — used by the homepage's project carousel, where each
   * project tab has its own video. Swapping this prop reuses the exact same
   * ready-state/autoplay/poster machinery as the default (uncontrolled)
   * singleton mode; it does not touch the global heroVideoChanged/localStorage
   * CMS sync, so switching project tabs never broadcasts to other tabs/users.
   */
  publicId?: string
  /**
   * Called when the current video finishes a full playthrough. When provided,
   * the <video> is rendered WITHOUT `loop` (so `ended` actually fires) — used
   * by the homepage's project carousel to advance to the next project only
   * once the current one's video has played in full, instead of on a fixed
   * timer. When omitted, playback loops forever as before.
   */
  onEnded?: () => void
  /**
   * Called continuously while the video plays with its progress as a
   * fraction (0–1) of `duration`. Used by the homepage's project carousel
   * to draw a growing progress line under the active project's number.
   * Fires on every `timeupdate` tick (browser-native, ~4×/sec) — no manual
   * rAF loop needed since the bar doesn't need sub-frame smoothness.
   */
  onProgress?: (fraction: number) => void
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

// Mobile viewport-height fix
// ─────────────────────────────────────────────────────────────────────────
// On mobile browsers, `100vh` is the LARGEST possible viewport (as if the
// address bar / bottom nav were hidden). That makes the hero section taller
// than what's actually visible once the browser chrome is showing, so the
// bottom of the video + the client logos bar end up hidden behind it.
//
// We originally used `100dvh` (dynamic viewport height) to fix this, but
// `dvh` is *live* — it recalculates continuously as the browser shows/hides
// its UI, which in several mobile browsers happens WHILE SCROLLING (the
// address bar collapses as you scroll down the page). That made the hero
// section visibly grow/shrink mid-scroll, which is worse than the original
// bug.
//
// Fix: measure the viewport height ONCE on mount (and only re-measure on a
// genuine viewport-size change, like a rotation — never in response to
// scroll) and freeze the crop to that pixel value via inline style. This
// gives us the "size correctly for whichever browser chrome is present"
// behaviour without any live recalculation once the page has settled.
//
// `window.innerHeight` at mount time reflects whatever browser-chrome state
// is showing at that moment (typically chrome visible, since the page just
// loaded) — i.e. the SMALLEST/most conservative height, so nothing ever
// ends up hidden behind the address bar/bottom nav, on any mobile browser.
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

// Measures viewport height ONCE (on mount) and freezes it permanently for
// that page load — it is never recalculated in response to `resize`, since
// on mobile browsers `resize` fires both for genuine viewport changes AND
// for the address-bar/bottom-nav collapsing while scrolling, and there is
// no fully reliable way to tell those apart across all browsers. Listening
// to `resize` at all (even with heuristics) was what caused the crop to
// still visibly change while scrolling.
//
// The only case we deliberately re-measure for is an actual device
// rotation, detected via the `screen.orientation` API (falls back to the
// `orientationchange` event where that API isn't available) — a genuine
// portrait↔landscape change, which is unambiguous and unrelated to scroll.
function useFrozenViewportHeight(active: boolean) {
  const [height, setHeight] = useState<number | null>(() => {
    if (typeof window === 'undefined' || !active) return null
    return window.innerHeight
  })

  useEffect(() => {
    if (!active || typeof window === 'undefined') return

    // Lock in the height for this mount. A short delay lets the browser
    // settle its chrome to a stable state right after navigation/load
    // before we take the permanent measurement.
    const initialTimer = window.setTimeout(() => {
      setHeight(window.innerHeight)
    }, 50)

    let lastOrientation =
      typeof screen !== 'undefined' && screen.orientation
        ? screen.orientation.type
        : null

    const remeasureAfterRotation = () => {
      // Give the browser a moment to finish laying out the rotated page
      // before reading the new height.
      window.setTimeout(() => setHeight(window.innerHeight), 200)
    }

    const handleOrientationApi = () => {
      const current = screen.orientation?.type ?? null
      if (current !== lastOrientation) {
        lastOrientation = current
        remeasureAfterRotation()
      }
    }

    // Prefer the unambiguous Screen Orientation API; fall back to the
    // legacy event only where that API isn't supported. Never listen to
    // plain `resize` — that's the event that fires during address-bar
    // collapse/expand while scrolling.
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

const HeroVideoSection: React.FC<HeroVideoSectionProps> = ({ className = '', children, publicId: controlledPublicId, onEnded, onProgress }) => {
  useEffect(() => { injectControlHideStyle() }, [])
  const isControlled = controlledPublicId != null && controlledPublicId !== ''

  const isMobile = useIsMobileViewport()
  const frozenHeight = useFrozenViewportHeight(isMobile)

  // The engine's WeakMap key is the {videoRef, sectionRef} object itself, so
  // for the NavBar (which lives outside this component, as a sibling above
  // the routed page) to share the same engine/registrations as the hero's
  // own logo/subtitle, everyone needs the *same* context object. That
  // ambient object is now provided once, above the NavBar, in App.tsx's
  // SiteShell — we consume it here and write our real video/section DOM
  // refs into it, rather than creating (and re-providing) a fresh one
  // scoped to just this subtree. Falls back to a locally-created value if
  // this component is ever rendered without that ancestor provider.
  const ambientHeroFrameContext = useContext(HeroFrameContext)
  const ownVideoRef   = useRef<HTMLVideoElement>(null)
  const ownSectionRef = useRef<HTMLElement>(null)
  const videoRef   = ambientHeroFrameContext?.videoRef ?? ownVideoRef
  const sectionRef = ambientHeroFrameContext?.sectionRef ?? ownSectionRef
  // Stable ref for current video src — avoids re-running setVideoRef on every render
  const videoSrcRef = useRef<string>('')
  // Stable ref for the latest onEnded callback — read inside the main
  // playback effect without needing it in that effect's dependency array
  // (which would otherwise tear down/rebuild all the play/ready machinery
  // any time the parent passes a new function identity).
  const onEndedRef = useRef<(() => void) | undefined>(onEnded)
  onEndedRef.current = onEnded

  // Same stable-ref pattern for onProgress — read inside the main effect
  // below without retriggering it on every parent render.
  const onProgressRef = useRef<((fraction: number) => void) | undefined>(onProgress)
  onProgressRef.current = onProgress

  const [videoReady,     setVideoReady]     = useState(false)
  const [publicId,       setPublicId]       = useState(() => controlledPublicId || getHeroVideo().public_id)
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
    // Required BEFORE `src` is assigned so the video is fetched in CORS
    // mode — without this, drawing frames to the adaptive-shadow engine's
    // canvas throws a SecurityError ("tainted canvas") and getImageData
    // becomes unusable. Cloudinary's delivery CDN sends
    // Access-Control-Allow-Origin: * on these URLs, so this is a no-op for
    // playback itself and only unlocks canvas readback.
    el.crossOrigin = 'anonymous'
    el.muted  = true
    el.volume = 0
    el.src    = videoSrcRef.current
    el.play().catch(() => {})
  }, [])

  // Controlled mode: react to the parent swapping `publicId` (e.g. the user
  // clicking a different project tab in the carousel, or the carousel
  // auto-advancing after a video's `ended` event). Goes through the exact
  // same "ready" reset the CMS listener below uses, so playback engages
  // identically either way.
  //
  // IMPORTANT: this compares against `publicIdRef` (a ref kept in sync with
  // the `publicId` state on every render — see below), not the `publicId`
  // state variable itself. Comparing against the state directly here was
  // the source of the "video replays instead of advancing" bug: this effect
  // intentionally omits `publicId` from its dependency array (so it only
  // reacts to the PARENT's index change, not to its own resulting state
  // update), but that meant the comparison could run against a `publicId`
  // value from a stale closure — e.g. when `ended` fires and the parent
  // advances the index in the same tick that a previous state update from
  // this exact effect is still being committed, the effect could re-fire
  // while still "seeing" the OLD publicId, decide `next === publicId`, and
  // take the `else` branch (just bump `videoKey`) instead of switching to
  // the new project — which replays the current project's video instead of
  // advancing to the next one. Reading from a ref sidesteps this: the ref
  // is always up to date the instant `publicId` state changes, regardless
  // of which render's closure this effect happens to be running in.
  const publicIdRef = useRef(publicId)
  publicIdRef.current = publicId

  useEffect(() => {
    if (!isControlled) return
    const next = controlledPublicId as string
    setVideoReady(false)
    setShowPlayButton(false)
    if (next !== publicIdRef.current) setPublicId(next)
    else                               setVideoKey((k) => k + 1)
  }, [controlledPublicId, isControlled])

  // CMS replacement listener — only relevant in uncontrolled (singleton)
  // mode. In controlled mode the parent owns publicId entirely, so this
  // global event (fired by the admin video uploader / cross-tab sync) is
  // ignored — otherwise an admin uploading a new global hero video would
  // hijack whichever project the carousel currently has active.
  useEffect(() => {
    if (isControlled) return
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

    // Single code path to "ready". We wait for requestVideoFrameCallback so the
    // poster is only removed once a real decoded frame has been composited —
    // eliminating any black-gap frame. rVFC is baseline across all evergreen
    // browsers (Chrome 83+, Safari 15.4+, Firefox 132+ as of Oct 2024).
    // Exposed on the element itself so the visibilitychange effect (a separate
    // effect, with no access to these closures) can call the exact same path
    // when resuming from a backgrounded tab — this is what was missing before
    // and is why the poster used to stay stuck over a silently-resumed video.
    const markReady = () => {
      if (destroyed) return
      window.clearTimeout(revealTimer)
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

    // Re-entrant: safe to call from loadeddata, the IntersectionObserver, and
    // the visibilitychange effect without stacking duplicate grace-period
    // timers or play-button flashes (the old version queued a fresh 800ms
    // timer + 'playing' listener on every call site, so two concurrent calls
    // could race — one path's timer firing the play button right as the
    // other path's play() was about to legitimately succeed).
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
        // Brief grace period before showing the play button — the 'playing'
        // event may still fire quickly on fast connections, or a queued
        // retry (e.g. from tab-visibility recovery) may succeed first.
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

    // Stash on the element so the visibilitychange effect — which mounts as a
    // separate useEffect and has no closure access to markReady/attemptPlay —
    // can resume playback through the same ready-state path instead of
    // calling video.play() directly and leaving videoReady permanently false.
    ;(video as any).__heroMarkReady  = markReady
    ;(video as any).__heroAttemptPlay = attemptPlay

    const onPlaying    = () => markReady()
    const onLoadedData = () => { if (!destroyed && video.paused) attemptPlay() }
    const onError      = () => {
      if (destroyed || !video.error) return
      console.warn('[HeroVideo] error', video.error.code, video.error.message)
    }
    // Only relevant when `loop` is off (i.e. an onEnded callback was passed
    // in) — fires once the current video has played all the way through.
    // Guarded with `firedEnded` so a duplicate/late `ended` dispatch on this
    // same element (e.g. a stray event still in flight right as the effect
    // tears down for the next project) can never call the advance callback
    // twice, which would skip a project instead of just advancing by one.
    let firedEnded = false
    const onEnded = () => {
      if (destroyed || firedEnded) return
      firedEnded = true
      onEndedRef.current?.()
    }

    // Reset to 0 immediately for this (new) video — avoids the progress line
    // briefly showing the previous project's leftover fraction before this
    // element's own timeupdate ticks start coming in.
    onProgressRef.current?.(0)
    const onTimeUpdate = () => {
      if (destroyed) return
      const duration = video.duration
      if (!duration || !isFinite(duration)) return
      onProgressRef.current?.(video.currentTime / duration)
    }

    // NOT { once: true } — after a tab-visibility resume the video can pause
    // and re-fire 'playing' again later (e.g. another background/foreground
    // cycle), and we need markReady to run every time, not just the first.
    video.addEventListener('playing',    onPlaying)
    video.addEventListener('loadeddata', onLoadedData, { once: true })
    video.addEventListener('error',      onError)
    video.addEventListener('ended',      onEnded)
    video.addEventListener('timeupdate', onTimeUpdate)

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
      video.removeEventListener('ended',      onEnded)
      video.removeEventListener('timeupdate', onTimeUpdate)
      delete (video as any).__heroMarkReady
      delete (video as any).__heroAttemptPlay
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
      } else {
        video.muted = true
        retryTimer = window.setTimeout(() => {
          const el = videoRef.current
          if (!el) return
          // Route through the SAME ready-state machinery the main effect
          // uses, via the functions it stashed on the element. Calling
          // el.play() directly here (the old behaviour) could genuinely
          // resume playback while videoReady stayed stuck at false — the
          // old code also force-set that to false on hide — leaving the
          // poster frozen on top of an actually-playing video after a
          // long backgrounded tab.
          const attempt = (el as any).__heroAttemptPlay as (() => void) | undefined
          if (attempt) {
            attempt()
          } else {
            // Effect hasn't (re)mounted its listeners yet — fall back, but
            // still resolve to the ready state once playback confirms.
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

  // Poster is ALWAYS rendered and ALWAYS mounted — opacity snaps to 0 instantly
  // (no transition) when the video is ready. This keeps a pixel-perfect cover
  // over the video at all times with zero fade delay.
  const posterOpaque = !videoReady || skipVideo

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className={`relative w-full overflow-hidden flex flex-col ${!isMobile ? 'h-screen' : ''} ${className}`}
      style={{
        backgroundColor: '#111',
        // Mobile: use a height measured ONCE on mount and frozen forever
        // after, so the crop never changes again — not on scroll, not on
        // address-bar collapse/expand, nothing. Before that JS measurement
        // resolves (effectively instant, since it reads window.innerHeight
        // synchronously in useState's initializer) this falls back to the
        // static `100vh` — deliberately NOT `100dvh`, since dvh is itself
        // the live-recalculating unit we're avoiding. Desktop keeps
        // `h-screen` (100vh) via the class above.
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
            key={`${publicId}-${videoKey}`}
            ref={setVideoRef}
            // NOTE: no `autoPlay` HTML attribute — we use video.play() imperatively
            // so we get a catchable Promise. The HTML attribute offers no error
            // signal and behaves inconsistently across browsers.
            muted
            // Looping is disabled whenever a parent wants to know when this
            // video finishes (onEnded) — e.g. the project carousel, which
            // advances to the next project only once the current video has
            // played in full, instead of looping the same clip forever.
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

      {/* z=3 — content */}
      {/* No local HeroFrameContext.Provider here: the ambient one from
          SiteShell (App.tsx) already covers this subtree, and reusing it
          (rather than shadowing it with a new provider/value) is what lets
          the NavBar share the same adaptive-shadow engine — see the
          videoRef/sectionRef comment above. */}
      <div className="relative w-full h-full" style={{ zIndex: 3 }}>
        {children}
      </div>
    </section>
  )
}

export default HeroVideoSection
