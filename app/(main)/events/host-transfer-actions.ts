'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { getSpaceById } from '@/lib/spaces/store'
import { listSpaceEventCreatorIds } from '@/lib/events/placement'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  hostSpaceGateError,
  hostTransferBlockReason,
  shouldAutoAcceptHostTransfer,
  canRespondToHostTransfer,
  type HostTransferSide,
} from '@/lib/events/host-transfer'

// ── Handing hosting to another Space (ADR-911) ─────────────────────────────────────────────
//
// `setEventHostEntity` (placement-actions.ts) writes `events.host_space_id` directly, and requires
// the actor to already run the TARGET Space. That guard is correct — host is the PAYEE — and it is
// also a dead end: a venue's manager cannot hand hosting to the practitioner actually running the
// event, so an operator had to do it by hand.
//
// This is the two-sided path for that case. It never widens who may end up hosting; it adds the
// consent step that lets the target say yes for itself. Accepting means accepting the payout
// liability and the refund obligation for other people's ticket sales, so it can never be implied.
//
// Table: event_host_transfers (20270131000000). RLS on, no policies, service-role only — so the
// gates in this file ARE the authority, exactly as in share-actions.ts.

/** Untyped admin handle: event_host_transfers is newer than the generated types (ADR-246 escape). */
function untyped(): SupabaseClient {
  return createAdminClient()
}

/** True when the caller can edit the event (host / cohost). Fail-closed. */
async function callerHostsEvent(eventId: string): Promise<boolean> {
  const caps = await getEventCapabilities(eventId)
  return caps.has('event.editSettings')
}

/**
 * True when the caller helps RUN this Space — the same set that may already make it the host via
 * setEventHostEntity (`listSpaceEventCreatorIds`: owner + editor/moderator/admin members).
 *
 * ⚠️ Deliberately NOT widened to platform staff here. Staff keep their direct path through
 * setEventHostEntity, which is audited as an operator action. If staff could also ACCEPT on a
 * Space's behalf, the consent record would say a Space agreed to take on payout liability when in
 * fact an operator did — the audit trail would be a lie about who accepted the money.
 */
async function callerRunsSpace(spaceId: string, profileId: string): Promise<boolean> {
  try {
    return (await listSpaceEventCreatorIds(spaceId)).includes(profileId)
  } catch {
    return false
  }
}

interface EventMoneyState {
  title: string
  slug: string
  hostSpaceId: string | null
  hasSettledTickets: boolean
  eventIsOver: boolean
}

/** The event facts the money guard needs. Fail-closed: an unreadable event blocks the transfer. */
async function loadEventMoneyState(admin: SupabaseClient, eventId: string): Promise<EventMoneyState | null> {
  const { data: ev } = await admin
    .from('events')
    .select('title, slug, host_space_id, starts_at, ends_at')
    .eq('id', eventId)
    .maybeSingle()
  const row = ev as {
    title: string | null
    slug: string | null
    host_space_id: string | null
    starts_at: string | null
    ends_at: string | null
  } | null
  if (!row?.slug) return null

  // Money actually TAKEN: settled and not refunded. A pending or failed checkout has moved nothing,
  // so it must not block a handoff — otherwise an abandoned cart freezes hosting forever.
  const { data: tickets } = await admin
    .from('event_tickets')
    .select('id')
    .eq('event_id', eventId)
    .not('succeeded_at', 'is', null)
    .is('refunded_at', null)
    .limit(1)

  const endsAt = row.ends_at ?? row.starts_at
  return {
    title: row.title ?? 'this event',
    slug: row.slug,
    hostSpaceId: row.host_space_id,
    hasSettledTickets: ((tickets as unknown[] | null) ?? []).length > 0,
    eventIsOver: endsAt ? new Date(endsAt).getTime() < Date.now() : false,
  }
}

/** Best-effort notification; never fails the action. */
async function notify(
  admin: SupabaseClient,
  recipients: string[],
  actorId: string | null,
  type: string,
  eventId: string,
  body: string,
): Promise<void> {
  try {
    const to = recipients.filter((id) => id && id !== actorId)
    if (to.length === 0) return
    await admin.from('notifications').insert(
      to.map((recipient_id) => ({
        recipient_id,
        actor_id: actorId,
        type,
        reference_type: 'event',
        reference_id: eventId,
        body,
      })),
    )
  } catch {
    /* best-effort */
  }
}

/**
 * Write `events.host_space_id` and NOTHING else.
 *
 * 🔴 NEVER TOUCHES `space_id`. That is the entire point of the host/venue split (ADR-911): the venue
 * keeps the event on its calendar (`space_public_calendar_feed` matches `e.space_id = t.id OR
 * e.host_space_id = t.id`). The old `setEventHostEntity` wrote both columns, which is what made "at
 * Royal Temple, hosted by Audrey DeWitt" impossible to express.
 */
async function applyHost(admin: SupabaseClient, eventId: string, toSpaceId: string): Promise<boolean> {
  const { error } = await admin.from('events').update({ host_space_id: toSpaceId }).eq('id', eventId)
  if (error) {
    console.error('[host-transfer] host_space_id write failed', { code: error.code, message: error.message, eventId })
    return false
  }
  return true
}

/** One pending transfer per event (the partial unique index), resolved for display. */
export interface HostTransferView {
  id: string
  initiatedBy: HostTransferSide
  toSpace: { id: string; slug: string; name: string }
  /** True when the SIGNED-IN caller is the side that must respond. */
  awaitingYou: boolean
}

/**
 * The event's pending host offer, or null. Gated on managing the event OR running the target Space,
 * so a passer-by cannot learn who a venue is trying to hand an event to.
 */
export async function loadPendingHostTransfer(eventId: string): Promise<HostTransferView | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const admin = untyped()
  try {
    const { data } = await admin
      .from('event_host_transfers')
      .select('id, to_space_id, initiated_by')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .maybeSingle()
    const row = data as { id: string; to_space_id: string; initiated_by: HostTransferSide } | null
    if (!row) return null

    const [hosts, runs, space] = await Promise.all([
      callerHostsEvent(eventId),
      callerRunsSpace(row.to_space_id, profileId),
      getSpaceById(row.to_space_id),
    ])
    if (!hosts && !runs) return null
    if (!space) return null

    return {
      id: row.id,
      initiatedBy: row.initiated_by,
      toSpace: { id: space.id, slug: space.slug, name: space.brandName || space.name || 'Space' },
      awaitingYou: canRespondToHostTransfer({
        initiatedBy: row.initiated_by,
        callerHostsEvent: hosts,
        callerRunsTargetSpace: runs,
      }),
    }
  } catch {
    return null
  }
}

/** One Space the signed-in caller could ask to host an event from, resolved for display. */
export interface HostAskSpace {
  id: string
  name: string
}

/**
 * The Spaces from which THIS caller could ask to host `eventId` — the Space-side door into the
 * ADR-911 handshake, powering the event page's "ask to host" CTA. Mirrors `requestEventHost`'s own
 * gate so the CTA can never offer an ask the action would refuse: the caller must RUN the Space
 * (`listSpaceEventCreatorIds` read in reverse — owner, or an ACTIVE editor/moderator/admin member),
 * the Space must be active and pass `hostSpaceGateError`, it must not already host the event, the
 * money guard must not block a move, and no offer may already be pending (one per event). Returns
 * only the caller's OWN Spaces, so it reveals nothing a passer-by could not learn by pressing the
 * button. Fail-safe: any read error returns an empty list (the CTA just does not show).
 */
export async function listSpacesThatCanAskToHost(eventId: string): Promise<HostAskSpace[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  const admin = untyped()
  try {
    const state = await loadEventMoneyState(admin, eventId)
    if (!state) return []
    if (hostTransferBlockReason(state)) return []

    // One pending offer per event (the partial unique index): the ask would be refused, so no CTA.
    // The action's refusal string tells the same viewer the same fact, so hiding here reveals no more.
    const { data: pending } = await admin
      .from('event_host_transfers')
      .select('id')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .limit(1)
    if ((((pending as unknown[] | null) ?? []).length) > 0) return []

    const [{ data: owned }, { data: seats }] = await Promise.all([
      admin.from('spaces').select('id').eq('owner_profile_id', profileId),
      admin
        .from('space_members')
        .select('space_id')
        .eq('profile_id', profileId)
        .in('role', ['editor', 'moderator', 'admin'])
        .eq('status', 'active'),
    ])
    const runIds = [
      ...new Set([
        ...((owned ?? []) as Array<{ id: string }>).map((s) => s.id),
        ...((seats ?? []) as Array<{ space_id: string }>).map((s) => s.space_id),
      ]),
    ].filter((id) => id !== state.hostSpaceId)
    if (runIds.length === 0) return []

    const { data: rows } = await admin.from('spaces').select('id, name, brand_name, status, type').in('id', runIds)
    return ((rows ?? []) as Array<{ id: string; name: string | null; brand_name: string | null; status: string | null; type: string | null }>)
      .filter((s) => s.status === 'active' && !hostSpaceGateError({ type: s.type }))
      .map((s) => ({ id: s.id, name: s.brand_name || s.name || 'Space' }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12)
  } catch {
    return []
  }
}

/**
 * OFFER hosting to a Space (the event side raises it). Caller must manage the event.
 *
 * Auto-accepts when the caller also runs the target Space — the case setEventHostEntity already
 * allows, so this adds no authority. Otherwise the row sits pending and that Space's stewards decide.
 */
export async function offerEventHost(eventId: string, toSpaceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('You need to be signed in.')
  if (!(await callerHostsEvent(eventId))) return fail('You do not manage this event.')

  const target = await getSpaceById(toSpaceId)
  if (!target) return fail('That Space could not be found.')
  if (target.status !== 'active') return fail('That Space is not active.')
  const gate = hostSpaceGateError({ type: target.type })
  if (gate) return fail(gate)

  const admin = untyped()
  const state = await loadEventMoneyState(admin, eventId)
  if (!state) return fail('That event could not be found.')
  if (state.hostSpaceId === toSpaceId) return fail(`${target.name} already hosts this event.`)

  const blocked = hostTransferBlockReason(state)
  if (blocked) return fail(blocked)

  const runsTarget = await callerRunsSpace(toSpaceId, profileId)
  const autoAccept = shouldAutoAcceptHostTransfer({ callerHostsEvent: true, callerRunsTargetSpace: runsTarget })

  const { error } = await admin.from('event_host_transfers').insert({
    event_id: eventId,
    to_space_id: toSpaceId,
    from_space_id: state.hostSpaceId,
    initiated_by: 'host' satisfies HostTransferSide,
    requested_by: profileId,
    status: autoAccept ? 'accepted' : 'pending',
    responded_at: autoAccept ? new Date().toISOString() : null,
    responded_by: autoAccept ? profileId : null,
  })
  if (error) {
    // 23505 = the partial unique index: an offer is already pending for this event.
    if (error.code === '23505') return fail('This event already has a host offer waiting for a reply.')
    console.error('[host-transfer] insert failed', { code: error.code, message: error.message, eventId })
    return fail('Could not offer hosting. Please try again.')
  }

  if (autoAccept) {
    if (!(await applyHost(admin, eventId, toSpaceId))) return fail('Could not change the host. Please try again.')
  } else {
    await notify(
      admin,
      await listSpaceEventCreatorIds(toSpaceId),
      profileId,
      'event_host_offer',
      eventId,
      `asked your Space to host “${state.title}”`,
    )
  }

  revalidatePath(`/events/${state.slug}`)
  revalidatePath(`/spaces/${target.slug}`)
  return ok()
}

/**
 * ASK to host an event (the Space side raises it). Caller must run the Space.
 *
 * Never auto-accepts on this side alone: the host is giving up the money, so the host must agree.
 */
export async function requestEventHost(eventId: string, spaceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('You need to be signed in.')
  if (!(await callerRunsSpace(spaceId, profileId))) return fail('You do not manage that Space.')

  const target = await getSpaceById(spaceId)
  if (!target) return fail('That Space could not be found.')
  if (target.status !== 'active') return fail('That Space is not active.')
  const gate = hostSpaceGateError({ type: target.type })
  if (gate) return fail(gate)

  const admin = untyped()
  const state = await loadEventMoneyState(admin, eventId)
  if (!state) return fail('That event could not be found.')
  if (state.hostSpaceId === spaceId) return fail('Your Space already hosts this event.')

  const blocked = hostTransferBlockReason(state)
  if (blocked) return fail(blocked)

  const hostsEvent = await callerHostsEvent(eventId)
  const autoAccept = shouldAutoAcceptHostTransfer({ callerHostsEvent: hostsEvent, callerRunsTargetSpace: true })

  const { error } = await admin.from('event_host_transfers').insert({
    event_id: eventId,
    to_space_id: spaceId,
    from_space_id: state.hostSpaceId,
    initiated_by: 'space' satisfies HostTransferSide,
    requested_by: profileId,
    status: autoAccept ? 'accepted' : 'pending',
    responded_at: autoAccept ? new Date().toISOString() : null,
    responded_by: autoAccept ? profileId : null,
  })
  if (error) {
    if (error.code === '23505') return fail('This event already has a host offer waiting for a reply.')
    console.error('[host-transfer] insert failed', { code: error.code, message: error.message, eventId })
    return fail('Could not ask to host. Please try again.')
  }

  if (autoAccept) {
    if (!(await applyHost(admin, eventId, spaceId))) return fail('Could not change the host. Please try again.')
  } else {
    const { data: managers } = await admin.from('event_cohosts').select('profile_id').eq('event_id', eventId)
    const cohostIds = ((managers as { profile_id: string }[] | null) ?? []).map((m) => m.profile_id)
    const fromIds = state.hostSpaceId ? await listSpaceEventCreatorIds(state.hostSpaceId) : []
    await notify(
      admin,
      [...cohostIds, ...fromIds],
      profileId,
      'event_host_request',
      eventId,
      `asked to host “${state.title}”`,
    )
  }

  revalidatePath(`/events/${state.slug}`)
  revalidatePath(`/spaces/${target.slug}`)
  return ok()
}

/** Shared responder for accept / decline / revoke. */
async function respond(transferId: string, next: 'accepted' | 'declined' | 'revoked'): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('You need to be signed in.')

  const admin = untyped()
  const { data } = await admin
    .from('event_host_transfers')
    .select('id, event_id, to_space_id, initiated_by, requested_by, status')
    .eq('id', transferId)
    .maybeSingle()
  const row = data as {
    id: string
    event_id: string
    to_space_id: string
    initiated_by: HostTransferSide
    requested_by: string
    status: string
  } | null
  if (!row) return fail('That host offer could not be found.')
  if (row.status !== 'pending') return fail('That host offer has already been resolved.')

  const [hosts, runs] = await Promise.all([
    callerHostsEvent(row.event_id),
    callerRunsSpace(row.to_space_id, profileId),
  ])

  if (next === 'revoked') {
    // Withdrawing is for whoever RAISED it, which is the mirror of who may accept.
    const raiser = row.initiated_by === 'host' ? hosts : runs
    if (!raiser) return fail('You cannot withdraw that offer.')
  } else if (
    // 🔴 The consent guard: only the side that did NOT raise it may accept or decline. Without this
    // the raiser could accept their own offer, which turns the handshake back into the unilateral
    // write it replaced — and what is being written is who receives other people's money.
    !canRespondToHostTransfer({ initiatedBy: row.initiated_by, callerHostsEvent: hosts, callerRunsTargetSpace: runs })
  ) {
    return fail('Only the other side can answer that offer.')
  }

  const state = await loadEventMoneyState(admin, row.event_id)
  if (!state) return fail('That event could not be found.')

  // Re-check the money guard AT ACCEPT TIME. Tickets can settle between the offer and the reply, and
  // the check at offer time says nothing about now.
  if (next === 'accepted') {
    const blocked = hostTransferBlockReason(state)
    if (blocked) return fail(blocked)
  }

  const { error } = await admin
    .from('event_host_transfers')
    .update({ status: next, responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', transferId)
    .eq('status', 'pending') // lost-update guard: a concurrent reply wins and this one reports it
  if (error) {
    console.error('[host-transfer] respond failed', { code: error.code, message: error.message, transferId })
    return fail('Could not answer that offer. Please try again.')
  }

  if (next === 'accepted' && !(await applyHost(admin, row.event_id, row.to_space_id))) {
    return fail('Could not change the host. Please try again.')
  }

  await notify(
    admin,
    [row.requested_by],
    profileId,
    next === 'accepted' ? 'event_host_accepted' : 'event_host_declined',
    row.event_id,
    next === 'accepted' ? `now hosts “${state.title}”` : `passed on hosting “${state.title}”`,
  )

  revalidatePath(`/events/${state.slug}`)
  return ok()
}

/** ACCEPT hosting (or accept handing it over). Only the side that did not raise the offer. */
export async function acceptEventHostTransfer(transferId: string): Promise<ActionResult> {
  return respond(transferId, 'accepted')
}

/** DECLINE. Only the side that did not raise the offer. */
export async function declineEventHostTransfer(transferId: string): Promise<ActionResult> {
  return respond(transferId, 'declined')
}

/** WITHDRAW an offer you raised. */
export async function revokeEventHostTransfer(transferId: string): Promise<ActionResult> {
  return respond(transferId, 'revoked')
}
