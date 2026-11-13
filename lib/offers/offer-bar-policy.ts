import { FOUNDING_MEMBER_COPY } from '@/lib/core/launch-dates'
import { HOME_TZ } from '@/lib/time/home-zone'

type OfferBarDisplayState = { endsAtMs: number | null; pending: boolean }

function pacificCalendarDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HOME_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** Keep the countdown hidden through the beta's final calendar day in Pacific time.
 * The pending offer navigation remains available; after the beta, the current countdown state is
 * returned unchanged. */
export function offerBarDisplayState(
  state: OfferBarDisplayState | null,
  now: Date = new Date(),
): OfferBarDisplayState | null {
  if (!state) return null
  if (pacificCalendarDay(now) <= FOUNDING_MEMBER_COPY.endsOn) {
    return { ...state, endsAtMs: null }
  }
  return state
}
