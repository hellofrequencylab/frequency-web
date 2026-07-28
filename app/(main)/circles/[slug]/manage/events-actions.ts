'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getCircleCapabilities, getEventCapabilities } from '@/lib/core/load-capabilities'
import { livePlacementPatch } from '@/lib/events/placement'
import { belongsToCircle, type CircleEventRow } from '@/lib/events/circle-upcoming'
import { spaceIdForCircle } from '@/lib/circles/store'

// Attach an ALREADY-CREATED event to this circle, from the circle side (the owner ask: "I need a
// way to add an already created event on to a Circle"). The mirror of the event-side placement
// editor (app/(main)/events/placement-actions.ts): same write, same authorities, opposite door.
//
// AUTHORITY (ADR-274, the two-sided rule ADR-883 §3 locks): the caller must hold BOTH
//   • circle.editSettings on THIS circle — the same capability that approves a placement
//     request INTO the circle (viewerIsSteward in placement-actions.ts), and
//   • event.editSettings on the event — the same capability the event-side placement
//     editor gates on (only someone who manages the event may move it).
// The picker (events-section.tsx) offers only what these gates admit; this action re-checks
// both on submit because the offer is UX and the gate is law (the admin client bypasses RLS).
//
// WRITE (ADR-883): the tie goes through livePlacementPatch — NEVER a hand-rolled column set.
// The patch writes the bare scope pair the whole product reads, the typed arc column, and the
// circle's Space (ADR-857) when it has one.

/** Untyped admin handle: events placement columns + event_placement_requests are newer than the
 *  generated types (ADR-246 escape: a return-type annotation, not a cast — the repo convention
 *  from circles/admin-actions.ts). */
function untyped(): SupabaseClient {
  return createAdminClient()
}

function eventsTab(slug: string): string {
  return `/circles/${slug}/manage?section=events`
}

/** Bring an event the caller runs onto this circle. Bound by the page (circleId + slug);
 *  the form posts only the event id. Redirects back to the Events tab with a notice. */
export async function attachEventToCircleAction(
  circleId: string,
  slug: string,
  formData: FormData,
): Promise<void> {
  const eventId = String(formData.get('eventId') ?? '').trim()
  if (!eventId) redirect(`${eventsTab(slug)}&error=missing`)

  // GATE 1 — the circle side: the same capability that approves a placement request.
  const circleCaps = await getCircleCapabilities(circleId)
  if (!circleCaps.has('circle.editSettings')) redirect(`${eventsTab(slug)}&error=denied`)

  // GATE 2 — the event side: only someone who manages the event may move it.
  const eventCaps = await getEventCapabilities(eventId)
  if (!eventCaps.has('event.editSettings')) redirect(`${eventsTab(slug)}&error=denied`)

  const admin = untyped()
  const { data: evRow } = await admin
    .from('events')
    .select('id, title, slug, location, status, is_cancelled, starts_at, scope_id, scope_type, scope_circle_id')
    .eq('id', eventId)
    .maybeSingle()
  const event = evRow as
    | (CircleEventRow & { status: string | null; is_cancelled: boolean | null })
    | null
  if (!event) redirect(`${eventsTab(slug)}&error=missing`)

  // Already here (by creation scope or a live placement): nothing to write, say so honestly.
  if (belongsToCircle(event, circleId)) redirect(`${eventsTab(slug)}&error=already`)

  // Only a live, still-upcoming event may be brought onto the circle (the same eligibility the
  // picker offers): a draft, a cancelled event, or one already past has nothing to gather for.
  const upcoming = !!event.starts_at && new Date(event.starts_at).getTime() >= Date.now()
  if ((event.status ?? 'published') !== 'published' || event.is_cancelled || !upcoming) {
    redirect(`${eventsTab(slug)}&error=ineligible`)
  }

  // THE WRITE (ADR-883): one shared patch. It carries the bare scope pair, the typed arc
  // column, and the circle's Space (ADR-857) — never a hand-rolled column set here.
  const circleSpaceId = await spaceIdForCircle(circleId)
  const patch = livePlacementPatch({ type: 'circle', id: circleId }, { circleSpaceId })
  const { error } = await admin.from('events').update(patch).eq('id', eventId)
  if (error) {
    console.error('[attachEventToCircle] events update failed', {
      code: error.code,
      message: error.message,
      eventId,
      circleId,
    })
    redirect(`${eventsTab(slug)}&error=failed`)
  }

  // Audit trail, mirroring the steward shortcut in requestEventPlacement: the placement is the
  // live column; the approved request row is the record of who tied it. Best-effort — a failure
  // here logs, it never fakes a dead placement.
  const actorId = await getMyProfileId()
  if (actorId) {
    const { error: auditErr } = await admin.from('event_placement_requests').insert({
      event_id: eventId,
      target_type: 'circle',
      space_id: null,
      circle_id: circleId,
      requested_by: actorId,
      status: 'approved',
      responded_at: new Date().toISOString(),
      responded_by: actorId,
    })
    if (auditErr) {
      console.error('[attachEventToCircle] audit insert failed', {
        code: auditErr.code,
        message: auditErr.message,
        eventId,
      })
    }
  }

  // Revalidate every surface the move touches: the circle page + hub, the event page, the
  // events index, the circle's Channel page (its Upcoming rail lists circle events), and the
  // circle's Space when the patch carried one (ADR-857 put the event on that calendar too).
  const { data: circleRow } = await admin
    .from('circles')
    .select('topical_channel_id')
    .eq('id', circleId)
    .maybeSingle()
  const channelId = (circleRow as { topical_channel_id: string | null } | null)?.topical_channel_id
  if (channelId) {
    const { data: channel } = await admin
      .from('topical_channels')
      .select('slug')
      .eq('id', channelId)
      .maybeSingle()
    const channelSlug = (channel as { slug: string } | null)?.slug
    if (channelSlug) revalidatePath(`/channels/${channelSlug}`)
  }
  if (circleSpaceId) {
    const { data: space } = await admin
      .from('spaces')
      .select('slug')
      .eq('id', circleSpaceId)
      .maybeSingle()
    const spaceSlug = (space as { slug: string } | null)?.slug
    if (spaceSlug) revalidatePath(`/spaces/${spaceSlug}`)
  }
  revalidatePath(`/circles/${slug}`)
  revalidatePath(`/circles/${slug}/manage`)
  revalidatePath(`/events/${event.slug}`)
  revalidatePath('/events')

  redirect(`${eventsTab(slug)}&saved=1`)
}
