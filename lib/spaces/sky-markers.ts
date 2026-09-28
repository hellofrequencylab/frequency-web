// Per-Space opt-in for the sky markers on its calendar (LIVE-526), stored on
// `preferences.skyMarkers`. Fail-safe reader + immutable, SPARSE writer, mirroring
// lib/spaces/storefront.ts. PURE (no I/O) so it is trivially testable and safe to import anywhere.
//
// WHY A PREFERENCE AND NOT A SPACE FUNCTION. The function registry is FROZEN by owner ruling
// (ADR-1508 / OWN-048), and OWN-048's probe asserts the exact vocabulary and the exact row count, so
// a twentieth key fails `pnpm check:backlog` by design -- "which is how the question comes back to
// the owner instead of drifting". Two further reasons it would be the wrong seam even unfrozen:
// a function cannot be declared default-OFF (`spaceFunctionEnabled` reads an absent key as ON), and
// every function key is required to have a console module behind it. This is a display option on a
// calendar that already has a function (`events`), not a new tool.
//
// THE PRECEDENT IS SHOP. `preferences.storefront.published` is the same shape: default false, and
// the public tab is gated on the preference AND the function together
// (lib/spaces/profile-nav.ts). Sky markers compose the same way: `events` must be on, and this
// must be true.
//
// DEFAULT OFF, deliberately (owner decision 2026-09-27). Moon phases and zodiac ingresses suit some
// Spaces and would read as noise on a coworking or trades Space, so nobody wakes up with astrology
// on their calendar.

/** Whether this Space draws the sky on its calendar. FAIL-SAFE: anything malformed reads as off. */
export function readSkyMarkersEnabled(preferences: unknown): boolean {
  const prefs = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? (preferences as Record<string, unknown>)
    : {}
  return prefs.skyMarkers === true
}

/**
 * A NEW preferences object with the flag set (input untouched).
 *
 * SPARSE: turning it off DELETES the key rather than writing `false`, so a Space that never wanted
 * this keeps a clean blob and the stored shape says only what an operator actually chose. That is
 * the same rule `nextCoverFocusPreferences` follows, and it is why the reader treats absent as off.
 */
export function nextSkyMarkerPreferences(preferences: unknown, enabled: boolean): Record<string, unknown> {
  const prefs = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? { ...(preferences as Record<string, unknown>) }
    : {}
  if (enabled) prefs.skyMarkers = true
  else delete prefs.skyMarkers
  return prefs
}
