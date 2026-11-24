// THE NOTICE LADDER (EMAIL-091). Pure: when each rung of a hub notice is due, whether it still
// should go, and when quiet hours end. lib/notifications/ladder-route.ts schedules the rungs and the
// 'hub-ladder' outbox job (lib/notifications/inapp.ts) fires them.
//
// A tag or a word in a thread you follow is a bell at once. If you have not read it after two
// minutes, a push. If a TAG is still unread after twenty, one email for that thread, however many
// tags landed in it meanwhile (the email rung is keyed per thread per half hour); a plain word in a
// thread you follow stops at the push, because the Comments email switch is not wired. Reading the
// bell (read_at) or clearing it from the Inbox (archived_at) stops every later rung. Inside your
// quiet hours nothing pushes or emails; the rung waits for the morning. The bell still rings.

export type LadderRung = 'push' | 'email'

/** The outbox job kind that fires a later rung. */
export const HUB_LADDER_KIND = 'hub-ladder'

export const LADDER_DELAY_MS: Record<LadderRung, number> = {
  push: 2 * 60 * 1000,
  email: 20 * 60 * 1000,
}

/** One email per thread per window, whatever the number of words in it. */
export const EMAIL_WINDOW_MS = 30 * 60 * 1000

/** The dedupe key for a rung: push per thread per 2 minutes, email per thread per half hour. */
export function ladderKey(rung: LadderRung, profileId: string, thread: string, nowMs: number): string {
  const window = rung === 'email' ? EMAIL_WINDOW_MS : LADDER_DELAY_MS.push
  return `hub-ladder:${rung}:${profileId}:${thread}:${Math.floor(nowMs / window)}`
}

/** A rung still goes only while some notice on the thread since it was scheduled is unread and not cleared. */
export function ladderStillDue(notices: readonly { readAt: string | null; archivedAt: string | null }[]): boolean {
  return notices.some((n) => !n.readAt && !n.archivedAt)
}

export interface QuietHours {
  /** Hour of day (0 to 23) quiet starts, in the person's own time zone. */
  start: number
  /** Hour of day (0 to 23) quiet ends. Equal to start means off. */
  end: number
  timeZone: string
}

function localHour(nowMs: number, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date(nowMs))
    const n = Number.parseInt(h, 10)
    return Number.isFinite(n) ? n % 24 : new Date(nowMs).getUTCHours()
  } catch {
    return new Date(nowMs).getUTCHours()
  }
}

function validHour(h: unknown): h is number {
  return typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23
}

/** Is it quiet for this person now? A window may wrap midnight (22 to 7). */
export function inQuietHours(nowMs: number, quiet: QuietHours | null): boolean {
  if (!quiet || !validHour(quiet.start) || !validHour(quiet.end) || quiet.start === quiet.end) return false
  const h = localHour(nowMs, quiet.timeZone)
  return quiet.start < quiet.end ? h >= quiet.start && h < quiet.end : h >= quiet.start || h < quiet.end
}

/** When the current quiet window ends: the next top of an hour whose local hour is `end`. */
export function quietEndsAt(nowMs: number, quiet: QuietHours): number {
  const hourMs = 60 * 60 * 1000
  let t = Math.floor(nowMs / hourMs) * hourMs + hourMs
  for (let i = 0; i < 26; i++, t += hourMs) if (localHour(t, quiet.timeZone) === quiet.end) return t
  return nowMs + 8 * hourMs
}
