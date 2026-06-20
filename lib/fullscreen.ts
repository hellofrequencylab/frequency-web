// Fullscreen — a best-effort takeover helper for the timer + capture surfaces
// (WEBSITE-CHANGES-PLAN C.1-3). The browser only grants Element.requestFullscreen
// from inside a user gesture (a click/tap), so these MUST be called straight from
// a click handler, never from a passive effect. Everything is wrapped so a denied
// or unsupported call simply no-ops: iOS Safari has no Element.requestFullscreen,
// so the dvh takeover the surfaces already render stays the fallback.

/** True when the page is currently in true (browser) fullscreen. */
export function isAppFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  return !!document.fullscreenElement
}

/** Ask the browser for true fullscreen on the whole document. Best-effort: returns
 *  a resolved promise whether or not it was granted, and never throws. Call from a
 *  click/tap handler (fullscreen is gesture-gated). */
export async function requestAppFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    const el = document.documentElement
    // Already there, or no support (iOS Safari) — nothing to do; the dvh
    // takeover covers it.
    if (document.fullscreenElement || typeof el.requestFullscreen !== 'function') return
    const req = el.requestFullscreen()
    // requestFullscreen resolves on success and rejects when denied (no gesture);
    // swallow the rejection so the caller never has to.
    if (req && typeof req.then === 'function') await req.catch(() => {})
  } catch {
    // fullscreen is progressive enhancement
  }
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
