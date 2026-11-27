// THE ONE WEEK START (SCAN-1345). Every Frequency calendar starts its weeks on the same day: the public
// Calendar tab, the team calendar (month, week, mini-month and Pencil it in), a Space website's month,
// and the events grids. Before this, the public grids started on Sunday and the team calendar on
// Monday, so the same date sat in a different column depending on which calendar you opened.
//
// 0 is Sunday, the US default (Google Calendar and Apple Calendar in en-US). Change it here and every
// grid, header and week view follows.

export const WEEK_STARTS_ON: 0 | 1 = 0

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/** `list` turned so it begins on the week's first day. */
function fromWeekStart<T>(list: readonly T[]): readonly T[] {
  return [...list.slice(WEEK_STARTS_ON), ...list.slice(0, WEEK_STARTS_ON)]
}

/** The weekday column headers, first day of the week first ("Sun", "Mon", ...). */
export const WEEKDAY_SHORT_LABELS: readonly string[] = fromWeekStart(SHORT)

/** The one-letter headers a mini-month uses, in the same order. */
export const WEEKDAY_LETTERS: readonly string[] = fromWeekStart(LETTER)

/** How many days `dayOfWeek` (0 = Sunday) sits after the week's first day, 0 to 6. */
export function daysIntoWeek(dayOfWeek: number): number {
  return (dayOfWeek - WEEK_STARTS_ON + 7) % 7
}
