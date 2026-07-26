'use server'

import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCapacityInfo } from '@/lib/events/capacity'

// The Events block popup's ONE read (Space page Events block upgrade): the viewer's own join state
// for an event, so the on-page dialog can mount the SAME RsvpControls the event page uses without
// navigating. Modeled on loadGuestQuestionnaire (the existing client-callable read action): a lean
// 'use server' read a client component calls on open. Self-authorized — it returns only the CALLER's
// own RSVP row plus the event's public capacity signal, so there is nothing here a visitor could not
// already see on the event page. FAIL-SAFE: any miss returns the signed-out empty shape.

export type EventJoinState = {
  /** False = offer the sign-in path (/sign-in?next=/events/[slug]) instead of the switch. */
  signedIn: boolean
  /** The viewer's current RSVP status (null = no answer yet). */
  status: 'going' | 'maybe' | 'waitlist' | 'not_going' | null
  /** Guests the viewer is bringing (only meaningful when going). */
  plusOnes: number
  /** At capacity — a fresh Going joins the waitlist (RsvpControls relabels honestly). */
  isFull: boolean
}

const EMPTY: EventJoinState = { signedIn: false, status: null, plusOnes: 0, isFull: false }

const STATUSES = new Set(['going', 'maybe', 'waitlist', 'not_going'])

export async function loadEventJoinState(eventId: string): Promise<EventJoinState> {
  if (!eventId || typeof eventId !== 'string') return EMPTY
  try {
    const [profileId, capacity] = await Promise.all([getMyProfileId(), getCapacityInfo(eventId)])
    if (!profileId) return { ...EMPTY, isFull: capacity.isFull }
    const { data } = await createAdminClient()
      .from('event_rsvps')
      .select('status, plus_ones')
      .eq('event_id', eventId)
      .eq('profile_id', profileId)
      .maybeSingle()
    const raw = data?.status ?? null
    return {
      signedIn: true,
      status: raw && STATUSES.has(raw) ? (raw as EventJoinState['status']) : null,
      plusOnes: Math.max(0, data?.plus_ones ?? 0),
      isFull: capacity.isFull,
    }
  } catch {
    return EMPTY
  }
}
