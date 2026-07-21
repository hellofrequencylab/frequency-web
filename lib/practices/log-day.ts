// Which calendar day a finalized practice belongs to (ADR-801).
//
// A live On Air sit logs when it FINALIZES, and logPractice historically keyed `practice_logs.logged_for`
// to the finalize moment's local day. That is wrong for a run left going past midnight: a member who
// started a sit at 10am and forgot to stop it until the next morning had the practice attributed to the
// FINALIZE day, leaving the day they actually practiced empty. For a daily streak (derived from
// logged_for) that opens a phantom one-day gap and, with no freeze banked, collapses weeks of momentum.
//
// The fix: attribute the log to the day the member STARTED the sit. This is both correct (they practiced
// on the day they began) and the convention every timer app uses. It is CLAMPED to at most one day
// before the finalize day so a stale or forged started_at can never backdate a log further than the
// legitimate overnight case — attribution stays inside [finalizeDay - 1, finalizeDay].

/** Whole-day difference a - b for two YYYY-MM-DD strings (UTC-anchored, calendar days). */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * The day (YYYY-MM-DD) a finalized session's practice log belongs to. Given the finalize day (the
 * member's local "now" day) and the day the session STARTED (the member's local day of started_at),
 * returns the start day when it is the finalize day or exactly the day before, else the finalize day.
 *
 * PURE + unit-tested. A missing/malformed start day, a FUTURE start, or a start more than one day back
 * all fall back to the finalize day, so this can only ever move a log from "today" to "yesterday" (the
 * real overnight case), never further.
 */
export function attributedLogDay(finalizeDay: string, startedDay: string | null | undefined): string {
  if (!startedDay || !YMD.test(startedDay) || !YMD.test(finalizeDay)) return finalizeDay
  const back = dayDiff(finalizeDay, startedDay)
  return back === 0 || back === 1 ? startedDay : finalizeDay
}
