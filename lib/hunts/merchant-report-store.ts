/**
 * The merchant report's readers (FH-026): the IO half over lib/hunts/merchant-report.ts. Every Hunt
 * table is service role only, so these run on the server after `readMerchantReport` has decided the
 * caller's standing. They select runs and counts, never a profile id, apart from the consent roster,
 * which is read for exactly the one Space the caller was authorised for. It writes nothing.
 */
import { db, huntRpc } from './commerce-store'
import type { ReportDeps, ReportFacts, RosterRow } from './merchant-report'
import { loadStationFacts } from './redemption-store'

const PAGE = 1000
const MAX_ROWS = 20000

/** Read a whole table slice in pages, so a busy Trail is not cut at the API's default limit. */
export async function huntRows<T>(table: string, columns: string, huntId: string, key: readonly string[] = ['id']): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = db().from(table).select(columns).eq('hunt_id', huntId)
    for (const column of key) query = query.order(column)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
  throw new Error(`${table} has more rows than a report reads`)
}

type ClaimRow = { id: string; run_id: string; version_id: string; mission_key: string; state: string; assurance: string; policy_result: { placement_id?: unknown; venue_space_id?: unknown } | null }
type BindingRow = { placement_id: string; version_id: string; mission_key: string; venue_space_id: string | null }
type GrantRow = { id: string; reward_id: string; state: string; redeemed_venue_space_id: string | null }

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export async function loadReportFacts(huntId: string): Promise<ReportFacts> {
  const [claims, bindings, runs, rewards, grants] = await Promise.all([
    huntRows<ClaimRow>('hunt_claims', 'id, run_id, version_id, mission_key, state, assurance, policy_result', huntId),
    huntRows<BindingRow>('hunt_mission_placements', 'placement_id, version_id, mission_key, venue_space_id', huntId, ['version_id', 'mission_key', 'placement_id']),
    huntRows<{ id: string; state: string }>('hunt_runs', 'id, state', huntId),
    huntRows<{ id: string; title: string; kind: string }>('hunt_rewards', 'id, title, kind', huntId),
    huntRows<GrantRow>('hunt_reward_grants', 'id, reward_id, state, redeemed_venue_space_id', huntId),
  ])
  return {
    claims: claims.map((c) => ({
      runId: c.run_id,
      versionId: c.version_id,
      missionKey: c.mission_key,
      state: c.state,
      assurance: c.assurance,
      placementId: text(c.policy_result?.placement_id),
      heldVenueSpaceId: text(c.policy_result?.venue_space_id),
    })),
    bindings: bindings.map((b) => ({ versionId: b.version_id, missionKey: b.mission_key, placementId: b.placement_id, venueSpaceId: b.venue_space_id })),
    runs,
    rewards,
    grants: grants.map((g) => ({ rewardId: g.reward_id, state: g.state, redeemedVenueSpaceId: g.redeemed_venue_space_id })),
  }
}

/** One Space's opted-in leads, from the consent ledger's own roster function (no email, no other Space). */
async function loadRoster(spaceId: string): Promise<RosterRow[]> {
  const { data, error } = await huntRpc('hunt_consent_roster', { p_space: spaceId })
  if (error) throw new Error(`hunt_consent_roster failed: ${error.message}`)
  const rows = (Array.isArray(data) ? data : []) as { profile_id: string; consent_version: string; opted_in_at: string | null; first_hunt_id: string | null }[]
  return rows.map((r) => ({ profileId: r.profile_id, consentVersion: r.consent_version, optedInAt: r.opted_in_at, firstHuntId: r.first_hunt_id }))
}

export const merchantReportDeps: ReportDeps = { loadStanding: loadStationFacts, loadFacts: loadReportFacts, loadRoster }

/** A Trail by its public slug: the id for the readers and the words for the page. Null when there is none. */
export async function huntBySlug(slug: string): Promise<{ id: string; slug: string } | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null
  const { data, error } = await db().from('hunts').select('id, slug').eq('slug', slug).maybeSingle()
  return error ? null : (data as { id: string; slug: string } | null)
}
