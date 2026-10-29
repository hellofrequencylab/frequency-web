// THE CLOCK THE NOW LINE READS. Minutes since midnight on the Space's wall clock, taken once on the
// server and carried forward by the browser's own elapsed time, so a view never needs the time zone
// library and a test freezes time by passing a number.

/** Minutes since local midnight in `zone` at the instant `at`. Falls back to UTC for an unknown zone. */
export function wallMinutes(at: Date, zone: string): number {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes()
  }
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** The base minute moved on by elapsed milliseconds, held inside the day. */
export function nowMinutes(baseMin: number, elapsedMs: number): number {
  return Math.max(0, Math.min(1439, Math.floor(baseMin + Math.max(0, elapsedMs) / 60_000)))
}
