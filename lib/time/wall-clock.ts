// WALL-CLOCK INSTANTS AND COUNTDOWN PARTS, shared by the server and the browser. The Network blocks
// (components/page-editor/blocks/network.tsx, Server Components) compute a countdown's first frame with these,
// and the countdown island (components/sites/network-countdown.tsx) ticks it on with the same two functions.
// They live here, not in the island: a function exported from a 'use client' module is a client reference on
// the server, and calling one there throws ("Attempted to call wallClockInstant() from the server"), which is
// what took every published Network home page down until this module existed (LIVE-906).

/** The instant a wall clock (stored as UTC parts, lib/time/zone.ts) names in an IANA zone. */
export function wallClockInstant(wallIso: string, timeZone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(wallIso)
  if (!m) return Number.NaN
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  // The zone's offset at that moment, read back through Intl (DST-safe to the hour, which is all a clock needs).
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(asUtc))
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const seen = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
    return asUtc + (asUtc - seen)
  } catch {
    return asUtc
  }
}

/** Days, hours, minutes and seconds from `now` to `target` (both epoch ms), never negative. */
export function countdownParts(target: number, now: number): [number, number, number, number] {
  const s = Math.max(0, Math.floor((target - now) / 1000))
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
}
