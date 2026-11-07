/**
 * heroProgress.ts
 *
 * Tiny external store for the hero video's playback progress (0–1).
 *
 * Why this exists: the progress used to live in HomePage's React state
 * (`setHeroVideoProgress`), so every `timeupdate` tick (~4×/sec) re-rendered
 * the ENTIRE homepage component. On a phone that steady re-rendering keeps the
 * main thread busy and makes taps on the project numbers feel laggy/slow.
 *
 * With this store only the small progress line under the active number
 * subscribes (via useSyncExternalStore), so a tick re-renders just that line.
 *
 * There is only ever one hero on screen, so a module-level singleton is enough.
 */

type Listener = () => void

let value = 0
const listeners = new Set<Listener>()

export const heroProgress = {
  /** Current progress as a fraction 0–1. */
  get: (): number => value,

  /** Update the progress; subscribers are only notified when it changes. */
  set: (next: number): void => {
    const clamped = Number.isFinite(next) ? Math.min(Math.max(next, 0), 1) : 0
    if (clamped === value) return
    value = clamped
    listeners.forEach((l) => l())
  },

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
