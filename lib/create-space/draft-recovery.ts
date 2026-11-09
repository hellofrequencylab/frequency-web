// DRAFT REMINDERS: WHEN ONE IS OWED (LIVE-1968, ADR-1933). PURE: given one saved draft, what has already been sent
// for it, the clock and the browser's zone, say which reminder (if any) goes out right now. No database, no mail, so
// the whole rule is a table of cases in lib/create-space/draft-recovery.test.ts and a probe runs it under node.
//
// THE RULE is the launch's come-back rule (lib/launch/comeback.ts, VLS-26, VLS-27), applied to a draft that has no
// account yet: one hour, one day and three days after the last save, at most three, only 8am to 8pm in the zone the
// browser reported, and it ends the moment they save again, launch, or unsubscribe.
//
//   - "Stop" is the last save (create_space_drafts.saved_at). The three emails are measured from that one instant.
//   - At most three: the runner writes one create_space_draft_email_log row per kind (unique per draft and kind),
//     and a row counts here whether the email went out or was skipped for a reason, so a kind is never tried twice.
//   - Local hours, 8:00 up to but not including 20:00 in the browser's zone. No zone, no email, ever: a draft saved
//     from a browser that could not say its zone is held rather than guessed a night (the handoff's rule).
//   - A due email waits at most MAX_LATE_MS for a reasonable hour; later than that it is dropped and the next kind
//     is considered from its own target.
//   - Two emails never arrive inside MIN_GAP_MS of each other.
//   - A save after the last email ends it for good (they came back). Converted (the draft left for the launch) and
//     unsubscribed end it too.
//   - The day-3 email is about the handle ("/handle is still free"), so when the handle has been taken it is skipped;
//     the runner claims the kind as skipped so it is not re-asked. Nothing is held for anyone before a Space exists.
//
// The suppression half is not here (it needs the database): draft-recovery-io.ts asks before it claims a kind.

import { hourInZone, isValidTimeZone } from '../time/zone.ts'

export const DRAFT_REMINDER_KINDS = ['draft_1h', 'draft_1d', 'draft_3d'] as const
export type DraftReminderKind = (typeof DRAFT_REMINDER_KINDS)[number]

const HOUR_MS = 3_600_000
/** How long after the last save each email becomes due. */
const OFFSET_MS: Readonly<Record<DraftReminderKind, number>> = {
  draft_1h: HOUR_MS,
  draft_1d: 24 * HOUR_MS,
  draft_3d: 72 * HOUR_MS,
}

/** First local hour an email may go out (8am) and the first hour it may not (8pm). */
const WINDOW_OPEN_HOUR = 8
const WINDOW_CLOSE_HOUR = 20
/** A due email waits at most this long for a reasonable hour; later than that it is dropped. */
const MAX_LATE_MS = 24 * HOUR_MS
/** The least time between two reminders to one person. */
const MIN_GAP_MS = 12 * HOUR_MS

export interface DraftReminderSent {
  kind: DraftReminderKind
  /** When the log row was written (create_space_draft_email_log.sent_at). */
  sentAt: string
}

/** The facts of one draft the rule reads. */
interface DraftForReminder {
  savedAt: string
  convertedAt: string | null
  unsubscribedAt: string | null
  /** The draft's handle is now someone's Space (checked by the runner right before the day-3 email). */
  handleTaken: boolean
}

type DraftReminderWhy =
  | 'ended'
  | 'all_sent'
  | 'resumed'
  | 'not_yet'
  | 'too_late'
  | 'spacing'
  | 'no_zone'
  | 'outside_hours'
  | 'handle_taken'

type DraftReminderDecision = { kind: DraftReminderKind } | { kind: null; why: DraftReminderWhy }

export function isDraftReminderKind(v: unknown): v is DraftReminderKind {
  return typeof v === 'string' && (DRAFT_REMINDER_KINDS as readonly string[]).includes(v)
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN)

/** True when `now` is 8:00 up to 19:59 on the wall clock of `tz`. False for a zone that cannot be read. */
function inSendWindow(now: Date, tz: string | null | undefined): boolean {
  if (!isValidTimeZone(tz)) return false
  const h = hourInZone(now, tz)
  return h >= WINDOW_OPEN_HOUR && h < WINDOW_CLOSE_HOUR
}

/** Which reminder, if any, is owed right now. `tz` is the browser's IANA zone, or null when it never said. */
export function draftReminderDue(
  now: Date,
  draft: DraftForReminder,
  sent: readonly DraftReminderSent[],
  tz: string | null | undefined,
): DraftReminderDecision {
  if (draft.convertedAt || draft.unsubscribedAt) return { kind: null, why: 'ended' }
  const stop = ms(draft.savedAt)
  if (!Number.isFinite(stop)) return { kind: null, why: 'ended' }

  const done = new Set(sent.map((s) => s.kind))
  const next = DRAFT_REMINDER_KINDS.filter((k) => !done.has(k))
  if (next.length === 0) return { kind: null, why: 'all_sent' }

  const lastSent = Math.max(-Infinity, ...sent.map((s) => ms(s.sentAt)).filter((t) => Number.isFinite(t)))
  if (lastSent !== -Infinity && stop > lastSent) return { kind: null, why: 'resumed' }

  const t = now.getTime()
  // The earliest unsent kind that is not already too stale to send.
  let kind: DraftReminderKind | null = null
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
  if (kind === 'draft_3d' && draft.handleTaken) return { kind: null, why: 'handle_taken' }
  return { kind }
}
