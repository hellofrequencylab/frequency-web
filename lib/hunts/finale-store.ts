/**
 * The finale's two writes from the player's Trail page (FH-031T), and the two reads they need.
 *
 *   loadFinaleRewards(scope)  the rewards a published version offers, so the page can show a Collect tap
 *   loadFinaleStop(scope)     the version's Event stop: the one mission bound to an `event` placement
 *
 * The writes themselves are in app/(main)/hunts/[slug]/play/finale-actions.ts. The completion reward goes
 * through `grantFinaleReward` (lib/hunts/rally-finale.ts), and `hunt_reward_grant` repeats the seat check
 * in SQL (migration 20270346086000_hunt_finale_reward_gate.sql). The Event stop credits through
 * `hunt_claim_apply` with `finaleDoorEvidence` at assurance `event_door`, the existing evidence path.
 *
 * Reads only, scoped to one Hunt and one version. Every Hunt table is service role only, so this uses
 * the shared service-role client (lib/hunts/commerce-store.ts) and never takes an id from a request.
 */
import { db } from './commerce-store'

type VersionScope = { huntId: string; versionId: string }

/** Rewards on the version that are not retired, by key. Empty when the read fails. */
export async function loadFinaleRewards(scope: VersionScope): Promise<{ key: string; title: string }[]> {
  const { data, error } = await db()
    .from('hunt_rewards')
    .select('reward_key, title, retired_at')
    .eq('hunt_id', scope.huntId)
    .eq('version_id', scope.versionId)
    .order('reward_key', { ascending: true })
  if (error) return []
  return ((data ?? []) as { reward_key: string; title: string; retired_at: string | null }[])
    .filter((r) => r.retired_at === null)
    .map((r) => ({ key: r.reward_key, title: r.title }))
}

/**
 * The Event stop on a version: a mission bound to a live placement of medium `event`. A version with no
 * such binding, or with more than one (the stop would be ambiguous), has no Event stop.
 */
export async function loadFinaleStop(scope: VersionScope): Promise<{ missionKey: string; placementId: string } | null> {
  const client = db()
  const placements = await client
    .from('hunt_placements')
    .select('id')
    .eq('hunt_id', scope.huntId)
    .eq('medium', 'event')
    .is('revoked_at', null)
  if (placements.error) return null
  const ids = ((placements.data ?? []) as { id: string }[]).map((p) => p.id)
  if (ids.length === 0) return null

  const bindings = await client
    .from('hunt_mission_placements')
    .select('mission_key, placement_id')
    .eq('hunt_id', scope.huntId)
    .eq('version_id', scope.versionId)
    .in('placement_id', ids)
  if (bindings.error) return null
  const rows = (bindings.data ?? []) as { mission_key: string; placement_id: string }[]
  return rows.length === 1 ? { missionKey: rows[0].mission_key, placementId: rows[0].placement_id } : null
}
