'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import {
  createEventTicketTier,
  updateEventTicketTier,
  setEventTicketTierActive,
} from '@/lib/events/ticket-tiers'

// Host-facing ticket-tier actions (audit finding #9). Before this, a host could
// only set a single flat event price; tiered / pay-what-you-can / sliding-scale /
// donation tiers were reachable only from the platform /admin console. These bring
// the SAME shared writers (lib/events/ticket-tiers) to the host's own Manage
// surface, behind the SAME capability the event routes already use.
//
// AUTHORIZATION: the caller must hold `event.editSettings` on THIS event — they
// host it, cohost it, manage its circle, or are staff+. Mirrors how the sibling
// refundTicketAction / social-actions gate the host. Re-checked server-side on
// every call; never trusts the client. The shared writers assume this check ran.

/** Gate: signed in AND able to edit this event's settings. Returns null when OK,
 *  or a ready-to-return failure otherwise. */
async function guardHostTierEdit(eventId: string): Promise<ActionResult<void> | null> {
  if (!TICKETING_ENABLED) return fail('Ticketing is off right now.')
  if (!(await getMyProfileId())) return fail('Sign in.')
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return fail('You can’t manage tickets for this event.')
  return null
}

/** Host: create a ticket tier on their event. */
export async function hostCreateTicketTier(
  eventId: string,
  slug: string,
  fd: FormData,
): Promise<ActionResult<void>> {
  const denied = await guardHostTierEdit(eventId)
  if (denied) return denied
  try {
    await createEventTicketTier(eventId, fd)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not create the tier.')
  }
  revalidatePath(`/events/${slug}/manage`)
  revalidatePath(`/events/${slug}`)
  return ok()
}

/** Host: edit a tier's catalog fields. Never touches `sold` (billing-owned). */
export async function hostUpdateTicketTier(
  tierId: string,
  eventId: string,
  slug: string,
  fd: FormData,
): Promise<ActionResult<void>> {
  const denied = await guardHostTierEdit(eventId)
  if (denied) return denied
  try {
    await updateEventTicketTier(tierId, eventId, fd)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not save the tier.')
  }
  revalidatePath(`/events/${slug}/manage`)
  revalidatePath(`/events/${slug}`)
  return ok()
}

/** Host: retire or reactivate a tier. Retiring stops new sales but keeps the row
 *  for tickets already sold against it. */
export async function hostSetTicketTierActive(
  tierId: string,
  eventId: string,
  slug: string,
  active: boolean,
): Promise<ActionResult<void>> {
  const denied = await guardHostTierEdit(eventId)
  if (denied) return denied
  try {
    await setEventTicketTierActive(tierId, eventId, active)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Could not update the tier.')
  }
  revalidatePath(`/events/${slug}/manage`)
  revalidatePath(`/events/${slug}`)
  return ok()
}
