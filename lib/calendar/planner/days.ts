import { daysBetween, shiftDayKey } from '../date-move'
import { shortDateLabel } from '../short-date'

// DAY AND CLOCK ARITHMETIC for the planner engine. Day keys are YYYY-MM-DD and every sum is UTC, so a
// daylight-saving shift can never move a date. The two primitives are the existing ones in
// lib/calendar/date-move.ts; this file adds the week and wording helpers the views share.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** `key` moved by whole days. An unreadable key comes back unchanged so a view never goes blank. */
export function addDays(key: string, days: number): string {
  return shiftDayKey(key, days) ?? key
}

/** Whole days from `from` to `to` (negative when `to` is earlier). 0 for an unreadable key. */
export function diffDays(from: string, to: string): number {
  return daysBetween(from, to) ?? 0
}

/** Day of week of a day key, 0 = Sunday. */
export function dayOfWeek(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getUTCDay()
}

/** The Monday on or before `key` (weeks start on Monday). */
export function mondayOnOrBefore(key: string): string {
  return addDays(key, -((dayOfWeek(key) + 6) % 7))
}

/** The last day an item runs on: `end` when it spans, else its own date. */
export function lastDay(item: { date: string; end?: string | null }): string {
  return item.end && item.end >= item.date ? item.end : item.date
}

/** True when `key` falls inside the item's run, both ends included. */
export function spansDay(item: { date: string; end?: string | null }, key: string): boolean {
  return key >= item.date && key <= lastDay(item)
}

/** "Oct 27", the short month and day with no weekday. */
export function monthDayLabel(key: string): string {
  const m = Number(key.slice(5, 7))
  const d = Number(key.slice(8, 10))
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}` : key
}

/** "Wed, Oct 21", the one short date every calendar surface reads (lib/calendar/short-date.ts). */
export function dayLabel(key: string): string {
  return shortDateLabel(key)
}

/** The weekday name of a day key, "Wednesday". */
export function weekdayName(key: string): string {
  return WEEKDAYS[dayOfWeek(key)]
}

/** "7 PM", "9:30 AM", "12 AM", for minutes since midnight. */
export function clockLabel(minutes: number): string {
  const total = Math.max(0, Math.min(1440, Math.round(minutes)))
  const h24 = Math.floor(total / 60) % 24
  const m = total % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** "1 hour", "1.5 hours", "30 min": a length in minutes, spoken. */
export function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.round((minutes / 60) * 100) / 100
  return `${h} ${h === 1 ? 'hour' : 'hours'}`
}

/** "1 day" or "3 days". */
export function dayCount(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}
