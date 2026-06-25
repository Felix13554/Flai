/**
 * heroSync.ts
 *
 * Global hero video cache invalidation via Supabase Realtime.
 *
 * ─── Why this exists ──────────────────────────────────────────────────────────
 * The previous system used sessionStorage + window.dispatchEvent for cache
 * busting. Both are tab-local — other users / other tabs never received the
 * signal after a new video was uploaded.
 *
 * This module adds a second layer on top of heroPreload.ts:
 *   • Subscribes to a Supabase Realtime broadcast channel ('hero-video')
 *   • When a new video is uploaded the edge function (or VideoManager) broadcasts
 *     { publicId, stamp } to that channel
 *   • Every connected browser receives the event, calls bustHeroCache(), and the
 *     HeroVideoSection re-renders with the new video without any page reload
 *
 * ─── Loading-speed guarantee ──────────────────────────────────────────────────
 * • The Supabase client + channel subscription is created lazily in an
 *   requestIdleCallback so it never competes with the LCP video/poster.
 * • The subscription itself is a lightweight WebSocket — no polling, no extra
 *   HTTP requests on the critical path.
 * • If the WebSocket is not yet connected when a bust arrives (race on first
 *   load), HeroVideoSection already shows the cached poster instantly, so the
 *   user never sees a blank frame.
 *
 * ─── Integration ──────────────────────────────────────────────────────────────
 * Import and call initHeroSync() once at app startup (e.g. in main.tsx or
 * App.tsx). It is safe to call multiple times — subsequent calls are no-ops.
 *
 *   import { initHeroSync } from './utils/heroSync'
 *   initHeroSync()
 *
 * When a video is uploaded, broadcast the event from VideoManager or the edge
 * function using broadcastHeroUpdate(publicId).
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { bustHeroCache, getPosterStamp } from './heroPreload'

// ─── Config ───────────────────────────────────────────────────────────────────
// Re-use the existing Supabase project — no new infrastructure needed.

const SUPABASE_URL    = 'https://pbqeljimuerxatrtmgsn.supabase.co'
// Anon key is safe to expose (RLS enforced server-side).
// ⚠️  Replace this with your real anon key from:
//     Supabase Dashboard → Project Settings → API → anon public
const SUPABASE_ANON   = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const CHANNEL_NAME    = 'hero-video-sync'
const EVENT_NAME      = 'cache-bust'

// ─── Singleton state ──────────────────────────────────────────────────────────

let channel:     RealtimeChannel | null = null
let initialized: boolean                = false

// ─── Supabase client — created lazily, never on the critical path ─────────────

let _supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      realtime: {
        // Reconnect aggressively so users who return from sleep re-sync quickly.
        timeout: 20_000,
      },
      // Disable auth persistence — this client is read-only for realtime only.
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _supabase
}

// ─── Payload type ─────────────────────────────────────────────────────────────

export interface HeroBustPayload {
  /** Cloudinary public_id of the new hero video */
  publicId: string
  /** Unix ms timestamp — becomes the ?v=stamp query param on poster URLs */
  stamp:    number
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Subscribe to the shared broadcast channel.
 * Calls bustHeroCache() whenever another client publishes a new video.
 * Safe to call in SSR — no-ops when window is undefined.
 */
function subscribe(): void {
  if (typeof window === 'undefined' || channel) return

  const supabase = getSupabase()

  channel = supabase
    .channel(CHANNEL_NAME, {
      config: {
        broadcast: {
          // 'self: false' → don't echo back to the sender.
          // The sender already called bustHeroCache() directly.
          self: false,
          // ack: false → fire-and-forget, minimal latency.
          ack: false,
        },
      },
    })
    .on<HeroBustPayload>(
      'broadcast',
      { event: EVENT_NAME },
      ({ payload }) => {
        if (!payload?.publicId) return

        console.info(
          '[heroSync] Received cache-bust →',
          payload.publicId,
          'stamp:', payload.stamp
        )

        // bustHeroCache handles everything:
        //   • increments poster stamp  → forces new <img> src
        //   • mutates heroVideo singleton
        //   • dispatches 'heroVideoChanged' → HeroVideoSection reacts
        //   • updates preload <link> hints
        //   • warms HTTP cache in background (rIC)
        bustHeroCache(payload.publicId)
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info('[heroSync] Realtime channel ready')
      }
      if (status === 'CHANNEL_ERROR') {
        console.warn('[heroSync] Channel error — will retry')
        // Supabase Realtime auto-retries; no manual action needed.
      }
      if (status === 'TIMED_OUT') {
        console.warn('[heroSync] Channel timed out — reconnecting')
      }
    })
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

/**
 * broadcastHeroUpdate(publicId)
 *
 * Call this immediately after a successful Cloudinary upload.
 * It broadcasts the new publicId + stamp to ALL connected browsers via
 * Supabase Realtime — every user's HeroVideoSection will update within ~100 ms.
 *
 * VideoManager already calls bustHeroCache() for the uploading tab;
 * this call handles every other tab / user session.
 *
 * Usage (in VideoManager, after cldUpload resolves):
 *   import { broadcastHeroUpdate } from '../../utils/heroSync'
 *   broadcastHeroUpdate(result.public_id)
 */
export async function broadcastHeroUpdate(publicId: string): Promise<void> {
  if (typeof window === 'undefined') return

  // Ensure the channel is open before broadcasting.
  // subscribe() initiates an async WebSocket handshake — we must wait for the
  // channel to reach 'joined' state before calling .send(), otherwise the
  // message is silently dropped.
  if (!channel) subscribe()

  // Poll up to 4 s for the channel to become ready
  await new Promise<void>((resolve) => {
    if (channel?.state === 'joined') { resolve(); return }
    let attempts = 0
    const poll = setInterval(() => {
      if (channel?.state === 'joined' || ++attempts > 40) {
        clearInterval(poll)
        resolve()
      }
    }, 100)
  })

  const payload: HeroBustPayload = {
    publicId,
    stamp: Date.now(),
  }

  try {
    const result = await channel!.send({
      type:    'broadcast',
      event:   EVENT_NAME,
      payload,
    })
    if (result === 'ok') {
      console.info('[heroSync] Broadcast sent →', publicId)
    } else {
      console.warn('[heroSync] Broadcast result:', result)
    }
  } catch (err) {
    // Non-fatal — the uploading tab already called bustHeroCache() directly.
    console.warn('[heroSync] Broadcast failed (non-fatal):', err)
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * initHeroSync()
 *
 * Call once at app startup. Defers the WebSocket connection to an
 * requestIdleCallback so it never competes with LCP resources (video, poster).
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initHeroSync(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const connect = () => subscribe()

  if (typeof requestIdleCallback === 'function') {
    // Defer until after first paint — zero impact on LCP.
    requestIdleCallback(connect, { timeout: 5_000 })
  } else {
    // Safari fallback — still deferred past the current call stack.
    setTimeout(connect, 500)
  }
}

// ─── Cleanup (for hot-module-replacement in dev) ──────────────────────────────

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    if (channel) {
      await getSupabase().removeChannel(channel)
      channel = null
    }
    initialized = false
  })
}
