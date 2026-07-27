// MANUAL BILLING AGREEMENT date math (ADR-872). The PURE half of lib/billing/manual-agreements.ts,
// split out so the reminder-ladder decisions are unit-testable with no database and no clock:
// every function takes its dates as arguments (a caller passes `now` in; nothing here reads
// Date.now()). All arithmetic is UTC-calendar-day math on the `date`-typed columns
// (started_at / paid_through hold plain YYYY-MM-DD values).
//
// THE REMINDER LADDER. An active agreement gets at most THREE touches per cycle, each stamped
// once on the row so a rerun never repeats it:
//   reminder_30  -> due-30d <= now < due-7d, reminder_30_sent_at null
//   reminder_7   -> due-7d  <= now < due,    reminder_7_sent_at null
//   overdue      -> due     <= now,          overdue_notice_sent_at null
// The windows are DISJOINT on purpose: once the 7-day window opens, an unsent 30-day touch is
// simply skipped (the more urgent touch covers it), and once past due only the overdue notice can
// fire. Recording a payment extends paid_through by one interval and clears all three stamps, so
// the next cycle's ladder re-arms.

/** The billing interval a manual agreement renews on. */
export type AgreementInterval = 'month' | 'year'

/** One rung of the reminder ladder (which touch is owed right now). */
export type DueBucket = 'reminder_30' | 'reminder_7' | 'overdue'

/** The reminder-relevant slice of an agreement row (camelCase, as the IO layer maps it). */
export interface AgreementDueFields {
  status: string
  /** YYYY-MM-DD (the `date` column value). */
  paidThrough: string
  reminder30SentAt: string | null
  reminder7SentAt: string | null
  overdueNoticeSentAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Parse a YYYY-MM-DD date string to a Date at UTC midnight, or null for anything malformed
 *  (including real-calendar misses like 2027-02-30). PURE. */
export function parseDateUTC(dateISO: string | null | undefined): Date | null {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null
  const [y, m, d] = dateISO.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // Reject rollovers (e.g. Feb 30 -> Mar 2): the parts must round-trip.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

/** Format a UTC instant back to YYYY-MM-DD. PURE. */
export function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Add ONE billing interval to a YYYY-MM-DD date, clamping the day to the target month's length
 *  (Jan 31 + month -> Feb 28/29; Feb 29 + year -> Feb 28). PURE. Returns null for a malformed
 *  input rather than guessing. */
export function addInterval(dateISO: string, interval: AgreementInterval): string | null {
  const parsed = parseDateUTC(dateISO)
  if (!parsed) return null
  const y = parsed.getUTCFullYear() + (interval === 'year' ? 1 : 0)
  const m = parsed.getUTCMonth() + (interval === 'month' ? 1 : 0)
  const day = parsed.getUTCDate()
  // Day 0 of month m+1 is the last day of month m: the clamp bound.
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return formatDateUTC(new Date(Date.UTC(y, m, Math.min(day, lastDay))))
}

/** Which reminder touch (if any) an agreement is owed at `now`. PURE; the ladder's single
 *  decision point. Only an 'active' agreement is ever due; each rung fires only inside its own
 *  window and only while its stamp is null (idempotency), so a stamped touch never repeats and a
 *  missed earlier window never fires late. */
export function dueBucketFor(agreement: AgreementDueFields, now: Date): DueBucket | null {
  if (agreement.status !== 'active') return null
  const due = parseDateUTC(agreement.paidThrough)
  if (!due) return null
  const t = now.getTime()
  const dueMs = due.getTime()
  if (t >= dueMs) return agreement.overdueNoticeSentAt ? null : 'overdue'
  if (t >= dueMs - 7 * DAY_MS) return agreement.reminder7SentAt ? null : 'reminder_7'
  if (t >= dueMs - 30 * DAY_MS) return agreement.reminder30SentAt ? null : 'reminder_30'
  return null
}

/** Classify a batch of agreements into the three due buckets at `now`. PURE. Agreements owed
 *  nothing are dropped; each agreement lands in at most one bucket (dueBucketFor's contract). */
export function bucketAgreementsDue<T extends AgreementDueFields>(
  agreements: readonly T[],
  now: Date,
): { reminder30: T[]; reminder7: T[]; overdue: T[] } {
  const out = { reminder30: [] as T[], reminder7: [] as T[], overdue: [] as T[] }
  for (const a of agreements) {
    const bucket = dueBucketFor(a, now)
    if (bucket === 'reminder_30') out.reminder30.push(a)
    else if (bucket === 'reminder_7') out.reminder7.push(a)
    else if (bucket === 'overdue') out.overdue.push(a)
  }
  return out
}

/** Human dollar label for an agreement's rate, e.g. "$490 a year" / "$49.50 a month". PURE.
 *  Whole-dollar amounts drop the cents (operator copy stays plain). */
export function formatAgreementRate(amountCents: number, interval: AgreementInterval): string {
  const dollars = amountCents / 100
  const amount = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
  return `$${amount} a ${interval}`
}
