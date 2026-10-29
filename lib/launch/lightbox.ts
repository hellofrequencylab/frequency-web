// THE LAUNCH LIGHTBOX (LIVE-1913), the pure half. The launch opens as a full-screen overlay over whatever page the
// person came from. "Pause" closes it and returns them there, so this file answers one question: where is "there"?
// A return path is a same-origin path and nothing else, and never one inside the launch itself (that would be a loop).
// PURE and client-safe.

/** Where Pause goes when nothing better is known. */
const FALLBACK = '/'
const LAUNCH_PREFIX = /^\/(launch|create-a-space|spaces\/new)(\/|\?|$)/

/** A return path from a query value or a referrer: an in-app path (starting with a single slash) that is not the
 *  launch itself. Anything else, including `//host`, `/\host`, a full URL or a control character, reads as "/". */
export function safeReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return FALLBACK
  const v = raw.trim()
  if (v.length === 0 || v.length > 500) return FALLBACK
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return FALLBACK
  if (/[\u0000-\u001f\u007f]/.test(v)) return FALLBACK
  return LAUNCH_PREFIX.test(v) ? FALLBACK : v
}

/** The path of a referrer URL when it is on this origin, else null. */
export function referrerPath(referrer: string | null | undefined, origin: string): string | null {
  if (!referrer) return null
  try {
    const u = new URL(referrer)
    return u.origin === origin ? `${u.pathname}${u.search}` : null
  } catch {
    return null
  }
}
