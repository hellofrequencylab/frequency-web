// THE CREW BOOST (LIVE-756, ADR-1709). Each Crew member gives one Boost a calendar month to a Circle
// or a Space they want more people to find. For a week a boosted Circle leads the default Circle index
// order (after featured), and a boosted Space wears a Boosted mark. Owner ruling 2026-10-06 ("Circles
// only"): a Boost never moves a Space in the directory, whose default order stays earned (LIVE-262:
// exposure is earned, never sold).
//
// Three rules, each enforced in one place:
//   1. ONE A MONTH. The crew_boosts unique (giver_profile_id, boost_month) key. A second give in the
//      same month is a duplicate-key refusal, reported as `used`, never a second row.
//   2. CREW ONLY. The REAL effective tier (the billed column union an active Space-membership grant,
//      lib/billing/crew-grants.ts), never the Beta grant: a Boost moves what everyone sees in
//      discovery, so it reads the real tier the way caps do (ADR-1709).
//   3. NOT YOUR OWN. A Host cannot Boost the Circle they host, and an owner or admin cannot Boost
//      their own Space. A Boost is one member vouching for something they do not run.
//
// The Circle lift is a NUDGE on the default order, like an operator feature (LIVE-264), and an explicit
// sort the viewer chose is left alone. A Boost never touches the earned standing score or the Space
// directory order (lib/spaces/standing.ts stays free of anything a member pays for). Server-only.
//
// This module is reachable from lib/spaces/discovery.ts, and through it from app/sitemap.ts (a ROOT
// metadata file), so its static imports stay tiny. The billing reads the give path needs are loaded
// lazily inside giveBoost, never at module scope (AGENTS.md, deploy safety: fan-out).

import { createAdminClient } from '@/lib/supabase/admin'
import { LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'

type BoostTargetKind = 'circle' | 'space'

/** Why a give did not land, for the button to say in words. */
export type BoostRefusal = 'not_crew' | 'used' | 'own' | 'not_found'

/** How long a Boost lasts (the Circle lift and the Space mark), in days. */
const BOOST_LIFT_DAYS = 7

/** The first day (UTC) of the calendar month `at` falls in, as a `date` literal. PURE. */
function boostMonthOf(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-01`
}

type Row = Record<string, unknown>
type Builder = {
  select: (cols: string) => Builder
  insert: (row: Row) => Promise<{ error: { code?: string; message: string } | null }>
  eq: (col: string, val: string) => Builder
  in: (col: string, vals: string[]) => Builder
  gte: (col: string, val: string) => Builder
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>
} & PromiseLike<{ data: Row[] | null; error: unknown }>

/** crew_boosts is newer than the generated types (ADR-246), so it is reached untyped. */
function table(name: string): Builder {
  return (createAdminClient() as unknown as { from: (t: string) => Builder }).from(name)
}

/**
 * Give this month's Boost. Returns `{ given: true }` when the row landed, or the refusal reason.
 * Throws only on an unexpected database error, so the action layer can report it.
 */
export async function giveBoost(
  giverProfileId: string,
  kind: BoostTargetKind,
  targetId: string,
  now: Date = new Date(),
): Promise<{ given: true } | { given: false; reason: BoostRefusal }> {
  const { effectiveTierFor, isSpaceOperator } = await import('@/lib/billing/crew-grants')
  const { data: profile } = await table('profiles').select('membership_tier').eq('id', giverProfileId).maybeSingle()
  const effective = await effectiveTierFor(giverProfileId, (profile?.membership_tier as string | null) ?? null)
  if (effective.tier !== 'crew') return { given: false, reason: 'not_crew' }

  if (kind === 'circle') {
    const { data: circle } = await table('circles').select('id, host_id, status, unlisted').eq('id', targetId).maybeSingle()
    if (!circle || circle.unlisted === true || !(LISTABLE_CIRCLE_STATUS as readonly string[]).includes(String(circle.status))) {
      return { given: false, reason: 'not_found' }
    }
    if (circle.host_id === giverProfileId) return { given: false, reason: 'own' }
  } else {
    const { data: space } = await table('spaces').select('id, status').eq('id', targetId).maybeSingle()
    if (!space || space.status !== 'active') return { given: false, reason: 'not_found' }
    if (await isSpaceOperator(targetId, giverProfileId)) return { given: false, reason: 'own' }
  }

  const { error } = await table('crew_boosts').insert({
    giver_profile_id: giverProfileId,
    target_kind: kind,
    circle_id: kind === 'circle' ? targetId : null,
    space_id: kind === 'space' ? targetId : null,
    boost_month: boostMonthOf(now),
    given_at: now.toISOString(),
  })
  if (error?.code === '23505') return { given: false, reason: 'used' }
  if (error) throw new Error(`giveBoost(${giverProfileId}) failed: ${error.message}`)
  return { given: true }
}

/**
 * Which of these targets carry a Boost given in the last 7 days. One batched read over just the
 * passed ids. FAIL-SAFE to an empty set: a missing table or any error means no Circle is lifted and no
 * Space is marked.
 */
export async function activeBoostIds(
  kind: BoostTargetKind,
  ids: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const column = kind === 'circle' ? 'circle_id' : 'space_id'
  const since = new Date(now.getTime() - BOOST_LIFT_DAYS * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await table('crew_boosts').select(column).in(column, ids).gte('given_at', since)
    if (error || !data) return new Set()
    return new Set(data.map((r) => String(r[column])))
  } catch {
    return new Set()
  }
}
