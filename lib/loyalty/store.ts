// REGULARS, the IO half (LIVE-940, ADR-1780, docs/LOYALTY.md). Reads and writes on the three loyalty
// tables through the service-role admin client; every table is service-role only (scripts/table-grants.txt
// `internal`), so THIS file is the tenancy wall: each read is scoped to one Space or one member, and each
// write runs after the owner gate below. Reads FAIL-SAFE (null / []); writes FAIL-CLOSED on a gate miss.
// No 'use server' here (it also exports types and the gate), so the actions live in ./actions.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'
import { envFlag } from '@/lib/env/string'
import { planRank, PLAN_CAPABILITY_RANK } from '@/lib/pricing/plans'
import { spaceLimitsWaived } from '@/lib/pricing/space-allowance'
import { isMappable, normalizeSpaceLocation } from '@/lib/spaces/location'
import type { Space } from '@/lib/spaces/types'
import {
  defaultProgram,
  type LoyaltyCard,
  type LoyaltyProgram,
  type LoyaltyProgramInput,
  type LoyaltyReward,
} from './program'

// ── The switch and the gate ──────────────────────────────────────────────────────────────────────

/** The launch switch (`LOYALTY_ENABLED`, envFlag; gate in docs/RUNBOOKS.md "Regulars"). Off: no stamp
 *  is written, no Zap is paid for a Space check-in, and the owner panel says the program is not open. */
export function loyaltyEnabled(): boolean {
  return envFlag('LOYALTY_ENABLED')
}

/** Why a Space cannot run Regulars, or null when it can. Pure on the Space row: a physical location
 *  (a mappable coordinate, lib/spaces/location.ts) and a plan at or above Business. A staff-waived
 *  Space clears the plan floor (LIVE-822). Reads the waiver only on a refusal. */
export async function loyaltyEligibility(space: Space): Promise<'no_location' | 'plan' | null> {
  const location = normalizeSpaceLocation({
    street: space.street,
    city: space.city,
    region: space.region,
    postalCode: space.postalCode,
    country: space.country,
    latitude: space.latitude,
    longitude: space.longitude,
    precision: space.locationPrecision,
  })
  if (!isMappable(location)) return 'no_location'
  if (planRank(space.plan) >= PLAN_CAPABILITY_RANK.business) return null
  try {
    if (await spaceLimitsWaived(space.id)) return null
  } catch {
    /* fail-closed on the plan read: a free Space stays on the plan wall */
  }
  return 'plan'
}

/** The owner gate every loyalty write runs behind: canEditProfile on the Space, or a janitor. Shared with
 *  ./hunt-store.ts so hunts and cards answer to one gate. */
export async function loyaltyOwnerGate(spaceId: string): Promise<{ space: Space; callerId: string } | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile && !isJanitor(caller.webRole)) return null
  return { space, callerId: caller.id }
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────────────────

type ProgramRow = {
  space_id: string
  status: string
  stamps_required: number
  welcome_stamps: number
  reward_title: string
  reward_value_cents: number
  reward_note: string | null
  geofence: boolean
}
const PROGRAM_COLS = 'space_id, status, stamps_required, welcome_stamps, reward_title, reward_value_cents, reward_note, geofence'

type RewardRow = {
  id: string
  space_id: string
  code: string
  reward_title: string
  reward_value_cents: number
  earned_at: string
  redeemed_at: string | null
}
const REWARD_COLS = 'id, space_id, code, reward_title, reward_value_cents, earned_at, redeemed_at'

function toProgram(r: ProgramRow): LoyaltyProgram {
  return {
    spaceId: r.space_id,
    status: r.status === 'on' ? 'on' : 'off',
    stampsRequired: r.stamps_required,
    welcomeStamps: r.welcome_stamps,
    rewardTitle: r.reward_title,
    rewardValueCents: r.reward_value_cents,
    rewardNote: r.reward_note,
    geofence: !!r.geofence,
  }
}

function toReward(r: RewardRow): LoyaltyReward {
  return {
    id: r.id,
    code: r.code,
    rewardTitle: r.reward_title,
    rewardValueCents: r.reward_value_cents,
    earnedAt: r.earned_at,
    redeemedAt: r.redeemed_at,
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────

/** The Space's program, or the unsaved default. Not gated: the row holds nothing private (the check-in
 *  path and the public card both read it). FAIL-SAFE to the default. */
export async function getLoyaltyProgram(spaceId: string): Promise<LoyaltyProgram> {
  try {
    const { data } = await createAdminClient()
      .from('space_loyalty_programs')
      .select(PROGRAM_COLS)
      .eq('space_id', spaceId)
      .maybeSingle()
    return data ? toProgram(data as ProgramRow) : defaultProgram(spaceId)
  } catch {
    return defaultProgram(spaceId)
  }
}

/** Every card the MEMBER holds (a Space where they have a stamp or a reward), newest activity first.
 *  Scoped to the caller's own profile id; a Space whose program turned off still shows its open rewards. */
export async function listMyLoyaltyCards(profileId: string): Promise<LoyaltyCard[]> {
  try {
    const db = createAdminClient()
    const [{ data: stamps }, { data: rewards }] = await Promise.all([
      db.from('loyalty_stamps').select('space_id, reward_id').eq('profile_id', profileId).limit(2000),
      db.from('loyalty_rewards').select(REWARD_COLS).eq('profile_id', profileId).order('earned_at', { ascending: false }).limit(200),
    ])
    const open = new Map<string, number>()
    for (const s of (stamps ?? []) as { space_id: string; reward_id: string | null }[]) {
      if (!open.has(s.space_id)) open.set(s.space_id, 0)
      if (!s.reward_id) open.set(s.space_id, (open.get(s.space_id) ?? 0) + 1)
    }
    const byRewardSpace = new Map<string, LoyaltyReward[]>()
    for (const r of (rewards ?? []) as RewardRow[]) {
      if (r.redeemed_at) continue
      const list = byRewardSpace.get(r.space_id) ?? []
      list.push(toReward(r))
      byRewardSpace.set(r.space_id, list)
    }
    const spaceIds = [...new Set([...open.keys(), ...byRewardSpace.keys()])]
    if (spaceIds.length === 0) return []
    const [{ data: programs }, { data: spaces }] = await Promise.all([
      db.from('space_loyalty_programs').select(PROGRAM_COLS).in('space_id', spaceIds),
      db.from('spaces').select('id, slug, name, brand_name').in('id', spaceIds),
    ])
    const programById = new Map(((programs ?? []) as ProgramRow[]).map((p) => [p.space_id, toProgram(p)]))
    const cards: LoyaltyCard[] = []
    for (const sp of (spaces ?? []) as { id: string; slug: string; name: string; brand_name: string | null }[]) {
      const program = programById.get(sp.id) ?? defaultProgram(sp.id)
      const openRewards = byRewardSpace.get(sp.id) ?? []
      if (program.status !== 'on' && openRewards.length === 0) continue
      cards.push({
        spaceId: sp.id,
        spaceName: sp.brand_name ?? sp.name,
        spaceSlug: sp.slug,
        stamps: open.get(sp.id) ?? 0,
        required: program.stampsRequired,
        rewardTitle: program.rewardTitle,
        rewardValueCents: program.rewardValueCents,
        openRewards,
      })
    }
    return cards
  } catch {
    return []
  }
}

/** The owner roster: rewards earned at THIS Space and not yet handed out, oldest first, with who earned
 *  them. Gated on the owner gate (a janitor may preview). FAIL-SAFE to []. */
export async function listRewardsToHandOut(
  spaceId: string,
): Promise<(LoyaltyReward & { profileId: string; name: string })[]> {
  if (!(await loyaltyOwnerGate(spaceId))) return []
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('loyalty_rewards')
      .select(`${REWARD_COLS}, profile_id`)
      .eq('space_id', spaceId)
      .is('redeemed_at', null)
      .order('earned_at', { ascending: true })
      .limit(200)
    const rows = (data ?? []) as (RewardRow & { profile_id: string })[]
    if (rows.length === 0) return []
    const ids = [...new Set(rows.map((r) => r.profile_id))]
    const { data: people } = await db.from('profiles').select('id, display_name').in('id', ids)
    const names = new Map(((people ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]))
    return rows.map((r) => ({ ...toReward(r), profileId: r.profile_id, name: names.get(r.profile_id) ?? 'A member' }))
  } catch {
    return []
  }
}

/** The three owner numbers for the panel: stamps this month, rewards earned, rewards handed out.
 *  Gated on the owner gate. FAIL-SAFE to zeros. */
export async function loyaltyOwnerCounts(spaceId: string): Promise<{ stampsThisMonth: number; earned: number; handedOut: number }> {
  const zero = { stampsThisMonth: 0, earned: 0, handedOut: 0 }
  if (!(await loyaltyOwnerGate(spaceId))) return zero
  try {
    const db = createAdminClient()
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const [{ count: stamps }, { count: earned }, { count: handedOut }] = await Promise.all([
      db.from('loyalty_stamps').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).eq('kind', 'visit').gte('created_at', monthStart.toISOString()),
      db.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('space_id', spaceId),
      db.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).not('redeemed_at', 'is', null),
    ])
    return { stampsThisMonth: stamps ?? 0, earned: earned ?? 0, handedOut: handedOut ?? 0 }
  } catch {
    return zero
  }
}

// ── Writes (owner-gated; called only from ./actions.ts) ──────────────────────────────────────────

/** Save the Space's program. Replace-by-space. Refuses (null) on a gate miss or an ineligible Space
 *  turning the program ON; a draft may be saved OFF on any Space. */
export async function writeLoyaltyProgram(spaceId: string, input: LoyaltyProgramInput): Promise<LoyaltyProgram | null> {
  const gate = await loyaltyOwnerGate(spaceId)
  if (!gate) return null
  if (input.status === 'on' && (await loyaltyEligibility(gate.space)) !== null) return null
  const { data, error } = await createAdminClient()
    .from('space_loyalty_programs')
    .upsert(
      {
        space_id: spaceId,
        status: input.status,
        stamps_required: input.stampsRequired,
        welcome_stamps: input.welcomeStamps,
        reward_title: input.rewardTitle,
        reward_value_cents: input.rewardValueCents,
        reward_note: input.rewardNote,
        geofence: input.geofence,
        updated_by: gate.callerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'space_id' },
    )
    .select(PROGRAM_COLS)
    .maybeSingle()
  if (error || !data) return null
  return toProgram(data as ProgramRow)
}

/** Mark a reward handed out at the counter, by its code at THIS Space. Idempotent: a second hand-out of
 *  the same code reads as already done. Returns 'done' | 'already' | 'unknown' | null (gate miss). */
export async function writeRewardHandedOut(
  spaceId: string,
  code: string,
): Promise<'done' | 'already' | 'unknown' | null> {
  const gate = await loyaltyOwnerGate(spaceId)
  if (!gate) return null
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length !== 6) return 'unknown'
  const db = createAdminClient()
  const { data: row } = await db
    .from('loyalty_rewards')
    .select('id, redeemed_at')
    .eq('space_id', spaceId)
    .eq('code', clean)
    .maybeSingle()
  if (!row) return 'unknown'
  if ((row as { redeemed_at: string | null }).redeemed_at) return 'already'
  const { error } = await db
    .from('loyalty_rewards')
    .update({ redeemed_at: new Date().toISOString(), redeemed_by: gate.callerId })
    .eq('id', (row as { id: string }).id)
    .is('redeemed_at', null)
  return error ? null : 'done'
}

/** Set or clear the check-in node's geofence from the Space's exact coordinate (200 m), so the capture
 *  path's existing proximity check does the work. Called by the save action after a program write. */
export async function syncCheckinGeofence(space: Space, geofence: boolean): Promise<void> {
  try {
    const db = createAdminClient()
    const { data: node } = await db
      .from('nodes')
      .select('id')
      .eq('space_id', space.id)
      .eq('kind', 'checkin')
      .maybeSingle()
    if (!node) return
    const lat = typeof space.latitude === 'number' ? space.latitude : Number(space.latitude)
    const lng = typeof space.longitude === 'number' ? space.longitude : Number(space.longitude)
    const placed = geofence && Number.isFinite(lat) && Number.isFinite(lng)
    await db
      .from('nodes')
      .update({
        location: placed ? `SRID=4326;POINT(${lng} ${lat})` : null,
        proximity_m: placed ? 200 : null,
      })
      .eq('id', (node as { id: string }).id)
  } catch {
    /* best-effort: the program saved; the fence is re-synced on the next save */
  }
}
