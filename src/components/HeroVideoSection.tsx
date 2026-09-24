/**
 * HeroVideoSection — v15
 *
 * Changes from v14:
 *
 * 1. ORIENTATION-BASED VIDEO SELECTION.
 *    On mobile the vertical (`mobilePublicId`) video now plays only while the
 *    phone is in PORTRAIT; in LANDSCAPE the horizontal (`publicId`) video plays.
 *    Implemented with `useIsPortraitMobile` (matchMedia orientation + small
 *    screen check) instead of the plain <768px width check.
 *
 * 2. NO REPLAY WHEN ONLY ONE VIDEO VERSION EXISTS.
 *    Resizing / rotating / crossing a breakpoint used to reload the video even
 *    when the resolved id was identical. The swap effect now only reacts when
 *    the RESOLVED public id actually changes, and never bumps `videoKey`
 *    (replay) on a mere layout change. Replay/swap therefore only happens for
 *    videos that genuinely have different desktop/mobile versions.
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
   * Optional controlled Cloudinary public_id for the MOBILE PORTRAIT
   * (vertical) viewport. When provided, this video plays instead of
   * `publicId` whenever the device is a phone held in portrait. In landscape
   * (or on desktop) `publicId` (the horizontal cut) plays. If omitted, the
   * horizontal video plays in every orientation, unchanged from before.
   */
  mobilePublicId?: string
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

// ── Reconnection tuning ─────────────────────────────────────────────────────
// A long-backgrounded (or briefly network-dropped) tab can leave the video's
// underlying fetch dead: `play()` resolves and `video.paused` stays `false`,
// but no further frames ever arrive — a plain play() retry can't fix that,
// only a full reload (new network request) resumed at the same currentTime
// can. These control when we treat playback as "disconnected".
const RECONNECT_STALL_GRACE_MS      = 4000  // wait this long after stalled/waiting before reloading
const RECONNECT_WATCHDOG_TICK_MS    = 4000  // how often we check that currentTime is actually advancing
const RECONNECT_MAX_ATTEMPTS        = 5     // give up (show tap-to-play) after this many failed reloads in a row
const HIDDEN_FORCE_RECONNECT_MS     = 15000 // tab hidden at least this long → assume the connection died, reload proactively on return

// Max SHORT-side (in px) for a device to still count as a phone when held in
// landscape. A phone in landscape can easily be wider than 768px (e.g.
// 844×390), so width alone can't identify it — but its short side (height)
// stays small. Tablets/desktops have a much larger short side.
const PHONE_LANDSCAPE_MAX_HEIGHT_PX = 500

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

// True ONLY when the device is a phone held in PORTRAIT (narrow AND taller
// than wide). This is the single signal that selects the vertical video:
//   - phone portrait   → true  → vertical video
//   - phone landscape  → false → horizontal video
//   - tablet / desktop → false → horizontal video
//
// Uses matchMedia (orientation: portrait) + the same <768px width test the
// layout uses, so a phone rotating to landscape (which usually exceeds the
// width breakpoint or is short-sided) always resolves to the horizontal cut.
function useIsPortraitMobile() {
  const query = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px) and (orientation: portrait)`

  const [isPortraitMobile, setIsPortraitMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const handler = () => setIsPortraitMobile(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])

  return isPortraitMobile
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

const HeroVideoSection: React.FC<HeroVideoSectionProps> = ({ className = '', children, publicId: controlledPublicId, mobilePublicId: controlledMobilePublicId, onEnded, onProgress }) => {
  useEffect(() => { injectControlHideStyle() }, [])

  const isMobile = useIsMobileViewport()
  const isPortraitMobile = useIsPortraitMobile()
  const frozenHeight = useFrozenViewportHeight(isMobile)

  // Pick the vertical id ONLY when a mobile/vertical variant was given AND
  // the phone is currently held in portrait. In landscape (or on any larger
  // screen) the horizontal `publicId` plays. If no mobile variant exists,
  // this always resolves to the horizontal id, so the id never changes on
  // rotate/resize — which is what prevents needless reloads (see the swap
  // effect below).
  const effectiveControlledPublicId =
    isPortraitMobile && controlledMobilePublicId ? controlledMobilePublicId : controlledPublicId

  const isControlled = effectiveControlledPublicId != null && effectiveControlledPublicId !== ''

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

  // When the tab was last hidden — used by the visibilitychange effect to
  // decide whether a returning tab needs a cheap play() retry or a full
  // reconnect (see HIDDEN_FORCE_RECONNECT_MS).
  const hiddenAtRef = useRef<number | null>(null)

  const [videoReady,     setVideoReady]     = useState(false)
  const [publicId,       setPublicId]       = useState(() => effectiveControlledPublicId || getHeroVideo().public_id)
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

  // Controlled mode: react to the RESOLVED public id changing (e.g. the user
  // clicking a different project tab, the carousel auto-advancing after an
  // `ended` event, or — for projects that have BOTH a horizontal and a
  // vertical cut — the phone rotating between landscape and portrait).
  //
  // KEY BEHAVIOUR: this only swaps/reloads the video when the resolved id
  // actually DIFFERS from what's currently loaded. When it's the same id
  // (a project with only one video version, where rotate/resize resolves to
  // the identical id), nothing happens — no state reset, no `videoKey` bump,
  // no reload/replay. The old `else setVideoKey(k => k + 1)` branch used to
  // force a replay on every layout change; it's removed here.
  //
  // Comparison is against `publicIdRef` (kept in sync every render), not the
  // `publicId` state, to avoid stale-closure decisions — see the earlier
  // "video replays instead of advancing" fix rationale.
  const publicIdRef = useRef(publicId)
  publicIdRef.current = publicId

  useEffect(() => {
    if (!isControlled) return
    const next = effectiveControlledPublicId as string
    if (next === publicIdRef.current) return // same video → leave playback untouched
    setVideoReady(false)
    setShowPlayButton(false)
    setPublicId(next)
    // Depends ONLY on the resolved id (+ isControlled). Crossing a
    // breakpoint or rotating re-runs this only when it actually changes
    // which id is resolved, i.e. only for videos with different versions.
  }, [effectiveControlledPublicId, isControlled])

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

    // ── Reconnection / stall recovery ─────────────────────────────────────
    // Covers two failure modes a plain play()-retry can't fix:
    //  1. `error` — the browser gave up on the network resource outright.
    //  2. A silent stall — `paused` is false and no `error` fired, but no
    //     new frames are arriving (dead connection after a long background
    //     period, or a flaky network mid-playback). Caught by listening for
    //     `stalled`/`waiting` (with a grace period, since both fire
    //     transiently during normal buffering) AND by a watchdog that
    //     simply checks whether `currentTime` is still advancing.
    // Recovery is always the same: drop the current src, reload it fresh,
    // seek back to roughly where we were, and attempt play() again — with
    // capped exponential backoff so a truly dead network doesn't spin
    // forever (we fall back to the tap-to-play button after enough tries).
    let reconnectAttempts = 0
    let reconnecting = false
    let reconnectTimer: number | undefined
    let stalledGraceTimer: number | undefined
    let watchdogInterval: number | undefined
    let lastWatchdogTime = -1

    const clearReconnectTimers = () => {
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(stalledGraceTimer)
      reconnectTimer = undefined
      stalledGraceTimer = undefined
    }

    const reconnect = (reason: string) => {
      if (destroyed || reconnecting) return
      if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
        console.warn('[HeroVideo] reconnect: giving up after', reconnectAttempts, 'attempts')
        setShowPlayButton(true)
        return
      }
      reconnecting = true
      reconnectAttempts += 1
      const attempt = reconnectAttempts
      const delay = Math.min(500 * 2 ** (attempt - 1), 8000)
      console.warn(`[HeroVideo] reconnecting (${reason}) — attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS} in ${delay}ms`)
      window.clearTimeout(reconnectTimer)
      reconnectTimer = window.setTimeout(() => {
        if (destroyed) { reconnecting = false; return }
        const resumeAt = isFinite(video.currentTime) ? video.currentTime : 0

        // Seek BEFORE any frame is decoded/painted, so a mid-playback
        // reload never visibly flashes frame 1 (which is what the poster
        // image itself is generated from, so it reads as "the poster
        // popping up mid-video"). `loadedmetadata` fires as soon as
        // duration/dimensions are known — before the browser has decoded
        // a single frame — so seeking there means the FIRST frame this
        // reload ever paints is already the resumed one. Seeking later,
        // on `loadeddata`, is too late: that event means a frame (frame 0)
        // has already been decoded and shown.
        const onReloadMetadata = () => {
          video.removeEventListener('loadedmetadata', onReloadMetadata)
          if (destroyed) return
          const dur = video.duration
          if (resumeAt > 0.25 && (!isFinite(dur) || resumeAt < dur - 0.25)) {
            try { video.currentTime = resumeAt } catch {}
          }
        }
        const onReloadedData = () => {
          video.removeEventListener('loadeddata', onReloadedData)
          if (destroyed) { reconnecting = false; return }
          reconnecting = false
          attemptPlay()
        }
        video.addEventListener('loadedmetadata', onReloadMetadata, { once: true })
        video.addEventListener('loadeddata',      onReloadedData,  { once: true })
        video.pause()
        video.src = videoSrcRef.current
        video.load()
      }, delay)
    }

    // A successful, actually-progressing play means the connection is good
    // again — clear the failure count so a later, unrelated hiccup starts
    // its backoff from zero instead of picking up where an old one left off.
    const resetReconnect = () => { reconnectAttempts = 0 }

    const armStallGrace = (reason: string) => {
      if (destroyed || reconnecting) return
      window.clearTimeout(stalledGraceTimer)
      stalledGraceTimer = window.setTimeout(() => {
        if (destroyed || video.paused || video.ended) return
        reconnect(reason)
      }, RECONNECT_STALL_GRACE_MS)
    }

    // Stash on the element so the visibilitychange effect — which mounts as a
    // separate useEffect and has no closure access to these — can trigger
    // the same recovery paths instead of calling video.play() directly and
    // leaving videoReady permanently false, or silently doing nothing when
    // the connection is actually dead.
    ;(video as any).__heroMarkReady   = markReady
    ;(video as any).__heroAttemptPlay = attemptPlay
    ;(video as any).__heroReconnect   = reconnect

    const onPlaying    = () => { markReady(); resetReconnect(); window.clearTimeout(stalledGraceTimer) }
    const onLoadedData = () => { if (!destroyed && video.paused) attemptPlay() }
    const onError      = () => {
      if (destroyed || !video.error) return
      console.warn('[HeroVideo] error', video.error.code, video.error.message)
      reconnect('error')
    }
    const onStalled = () => armStallGrace('stalled')
    const onWaiting = () => armStallGrace('waiting')
    // 'progress' (new bytes arriving) and 'playing' both mean data is
    // actually flowing again — cancel any pending stall→reconnect timer.
    const onProgressEvent = () => window.clearTimeout(stalledGraceTimer)
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
    video.addEventListener('stalled',    onStalled)
    video.addEventListener('waiting',    onWaiting)
    video.addEventListener('progress',   onProgressEvent)

    // Watchdog: belt-and-braces check for the case none of the above events
    // fire but the video is simply frozen (paused === false, no error, no
    // stalled/waiting) — currentTime just never advances. Only meaningful
    // while the tab is actually visible; a hidden tab is expected to make no
    // progress and is handled separately by the visibilitychange effect.
    watchdogInterval = window.setInterval(() => {
      if (destroyed || document.visibilityState !== 'visible') return
      if (video.paused || video.ended) return
      if (lastWatchdogTime >= 0 && video.currentTime === lastWatchdogTime) {
        reconnect('watchdog-frozen')
      }
      lastWatchdogTime = video.currentTime
    }, RECONNECT_WATCHDOG_TICK_MS)

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
      clearReconnectTimers()
      window.clearInterval(watchdogInterval)
      observer?.disconnect()
      video.removeEventListener('playing',    onPlaying)
      video.removeEventListener('error',      onError)
      video.removeEventListener('loadeddata', onLoadedData)
      video.removeEventListener('ended',      onEnded)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('stalled',    onStalled)
      video.removeEventListener('waiting',    onWaiting)
      video.removeEventListener('progress',   onProgressEvent)
      delete (video as any).__heroMarkReady
      delete (video as any).__heroAttemptPlay
      delete (video as any).__heroReconnect
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [skipVideo, autoplayState, publicId, videoKey])

  // ── Tab visibility ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (skipVideo) return
    let retryTimer: number | undefined
    let watchTimer: number | undefined
    const handle = () => {
      const video = videoRef.current
      if (!video) return
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(retryTimer)
        window.clearTimeout(watchTimer)
        hiddenAtRef.current = Date.now()
      } else {
        video.muted = true
        const hiddenFor = hiddenAtRef.current != null ? Date.now() - hiddenAtRef.current : 0
        hiddenAtRef.current = null

        const reconnect = (video as any).__heroReconnect as ((reason: string) => void) | undefined

        // A resource error, or a tab hidden long enough that the browser
        // likely dropped the video's network connection in the background,
        // needs a full reload — a plain play() retry won't bring frames
        // back. Otherwise (a quick tab switch) a cheap play() retry is
        // enough, same as before.
        if (video.error && reconnect) {
          reconnect('visibility-resume-error')
          return
        }
        if (hiddenFor >= HIDDEN_FORCE_RECONNECT_MS && reconnect) {
          reconnect('visibility-resume-long-hidden')
          return
        }

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

          // Belt-and-braces: even a "successful" play() can leave the
          // video frozen (connection dead but no error/stalled event ever
          // fired). Check shortly after whether currentTime actually moved;
          // if not, escalate to a full reconnect. The main effect's own
          // watchdog interval also covers this ongoing, but this check
          // reacts immediately on resume instead of waiting for the first
          // watchdog tick.
          const startTime = el.currentTime
          watchTimer = window.setTimeout(() => {
            const el2 = videoRef.current
            if (!el2 || el2.paused || el2.ended) return
            if (el2.currentTime === startTime) {
              const rc = (el2 as any).__heroReconnect as ((reason: string) => void) | undefined
              rc?.('visibility-resume-frozen')
            }
          }, RECONNECT_STALL_GRACE_MS)
        }, 0)
      }
    }
    document.addEventListener('visibilitychange', handle)
    return () => {
      window.clearTimeout(retryTimer)
      window.clearTimeout(watchTimer)
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
