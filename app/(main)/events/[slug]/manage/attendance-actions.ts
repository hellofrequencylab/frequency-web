'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isEventCohost } from '@/lib/events/cohosts'
import { viewerActsAsEventHost } from '@/lib/events/host-gate'
import { setSeatAttended, type SeatRef, type SetSeatAttendedResult } from '@/lib/events/attendance'
import { sendGuestTicketReceipt } from '@/lib/events/guest-ticket-email'
import { sendMemberTicketReceipt } from '@/lib/events/member-ticket-email'

// THE HOST'S MARK (PROG-GD4). The one action that writes `attended_at` / `attended_by` on a seat,
// from the roster on the Manage Dashboard. Same posture as ./actions.ts: it runs on the admin
// client, so it re-checks the caller as host, cohost or platform staff BEFORE the write, through
// the same two seams the rest of the dashboard gates on (lib/events/host-gate, ADR-841, and
// lib/events/cohosts). The write itself lives in lib/events/attendance.ts and touches the two
// columns and nothing else: no ledger row, no Zaps, no streak. It is the host saying "I saw them",
// which is a different fact from the member saying "I was here" (checkInEvent), and the roster
// shows both.

/** Host, cohost or staff on this event, else null. Mirrors ./actions.ts authorizeManager, which
 *  stays private there because a `use server` export is a callable endpoint. */
async function authorizeManager(eventId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  if (await viewerActsAsEventHost(eventId, profileId)) return profileId
  if (await isEventCohost(eventId, profileId)) return profileId
  return null
}

/** Mark or clear one seat as attended. Refused (with no write) for anyone but a manager. */
export async function setSeatAttendedFromManage(
  eventId: string,
  slug: string,
  seat: SeatRef,
  attended: boolean,
): Promise<SetSeatAttendedResult> {
  const byProfileId = await authorizeManager(eventId)
  if (!byProfileId) return { ok: false, error: 'forbidden' }

  const result = await setSeatAttended(createAdminClient(), { eventId, seat, attended, byProfileId })
  if (result.ok) {
    revalidatePath(`/events/${slug}/manage`)
    revalidatePath(`/events/${slug}`)
  }
  return result
}

export type ResendTicketResult = { ok: true } | { ok: false; error: 'forbidden' | 'not_found' }

/** RESEND A TICKET (LIVE-2548). A guest's emailed ticket is the only copy they have, so "I can't
 *  find my ticket" is a door problem the host has to be able to fix on the spot. Sends the same
 *  receipt the sale sent, to the same address (the guest's checkout email, or the member's account
 *  email), and nothing else. Manager-only, and only for a paid, unrefunded ticket on THIS event. */
export async function resendTicketFromManage(eventId: string, ticketId: string): Promise<ResendTicketResult> {
  const byProfileId = await authorizeManager(eventId)
  if (!byProfileId) return { ok: false, error: 'forbidden' }

  const { data } = await createAdminClient()
    .from('event_tickets')
    .select('id, event_id, buyer_profile_id, guest_email, ticket_type_id, qty, amount_cents, currency, status, refunded_at')
    .eq('id', ticketId)
    .eq('event_id', eventId)
    .maybeSingle()
  const t = data as {
    buyer_profile_id: string | null
    guest_email: string | null
    ticket_type_id: string | null
    qty: number | null
    amount_cents: number | null
    currency: string | null
    status: string | null
    refunded_at: string | null
  } | null
  if (!t || t.status !== 'succeeded' || t.refunded_at) return { ok: false, error: 'not_found' }

  const common = { eventId, qty: Math.max(1, Number(t.qty) || 1), amountCents: t.amount_cents, currency: t.currency }
  if (t.buyer_profile_id) {
    await sendMemberTicketReceipt({ ...common, profileId: t.buyer_profile_id, ticketTypeId: t.ticket_type_id })
  } else if (t.guest_email) {
    await sendGuestTicketReceipt({ ...common, guestEmail: t.guest_email })
  } else {
    return { ok: false, error: 'not_found' }
  }
  return { ok: true }
}
