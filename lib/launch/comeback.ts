// COME-BACK EMAILS: WHEN ONE IS OWED (VLS-26, VLS-27). PURE: given one launch row, what has already been sent for
// it, the clock and the person's time zone, say which come-back email (if any) goes out right now. No database,
// no mail, so the whole rule is a table of cases in lib/launch/comeback.test.ts and a probe can run it under node.
//
// THE RULE, in the owner's words (2026-10-28): one hour, one day and three days after they stop, at most three,
// only between 8am and 8pm where they are, and it ends the moment they resume, launch, cancel or unsubscribe.
//
//   - "Stop" is the last time they were working: the later of the row's updated_at and the clock's last beat
//     (space_launch.clock_last_beat_at, lane C). The three emails are measured from that one instant.
//   - At most three: lib/launch/comeback-io.ts writes one launch_email_log row per kind (unique per launch and
//     kind), and a row counts here whether the email went out or was skipped for a reason (an opt-out), so a kind
//     is never tried twice and a person who opted out is not re-asked on every run.
//   - Local hours, 8:00 up to but not including 20:00 in the person's zone. No zone, no email: the zone is
//     the person's own (profiles.home_timezone), then their Space's (spaces.time_zone), and when neither is known
//     this skips rather than guess a night. A due email that falls outside the hours waits for the next 8am.
//   - A wait is not forever: an email more than MAX_LATE_MS past its target is dropped (the person has moved on),
//     and the next kind is considered from its own target.
//   - Spacing: two emails never arrive inside MIN_GAP_MS of each other, so a late 1-hour email and the 1-day one
//     cannot land in the same morning.
//   - Resume ends it for good. Any activity after the last email (lastActivity later than the latest sent_at)
//     means they came back, so nothing more is sent for this launch: the owner's "stop when they resume".
//   - Launched (completed), cancelled, a cancel request still open, or nothing left to resume: no email.
//
// The unsubscribe and preference half is not here (it needs the database): comeback-io.ts asks the lifecycle send
// gate (preference, consent, suppression in one decision) before it claims a kind.

import { launchPhase, type LaunchSnapshot } from './state.ts'
import { resumeView } from './resume.ts'
import { hourInZone, isValidTimeZone } from '../time/zone.ts'

export const COMEBACK_KINDS = ['comeback_1h', 'comeback_1d', 'comeback_3d'] as const
export type ComebackKind = (typeof COMEBACK_KINDS)[number]

const HOUR_MS = 3_600_000
/** How long after they stop each email becomes due. */
const OFFSET_MS: Readonly<Record<ComebackKind, number>> = {
  comeback_1h: HOUR_MS,
  comeback_1d: 24 * HOUR_MS,
  comeback_3d: 72 * HOUR_MS,
}

/** First local hour an email may go out (8am) and the first hour it may not (8pm). */
const WINDOW_OPEN_HOUR = 8
const WINDOW_CLOSE_HOUR = 20
/** A due email waits at most this long for a reasonable hour; later than that it is dropped. */
const MAX_LATE_MS = 24 * HOUR_MS
/** The least time between two come-back emails to one person. */
const MIN_GAP_MS = 12 * HOUR_MS

export interface ComebackSent {
  kind: ComebackKind
  /** When the log row was written (launch_email_log.sent_at). */
  sentAt: string
}

type ComebackWhy =
  | 'not_active'
  | 'all_sent'
  | 'resumed'
  | 'not_yet'
  | 'too_late'
  | 'spacing'
  | 'no_zone'
  | 'outside_hours'

type ComebackDecision = { kind: ComebackKind } | { kind: null; why: ComebackWhy }

/** The fields beyond the launch snapshot that the rule reads. Both may be absent until the clock lane ships. */
interface ComebackLaunch extends LaunchSnapshot {
  /** space_launch.clock_last_beat_at: the last time the clock saw them working. */
  clockLastBeatAt?: string | null
}

export function isComebackKind(v: unknown): v is ComebackKind {
  return typeof v === 'string' && (COMEBACK_KINDS as readonly string[]).includes(v)
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN)

/** The last moment the person was working on the launch, as epoch ms, or NaN when nothing readable is stored. */
function lastActivityMs(l: Pick<ComebackLaunch, 'updatedAt' | 'clockLastBeatAt'>): number {
  const times = [ms(l.updatedAt), ms(l.clockLastBeatAt)].filter((t) => Number.isFinite(t))
  return times.length ? Math.max(...times) : NaN
}

/** True when `now` is 8:00 up to 19:59 on the wall clock of `tz`. False for a zone that cannot be read. */
function inSendWindow(now: Date, tz: string | null | undefined): boolean {
  if (!isValidTimeZone(tz)) return false
  const h = hourInZone(now, tz)
  return h >= WINDOW_OPEN_HOUR && h < WINDOW_CLOSE_HOUR
}

/** Which come-back email, if any, is owed right now. `tz` is the person's IANA zone, or null when unknown. */
export function comebackDue(
  now: Date,
  launch: ComebackLaunch,
  sent: readonly ComebackSent[],
  tz: string | null | undefined,
): ComebackDecision {
  if (launchPhase(launch, now) !== 'active') return { kind: null, why: 'not_active' }
  if (resumeView(launch, now).kind !== 'step') return { kind: null, why: 'not_active' }
  const stop = lastActivityMs(launch)
  if (!Number.isFinite(stop)) return { kind: null, why: 'not_active' }

  const done = new Set(sent.map((s) => s.kind))
  const next = COMEBACK_KINDS.filter((k) => !done.has(k))
  if (next.length === 0) return { kind: null, why: 'all_sent' }

  const lastSent = Math.max(-Infinity, ...sent.map((s) => ms(s.sentAt)).filter((t) => Number.isFinite(t)))
  if (lastSent !== -Infinity && stop > lastSent) return { kind: null, why: 'resumed' }

  const t = now.getTime()
  // The earliest unsent kind that is not already too stale to send.
  let kind: ComebackKind | null = null
  for (const k of next) {
    const target = stop + OFFSET_MS[k]
    if (t < target) return { kind: null, why: 'not_yet' }
    if (t - target <= MAX_LATE_MS) {
      kind = k
      break
    }
  }
  if (!kind) return { kind: null, why: 'too_late' }

  if (lastSent !== -Infinity && t - lastSent < MIN_GAP_MS) return { kind: null, why: 'spacing' }
  if (!isValidTimeZone(tz)) return { kind: null, why: 'no_zone' }
  if (!inSendWindow(now, tz)) return { kind: null, why: 'outside_hours' }
  return { kind }
}
