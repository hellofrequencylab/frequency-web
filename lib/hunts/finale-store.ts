/**
 * The finale's IO for the author and for a reward grant (FH-031T). The pure rules are in
 * lib/hunts/finale-draft.ts (which Events a Trail may end at) and lib/hunts/rally-finale.ts (who the
 * Event admits). Nothing here writes to an Events table: the Hunt cannot create a seat.
 *
 * - `loadFinaleEventOptions`: the Events the editor offers. Call it only after lib/hunts/store.ts
 *   `loadTrail` has authorised the actor on this Hunt; it takes no actor of its own.
 * - `finaleBlocksPublish`: publish asks the same rule again with rows read now, so an Event that was
 *   cancelled, or a partner that withdrew, since the author chose it stops the publish. A failed read
 *   throws: a publish that cannot check its finale does not go out.
 * - `grantRunReward`: THE way a route grants a Hunt reward. A completion reward on a Trail that ends at
 *   an Event goes through `grantFinaleReward`, so a finished player with no seat is refused before the
 *   database is called. The same check inside hunt_reward_grant is owed as SQL (FH-031U);
 *   this path is correct with or without it.
 */
import { hostingSpaceId } from '@/lib/events/belonging'
import { db, huntRpc } from './commerce-store'
import { FINALE_BLOCK_ITEM, finaleEventAllowed, isCompletionReward, type FinaleEventFacts, type FinaleHunt } from './finale-draft'
import { partnerLive } from './partners'
import { grantFinaleReward } from './rally-finale'
import { loadRallyFinale } from './rally-finale-store'
import { grantReward } from './rewards'

type HuntOwner = { id: string; owner_space_id: string | null; owner_profile_id: string | null }
type EventRow = { id: string; title: string; starts_at: string | null; status: string | null; is_cancelled: boolean | null; removed_at: string | null; host_space_id: string | null; space_id: string | null; host_id: string | null }
const EVENT_COLS = 'id, title, starts_at, status, is_cancelled, removed_at, host_space_id, space_id, host_id'

const eventFacts = (e: EventRow): FinaleEventFacts => ({
  status: e.status,
  cancelled: e.is_cancelled === true,
  removed: !!e.removed_at,
  // The one host resolver, as the player's reader uses it (lib/hunts/rally-finale-store.ts).
  hostSpaceId: hostingSpaceId({ spaceId: e.space_id, hostSpaceId: e.host_space_id }, null),
  hostProfileId: e.host_id,
})

/** The Hunt as the rule reads it: its owner and the partner Spaces in force right now. */
async function finaleHunt(hunt: HuntOwner, now: string): Promise<FinaleHunt> {
  const { data, error } = await db().from('hunt_partners').select('space_id, status, effective_at, revoked_at').eq('hunt_id', hunt.id)
  if (error) throw new Error(`hunt_partners read failed: ${error.message}`)
  const rows = (data ?? []) as { space_id: string; status: Parameters<typeof partnerLive>[0]['status']; effective_at: string | null; revoked_at: string | null }[]
  return {
    ownerSpaceId: hunt.owner_space_id,
    ownerProfileId: hunt.owner_profile_id,
    livePartnerSpaceIds: rows.filter((p) => partnerLive({ status: p.status, effectiveAt: p.effective_at, revokedAt: p.revoked_at }, now)).map((p) => p.space_id),
  }
}

type FinaleEventOption = { value: string; label: string }

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** The upcoming Events this Hunt may end at, soonest first. Empty when there are none, or when a read fails. */
export async function loadFinaleEventOptions(huntId: string, now: string = new Date().toISOString()): Promise<FinaleEventOption[]> {
  try {
    const { data } = await db().from('hunts').select('id, owner_space_id, owner_profile_id').eq('id', huntId).maybeSingle()
    const hunt = data as HuntOwner | null
    if (!hunt) return []
    const rule = await finaleHunt(hunt, now)
    const spaces = [...new Set([rule.ownerSpaceId, ...rule.livePartnerSpaceIds].filter((id): id is string => !!id))]
    const upcoming = () => db().from('events').select(EVENT_COLS).eq('status', 'published').is('removed_at', null).gte('starts_at', now).order('starts_at').limit(50)
    const reads = [
      ...(spaces.length ? [upcoming().in('host_space_id', spaces), upcoming().in('space_id', spaces)] : []),
      ...(!rule.ownerSpaceId && rule.ownerProfileId ? [upcoming().eq('host_id', rule.ownerProfileId)] : []),
    ]
    const found = new Map<string, EventRow>()
    for (const res of await Promise.all(reads)) {
      for (const e of (res.data ?? []) as EventRow[]) found.set(e.id, e)
    }
    return [...found.values()]
      .filter((e) => finaleEventAllowed(eventFacts(e), rule))
      .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
      .map((e) => ({ value: e.id, label: e.starts_at ? `${e.title} (${DAY.format(new Date(e.starts_at))})` : e.title }))
  } catch {
    return []
  }
}

/** Null when the publish may go on: no finale, or an Event this Hunt may end at right now. */
export async function finaleBlocksPublish(hunt: HuntOwner, eventId: string | undefined): Promise<typeof FINALE_BLOCK_ITEM | null> {
  if (!eventId) return null
  const { data, error } = await db().from('events').select(EVENT_COLS).eq('id', eventId).maybeSingle()
  if (error) throw new Error(`events read failed: ${error.message}`)
  const rule = await finaleHunt(hunt, new Date().toISOString())
  return finaleEventAllowed(data ? eventFacts(data as EventRow) : null, rule) ? null : FINALE_BLOCK_ITEM
}

type GrantOutcome = Awaited<ReturnType<typeof grantFinaleReward>> | { result: 'run_not_found' | 'reward_not_found'; replayed: false }

/**
 * Grant one reward to the caller's own run. `profileId` comes from the session, never from the request.
 * The idempotency key is derived here, so a second tap replays the first answer.
 */
export async function grantRunReward(input: { profileId: string; runId: string; rewardKey: string }, now: string = new Date().toISOString()): Promise<GrantOutcome> {
  // Null when the run is missing or not this player's; the finale is read before anything is granted.
  const finale = await loadRallyFinale(input.runId, input.profileId, now)
  if (!finale) return { result: 'run_not_found', replayed: false }
  const run = await db().from('hunt_runs').select('hunt_id, version_id').eq('id', input.runId).eq('subject_profile_id', input.profileId).maybeSingle()
  const at = run.data as { hunt_id: string; version_id: string } | null
  if (run.error || !at) return { result: 'run_not_found', replayed: false }
  const reward = await db().from('hunt_rewards').select('eligibility').eq('hunt_id', at.hunt_id).eq('version_id', at.version_id).eq('reward_key', input.rewardKey).maybeSingle()
  if (reward.error) throw new Error(`hunt_rewards read failed: ${reward.error.message}`)
  if (!reward.data) return { result: 'reward_not_found', replayed: false }

  const grant = { actorId: input.profileId, runId: input.runId, rewardKey: input.rewardKey, idempotencyKey: `reward-grant:${input.runId}:${input.rewardKey}` }
  return isCompletionReward((reward.data as { eligibility: unknown }).eligibility) ? grantFinaleReward(huntRpc, grant, finale) : grantReward(huntRpc, grant)
}
