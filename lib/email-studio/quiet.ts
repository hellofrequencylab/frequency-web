// QUIET-MEMBER RE-ENGAGEMENT (LIVE-2265). Three Email Studio audiences, "Quiet 14 / 30 / 60 days", hold the
// opted-in members (consent_state 'subscribed') whose last visit (profiles.last_seen_at) is that many days back,
// with a week of catch-up so a missed daily run loses nobody. A campaign aimed at one of them is EVERGREEN: it is
// never sent in one shot. The owner approves it once in the approval queue, and /api/cron/quiet-reengage sends it
// each day to the members who newly crossed the line, once per person (the campaign's send ledger and a dedupe key).
// A visit moves last_seen_at forward, so signing in takes a member out of every quiet audience: that is the stop.
// PURE, so the window and the switch are unit-testable and a probe can run them under node.

import { envFlag } from '../env/string.ts'

/** Each quiet audience and the days without a visit it starts at. */
export const QUIET_SEGMENT_DAYS = { quiet_14: 14, quiet_30: 30, quiet_60: 60 } as const
type QuietSegment = keyof typeof QUIET_SEGMENT_DAYS

/** How far past the line a member still qualifies, so a run the cron missed is caught by the next. */
export const QUIET_CATCH_UP_DAYS = 7

const DAY_MS = 86_400_000

export function isQuietSegment(segment: string): segment is QuietSegment {
  return Object.prototype.hasOwnProperty.call(QUIET_SEGMENT_DAYS, segment)
}

/** The last_seen_at range a quiet audience holds at `now`: at least `days` back and less than days + catch-up. */
export function quietWindow(segment: QuietSegment, now: Date): { from: string; to: string } {
  const days = QUIET_SEGMENT_DAYS[segment]
  return {
    from: new Date(now.getTime() - (days + QUIET_CATCH_UP_DAYS) * DAY_MS).toISOString(),
    to: new Date(now.getTime() - days * DAY_MS).toISOString(),
  }
}

/** The one dedupe key per campaign and person, so two overlapping runs cannot queue the same email twice. */
export function quietDedupeKey(campaignId: string, contactId: string): string {
  return `quiet-reengage:${campaignId}:${contactId}`
}

/** What the one-shot Send button says for a quiet audience. */
export const QUIET_ONE_SHOT_REFUSAL =
  'A quiet-member email is sent by the daily trigger, one person at a time as they go quiet. Approve it in the approval queue instead of sending it now.'

/** The daily trigger may send. Off: the cron logs a skipped run and sends nothing (docs/RUNBOOKS.md, "Quiet-member re-engagement"). */
export function quietReengageEnabled(): boolean {
  return envFlag('QUIET_REENGAGE_ENABLED')
}
