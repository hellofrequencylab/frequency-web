import { isEventPast } from '@/lib/time/zone'

// Event timestamps store host wall-clock parts, not UTC instants. Pages and crawl
// eligibility must resolve them through the same timezone model as reminders.
export function eventHasEnded(event: { starts_at: string | null; ends_at?: string | null; time_zone?: string | null }, now = Date.now()): boolean {
  return isEventPast(event.starts_at, event.ends_at, event.time_zone, new Date(now))
}
