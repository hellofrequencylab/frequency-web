// Fullscreen — a best-effort takeover helper for the timer + capture surfaces
// (WEBSITE-CHANGES-PLAN C.1-3). The browser only grants Element.requestFullscreen
// from inside a user gesture (a click/tap), so these MUST be called straight from
// a click handler, never from a passive effect. Everything is wrapped so a denied
// or unsupported call simply no-ops: iOS Safari has no Element.requestFullscreen,
// so the dvh takeover the surfaces already render stays the fallback.

/** Enter the app's fullscreen-style takeover for the timer + capture surfaces.
 *
 *  DECISION (owner, 2026-06-22): we deliberately do NOT call Element.requestFullscreen.
 *  True browser fullscreen shows a native, unsuppressible banner ("... is now full screen,
 *  press Esc to exit") that read as an intrusive warning popup over the timer. The surfaces
 *  already render a full-viewport (100dvh) takeover, which gives the same immersive feel
 *  with no OS banner, so that is now the ONLY fullscreen mechanism. Kept async + named so
 *  the click-handler callers stay unchanged; this is an intentional no-op (the dvh takeover
 *  is the layout, not an API call). */
export async function requestAppFullscreen(): Promise<void> {
  // Intentional no-op: the dvh takeover the surfaces render IS the fullscreen.
}

/** Drop true fullscreen if we're in it. Best-effort; never throws. Safe to call
 *  even when we never entered fullscreen (it no-ops). */
export async function exitAppFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen()
    }
  } catch {
    // already out, or denied — fine
  }
}
