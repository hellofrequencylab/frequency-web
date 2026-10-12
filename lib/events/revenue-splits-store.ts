// THE STORE HALF OF REVENUE SPLITS (LIVE-767). The rule and the arithmetic are in ./revenue-splits.ts
// (pure); this file is the service-role IO around them: the owner's read and write, and the payees a
// ticket checkout can split with today. Every reader fails safe to "no split", which is the
// destination charge to the host every ticket took before this.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCollaboratorSpacesForEvent, eventHomeSpaceId } from './event-share'
import { getConnectReadyMap, payoutsLive } from '@/lib/billing/connect'
import { validateRevenueSplits, SPLIT_REFUSAL_COPY, type SplitPayee, type SplitShareInput } from './revenue-splits'


const TABLE = 'event_revenue_splits'

function db(): SupabaseClient {
  return createAdminClient()
}

type SplitRow = { space_id: string; bps: number }

/** The stored shares of an Event, with each Collaborator resolved. For the owner's surface. */
export interface EventRevenueSplitView {
  spaceId: string
  spaceName: string
  spaceSlug: string
  logoUrl: string | null
  bps: number
  /** False when this Collaborator cannot be paid today; the surface says so and the set refuses it. */
  payoutsReady: boolean
}

async function readSplitRows(eventId: string): Promise<SplitRow[]> {
  const { data, error } = await db().from(TABLE).select('space_id, bps').eq('event_id', eventId)
  if (error) throw new Error(`event splits unreadable: ${error.message}`)
  return (data ?? []) as SplitRow[]
}

/** Which Collaborator Spaces are ready to be paid: payouts live and the owner's account ready. */
async function readyCollaborators(spaces: { id: string }[]): Promise<Map<string, { ownerProfileId: string }>> {
  const out = new Map<string, { ownerProfileId: string }>()
  if (!spaces.length) return out
  const { data } = await db().from('spaces').select('id, owner_profile_id').in('id', spaces.map((s) => s.id))
  const owners = (data ?? []) as { id: string; owner_profile_id: string | null }[]
  const ready = await getConnectReadyMap(owners.map((o) => o.owner_profile_id).filter((id): id is string => !!id))
  for (const o of owners) {
    if (o.owner_profile_id && ready[o.owner_profile_id]) out.set(o.id, { ownerProfileId: o.owner_profile_id })
  }
  return out
}

/** Every accepted Collaborator of the Event with its current share (0 when none). FAIL-SAFE: []. */
export async function listEventRevenueSplits(eventId: string): Promise<EventRevenueSplitView[]> {
  try {
    const [collaborators, rows] = await Promise.all([listCollaboratorSpacesForEvent(eventId), readSplitRows(eventId)])
    const ready = await readyCollaborators(collaborators)
    const bps = new Map(rows.map((r) => [r.space_id, r.bps]))
    return collaborators.map((c) => ({
      spaceId: c.id,
      spaceName: c.name,
      spaceSlug: c.slug,
      logoUrl: c.logoUrl,
      bps: bps.get(c.id) ?? 0,
      payoutsReady: ready.has(c.id),
    }))
  } catch {
    return []
  }
}

/** True when `profileId` owns the Event's home Space. The only caller who may set shares. */
export async function viewerOwnsEventHomeSpace(eventId: string, profileId: string): Promise<boolean> {
  const homeId = await eventHomeSpaceId(eventId)
  if (!homeId) return false
  const { data } = await db().from('spaces').select('owner_profile_id').eq('id', homeId).maybeSingle()
  return (data as { owner_profile_id: string | null } | null)?.owner_profile_id === profileId
}


/**
 * Replace the Event's shares. The caller has already proven it owns the home Space (the action
 * gate); this re-checks the rule against today's Collaborators and their payout readiness, then
 * writes the set whole: a share set to 0 is removed.
 */
export async function saveEventRevenueSplits(
  eventId: string,
  shares: readonly SplitShareInput[],
  createdBy: string,
): Promise<{ ok: true } | { error: string }> {
  if (shares.some((s) => s.bps > 0) && !(await payoutsLive())) return { error: 'Payouts are not turned on yet.' }
  const collaborators = await listCollaboratorSpacesForEvent(eventId)
  const ready = await readyCollaborators(collaborators)
  const verdict = validateRevenueSplits(shares, {
    collaboratorSpaceIds: collaborators.map((c) => c.id),
    readySpaceIds: [...ready.keys()],
  })
  if ('refused' in verdict) return { error: SPLIT_REFUSAL_COPY[verdict.refused] }
  const keep = verdict.shares.map((s) => s.spaceId)
  const client = db()
  if (verdict.shares.length) {
    const { error } = await client.from(TABLE).upsert(
      verdict.shares.map((s) => ({ event_id: eventId, space_id: s.spaceId, bps: s.bps, created_by: createdBy })),
      { onConflict: 'event_id,space_id' },
    )
    if (error) return { error: 'Could not save the shares. Please try again.' }
  }
  let remove = client.from(TABLE).delete().eq('event_id', eventId)
  if (keep.length) remove = remove.not('space_id', 'in', `(${keep.join(',')})`)
  const { error } = await remove
  if (error) return { error: 'Could not save the shares. Please try again.' }
  return { ok: true }
}

/**
 * The payees a ticket checkout can split with TODAY: stored shares that are still accepted
 * Collaborators and still payable. A Space that lost either since the owner set its share is left
 * out and its share stays with the home Space, so a sale never waits on a Collaborator's account.
 * FAIL-SAFE: [] (a destination charge to the host, the path every ticket took before).
 */
export async function loadTicketSplitPayees(eventId: string): Promise<SplitPayee[]> {
  try {
    const rows = await readSplitRows(eventId)
    if (!rows.length) return []
    const collaborators = await listCollaboratorSpacesForEvent(eventId)
    const accepted = new Set(collaborators.map((c) => c.id))
    const live = rows.filter((r) => accepted.has(r.space_id) && r.bps > 0)
    if (!live.length) return []
    const ready = await readyCollaborators(live.map((r) => ({ id: r.space_id })))
    const ownerIds = [...ready.values()].map((v) => v.ownerProfileId)
    if (!ownerIds.length) return []
    const { data } = await db().from('profiles').select('id, stripe_account_id').in('id', ownerIds)
    const accounts = new Map(((data ?? []) as { id: string; stripe_account_id: string | null }[]).map((p) => [p.id, p.stripe_account_id]))
    return live.flatMap((r) => {
      const owner = ready.get(r.space_id)
      const account = owner ? accounts.get(owner.ownerProfileId) : null
      return owner && account ? [{ spaceId: r.space_id, ownerProfileId: owner.ownerProfileId, stripeAccountId: account, bps: r.bps }] : []
    })
  } catch {
    return []
  }
}
