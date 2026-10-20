/**
 * adminHeroAutoplay — "no hero autoplay while logged in as admin".
 *
 * WHY AN EXTERNAL STORE (and not useAuth() in HeroVideoSection):
 * AuthContext's value is a new object on every provider render, so any
 * `useAuth()` consumer re-renders several times during startup
 * (loading → session → profile …). For ordinary visitors that would add
 * re-renders to the hero during the most performance-critical moment of the
 * page load. This store only notifies subscribers when its BOOLEAN snapshot
 * actually changes — for non-admins and logged-out visitors it is `false`
 * from the very first render and never changes, so they get zero extra
 * renders and zero waiting on auth: the hero behaves exactly as before.
 *
 * HOW THE SNAPSHOT IS DECIDED:
 *   • Before the profile for this page load has been resolved, we use a
 *     synchronous localStorage HINT written the last time an admin was
 *     confirmed. This lets an admin's very first render already skip
 *     autoplay (no wasted video download, no "starts then pauses" flash).
 *     A visitor who never was an admin has no hint → snapshot is `false`.
 *   • Once AuthContext has resolved the profile, the real `is_admin` value
 *     wins (and the hint is refreshed). A stale/forged hint therefore
 *     can't keep a non-admin's video paused beyond the profile fetch, and
 *     it never grants any permissions — it only affects autoplay.
 *   • A transient profile-fetch ERROR does not resolve anything (the hint
 *     stays in charge) so a network blip can't flip an admin's video on.
 */
import { useSyncExternalStore } from 'react'

const HINT_KEY = 'flai_admin_hero_hint'

function readHint(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

function writeHint(isAdmin: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (isAdmin) localStorage.setItem(HINT_KEY, '1')
    else localStorage.removeItem(HINT_KEY)
  } catch {
    /* storage unavailable (private mode / blocked) — hint is optional */
  }
}

let hint = readHint()
let resolved = false
let resolvedIsAdmin = false
const listeners = new Set<() => void>()

const snapshot = (): boolean => (resolved ? resolvedIsAdmin : hint)

function update(mutate: () => void): void {
  const before = snapshot()
  mutate()
  if (snapshot() !== before) listeners.forEach((l) => l())
}

/** Profile fetched successfully: `is_admin` is now authoritative. */
export function markAdminResolved(isAdmin: boolean): void {
  update(() => {
    resolved = true
    resolvedIsAdmin = isAdmin
    hint = isAdmin
    writeHint(isAdmin)
  })
}

/** No session / signed out: definitely not an admin. */
export function markNotLoggedIn(): void {
  markAdminResolved(false)
}

/** A (new) user's profile fetch has started: fall back to the hint until it lands. */
export function markAdminResolving(): void {
  update(() => {
    resolved = false
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** true while the current visitor is (or, until confirmed, is believed to be) an admin. */
export function useAdminHeroAutoplayOff(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
