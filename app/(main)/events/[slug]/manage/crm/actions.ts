'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { buildMemberDetail } from '@/lib/crm/member-detail'
import { listEventCrmMemberIds } from '@/lib/events/crm-roster'
import { openScopedDm } from '@/lib/messages/scoped-dm'
import type { CrmMemberDetail } from '@/components/people/member-viewer'

// MESSAGE ATTENDEES server actions (CRM Everywhere plan 3.3 + 3.4 / ADR-827). The event twin of
// the space detail loader: the GATE -> TENANCY -> BUILD triple, verbatim (plan risk note:
// tenancy is the whole security model — a missed check here means any host reads any member).
// The gate mirrors the Manage page's ('event.editSettings': host / cohost / staff / parent-scope
// manager); the detail is the LEADER-trimmed altitude (audience 'leader' — no platform pipeline,
// funnels, steward notes, or global timeline). Copy is plain, no em dashes (docs/CONTENT-VOICE.md).

/** Resolve the event by slug and require the caller to hold 'event.editSettings' — the same
 *  capability the Manage dashboard gates on. Throws (never a silent null) on miss, so both
 *  actions below fail closed. */
async function resolveManagedEvent(slug: string): Promise<{ id: string }> {
  const admin = createAdminClient()
  const { data } = await admin.from('events').select('id').eq('slug', slug).maybeSingle()
  const event = data as { id: string } | null
  if (!event) throw new Error('Event not found')
  const caps = await getEventCapabilities(event.id)
  if (!caps.has('event.editSettings')) throw new Error('Not authorized')
  return event
}

/**
 * The Message Attendees detail loader: gate -> tenancy -> build. TENANCY: the id must be in the
 * event's going/maybe RSVP set (listEventCrmMemberIds — the exact set the roster lists), so a
 * host can never build a detail for an arbitrary profile id. `slug` is bound server-side by the
 * viewer wrapper; the client only ever passes the row id.
 */
export async function loadEventCrmDetail(slug: string, id: string): Promise<CrmMemberDetail> {
  const event = await resolveManagedEvent(slug)
  const attendeeIds = await listEventCrmMemberIds(event.id)
  if (!attendeeIds.has(id)) throw new Error('Not an attendee of this event')
  return buildMemberDetail(id, { audience: 'leader' })
}

/**
 * Open (or reuse) the 1:1 thread from the signed-in leader to an attendee, then land in it —
 * the same UX as the Manage page's follow-up Message button. openScopedDm owns the policy
 * (leads-the-event gate, going/maybe audience, block check, rate limits); the capability check
 * here keeps this action's front door consistent with the rest of the surface.
 */
export async function openEventAttendeeDm(slug: string, profileId: string): Promise<void> {
  const event = await resolveManagedEvent(slug)
  const { conversationId } = await openScopedDm({
    scope: { kind: 'event', id: event.id },
    targetProfileId: profileId,
  })
  // redirect throws, so it sits outside any try/catch (Next server-action rule).
  redirect(`/messages/${conversationId}`)
}
