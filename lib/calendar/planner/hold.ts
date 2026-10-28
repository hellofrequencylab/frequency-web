import { addDays, dayCount, diffDays, monthDayLabel } from './days'

// A HOLD is the date a pencilled Plan keeps its candidate dates until. The prototype stored the date
// and printed "6 days left", with no lapse state and "1 days left" for a single day. Releasing a
// lapsed hold is the server's job (a scheduled sweep, a later pass); this file only reads it.

/** The three lengths the Pencil sheet offers, in days. */
export const HOLD_LENGTHS = [3, 7, 14] as const

/** The day a hold set today for `holdDays` lapses. */
export function holdEnd(today: string, holdDays: number): string {
  return addDays(today, Math.max(0, Math.round(holdDays)))
}

/** Whole days between today and the day the hold ends. Negative once it has lapsed. */
export function holdDaysLeft(hold: string, today: string): number {
  return diffDays(today, hold)
}

/** True once the hold's last day has passed. The last day itself still holds. */
export function isHoldLapsed(hold: string | null | undefined, today: string): boolean {
  return !!hold && hold < today
}

/** "6 days left", "1 day left", "Ends today", or "Lapsed". */
export function holdRemaining(hold: string, today: string): string {
  const n = holdDaysLeft(hold, today)
  if (n < 0) return 'Lapsed'
  if (n === 0) return 'Ends today'
  return `${dayCount(n)} left`
}

/** The line on a board card: "Holding until Oct 27 · 6 days left", or "Hold lapsed Oct 20". Empty
 *  when the Plan holds nothing. */
export function holdLine(hold: string | null | undefined, today: string): string {
  if (!hold) return ''
  if (isHoldLapsed(hold, today)) return `Hold lapsed ${monthDayLabel(hold)}`
  return `Holding until ${monthDayLabel(hold)} · ${holdRemaining(hold, today)}`
}

/** What the Pencil sheet says about release: "Released on Wed, Oct 28 if nobody confirms". */
export function holdReleaseNote(releaseDay: string, weekdayAndDate: string): string {
  return releaseDay ? `Released on ${weekdayAndDate} if nobody confirms` : ''
}
