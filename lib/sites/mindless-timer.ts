// THE MINDLESS SITE TIMER, the pure half (LIVE-2392). A Mindless website's session player (the design system's SessionPlayer) runs for
// real: a visitor presses play and the bar fills. These are the sums it stands on, kept free of React so they can be tested alone.

/** The shortest and longest session a site may offer, in seconds. */
export const SESSION_MIN_SECONDS = 10
export const SESSION_MAX_SECONDS = 120 * 60

/** Reads an owner's length: "1:00", "5:30", "1:05:00", or a bare number of minutes ("5", "5 min"). Null when it is not a length. */
export function parseLength(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  let seconds: number
  if (/^\d{1,3}(:\d{2}){1,2}$/.test(s)) {
    seconds = s.split(':').map(Number).reduce((sum, n) => sum * 60 + n, 0)
  } else {
    const m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)?$/.exec(s)
    if (!m) return null
    seconds = Math.round(Number(m[1]) * 60)
  }
  if (!Number.isFinite(seconds) || seconds < SESSION_MIN_SECONDS) return null
  return Math.min(seconds, SESSION_MAX_SECONDS)
}

/** A clock face: 0:00, 4:59, 1:05:00. Counts in whole seconds. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** The breath cue for a moment in the session: in for `pace` seconds, out for `pace` seconds. Null when the pacer is off. */
export function breathCue(elapsed: number, pace: number): 'Breathe in' | 'Breathe out' | null {
  if (!(pace > 0)) return null
  return Math.floor(Math.max(0, elapsed) / pace) % 2 === 0 ? 'Breathe in' : 'Breathe out'
}

/** How full the bar is, 0 to 100. */
export function progressOf(elapsed: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.min(100, Math.max(0, (elapsed / total) * 100))
}
