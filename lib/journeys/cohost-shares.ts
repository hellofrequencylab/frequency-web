// Co-hosted Journeys (journey_plan_space_shares): the IO half of the invite and accept flow (SCAN-840).
//
// The table is service-role only and newer than the generated DB types, so every read and write rides
// the untyped admin handle (ADR-246). The pure half (merge, credit) lives in ./space-shares.ts. Server only.

import { createAdminClient } from '@/lib/supabase/admin'

function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

type CoHostShareStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

/** A share row with the Journey and the other Space named, for the two lists on the Journeys manager. */
export interface CoHostShareView {
  id: string
  status: CoHostShareStatus
  planId: string
  planTitle: string
  /** The Space on the other side of the share: the co-host for an outgoing row, the home Space for an incoming one. */
  otherSpaceName: string
  otherSpaceSlug: string | null
}

interface ShareRow {
  id: string
  plan_id: string
  space_id: string
  status: CoHostShareStatus
}

/** One share row by id (the actions re-read it, the page does not trust a submitted status). */
export async function loadCoHostShare(shareId: string): Promise<(ShareRow & { homeSpaceId: string | null }) | null> {
  try {
    const { data } = await db()
      .from('journey_plan_space_shares')
      .select('id, plan_id, space_id, status')
      .eq('id', shareId)
      .maybeSingle()
    if (!data) return null
    const { data: plan } = await db().from('journey_plans').select('space_id').eq('id', data.plan_id).maybeSingle()
    return { ...(data as ShareRow), homeSpaceId: (plan as { space_id: string | null } | null)?.space_id ?? null }
  } catch {
    return null
  }
}

async function nameSpaces(ids: string[]): Promise<Map<string, { name: string; slug: string | null }>> {
  const out = new Map<string, { name: string; slug: string | null }>()
  if (ids.length === 0) return out
  const { data } = await db().from('spaces').select('id, slug, name, brand_name').in('id', ids)
  for (const s of (data ?? []) as Array<{ id: string; slug: string | null; name: string | null; brand_name: string | null }>) {
    out.set(s.id, { name: s.brand_name ?? s.name ?? 'Space', slug: s.slug })
  }
  return out
}

/**
 * The live co-host shares around a Space: INCOMING (another Space invited this one, pending or accepted)
 * and OUTGOING (this Space's Journeys shared out, pending or accepted). Declined and revoked rows are
 * history and not listed. FAIL-SAFE: empty lists.
 */
export async function listCoHostShares(spaceId: string): Promise<{ incoming: CoHostShareView[]; outgoing: CoHostShareView[] }> {
  const empty = { incoming: [], outgoing: [] }
  try {
    const live = ['pending', 'accepted']
    const [{ data: inRows }, { data: ownPlans }] = await Promise.all([
      db().from('journey_plan_space_shares').select('id, plan_id, space_id, status').eq('space_id', spaceId).in('status', live),
      db().from('journey_plans').select('id, title').eq('space_id', spaceId),
    ])
    const own = (ownPlans ?? []) as Array<{ id: string; title: string }>
    const { data: outRows } = own.length
      ? await db().from('journey_plan_space_shares').select('id, plan_id, space_id, status').in('plan_id', own.map((p) => p.id)).in('status', live)
      : { data: [] }
    const incomingRows = (inRows ?? []) as ShareRow[]
    const outgoingRows = (outRows ?? []) as ShareRow[]

    const incomingPlanIds = [...new Set(incomingRows.map((r) => r.plan_id))]
    const { data: incomingPlans } = incomingPlanIds.length
      ? await db().from('journey_plans').select('id, title, space_id').in('id', incomingPlanIds)
      : { data: [] }
    const planById = new Map(((incomingPlans ?? []) as Array<{ id: string; title: string; space_id: string | null }>).map((p) => [p.id, p]))
    const titleById = new Map(own.map((p) => [p.id, p.title]))

    const spaces = await nameSpaces([
      ...outgoingRows.map((r) => r.space_id),
      ...[...planById.values()].map((p) => p.space_id).filter((id): id is string => !!id),
    ])
    const other = (id: string | null | undefined) => (id ? spaces.get(id) : undefined)

    return {
      incoming: incomingRows.map((r) => {
        const plan = planById.get(r.plan_id)
        const home = other(plan?.space_id)
        return { id: r.id, status: r.status, planId: r.plan_id, planTitle: plan?.title ?? 'A Journey', otherSpaceName: home?.name ?? 'A Space', otherSpaceSlug: home?.slug ?? null }
      }),
      outgoing: outgoingRows.map((r) => {
        const co = other(r.space_id)
        return { id: r.id, status: r.status, planId: r.plan_id, planTitle: titleById.get(r.plan_id) ?? 'A Journey', otherSpaceName: co?.name ?? 'A Space', otherSpaceSlug: co?.slug ?? null }
      }),
    }
  } catch {
    return empty
  }
}
