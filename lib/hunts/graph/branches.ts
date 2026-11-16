/**
 * Exclusive branches and fallback paths (FH-042). Pure: no database, no Next, no network.
 *
 * `choice_group`: missions that share one are an exclusive choice. The first of them a run is
 * credited for is the run's choice; the others close and never count, so a path that hangs off an
 * unchosen branch stays locked. The choice is read from the credits, earliest first, so a later
 * credit can never change it: if two members of a group both hold a credit (a staff approval that
 * landed after the player chose, say), the earlier one is the choice and the later one is ignored.
 * A choice stands for as long as its credit does: when staff reverse that credit the run has not
 * chosen, which is what keeps a player from being locked out by a claim that was voided.
 *
 * `fallback_group`: missions that share one are the same objective by different means (a Mystery
 * answer and the staffed desk that stands in for it). One credit satisfies every rule that names
 * any member, under one bucket, and the other members close. That is the alternative path: a player
 * who runs out of answer attempts finishes through the fallback, and never counts twice.
 *
 * Publish (validate.ts): every state a player can commit to must still reach the finish
 * (BRANCH_DEAD_END), the number of choice paths is bounded (CHOICE_LIMIT), and the finish must
 * stay reachable with every answer mission out of play (MYSTERY_NO_FALLBACK).
 */
import { missionBucket } from './count-rules'
import { blocker } from './rules'
import type { Blocker, Mission } from './types'

/** Upper bound on the choice paths the validator enumerates (the product of the choice group sizes). */
export const MAX_CHOICE_PATHS = 64

type GroupField = 'choice_group' | 'fallback_group'

/** Group name to its member keys, both sorted. */
function groupsBy(missions: readonly Mission[], field: GroupField): [string, string[]][] {
  const out = new Map<string, string[]>()
  for (const m of missions) {
    const g = m[field]
    if (typeof g !== 'string' || g === '') continue
    out.set(g, [...(out.get(g) ?? []), m.mission_key])
  }
  return [...out].map(([g, keys]): [string, string[]] => [g, [...new Set(keys)].sort()]).sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

/**
 * Add the fallback aliases to a map of credited (or creditable) missions: when one member of a
 * fallback group is in the map, every member reads as credited, all under one bucket. The bucket
 * is the group's own (that of its lowest key), fixed by the version, so the count is the same
 * whichever member a player used and the validator and the evaluator agree.
 */
export function withFallbackAliases(missions: readonly Mission[], buckets: ReadonlyMap<string, string>): Map<string, string> {
  const view = new Map(buckets)
  const byKey = new Map(missions.map((m) => [m.mission_key, m]))
  for (const [, members] of groupsBy(missions, 'fallback_group')) {
    if (!members.some((k) => buckets.has(k))) continue
    const bucket = missionBucket(byKey.get(members[0])!)
    for (const k of members) view.set(k, bucket)
  }
  return view
}

/** A credit as the resolver reads it: the bucket it counts under and when it was accepted (epoch ms, NaN when unknown). */
export type RawCredit = { bucket: string; at: number }

/**
 * Settle exclusive groups. From the raw credits (at most one per mission) keep one per choice group
 * and one per fallback group: the earliest accepted, the lowest key breaking a tie or an unknown time.
 *
 * - `counted`: the credits that count, mission key to bucket.
 * - `view`: `counted` plus fallback aliases. Rule groups are evaluated against this.
 * - `closedKeys`: missions that can take no credit any more (an unchosen branch, a fallback that is
 *   no longer needed, a later credit that lost its group).
 */
export function settleBranches(missions: readonly Mission[], raw: ReadonlyMap<string, RawCredit>) {
  const counted = new Map<string, string>()
  for (const [k, c] of raw) counted.set(k, c.bucket)
  const closedKeys = new Set<string>()
  const order = (k: string) => {
    const at = raw.get(k)?.at
    return typeof at === 'number' && !Number.isNaN(at) ? at : Infinity
  }
  const settle = (field: GroupField): void => {
    for (const [, members] of groupsBy(missions, field)) {
      const held = members.filter((k) => counted.has(k)).sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1))
      if (held.length === 0) continue
      const winner = held[0]
      for (const k of members) {
        if (k === winner) continue
        counted.delete(k)
        closedKeys.add(k)
      }
    }
  }
  settle('choice_group')
  settle('fallback_group')
  return { counted, view: withFallbackAliases(missions, counted), closedKeys }
}

type ChoicePath = {
  /** Choice group to the member this path takes. */
  picks: Map<string, string>
  /** The members this path gives up. */
  excluded: Set<string>
}

/**
 * Every way to take one member from each choice group, in a fixed order. A graph with no choice
 * group has one path that excludes nothing. Null when the product passes MAX_CHOICE_PATHS.
 */
export function choicePaths(missions: readonly Mission[]): ChoicePath[] | null {
  const groups = groupsBy(missions, 'choice_group')
  let total = 1
  for (const [, members] of groups) {
    total *= members.length
    if (total > MAX_CHOICE_PATHS) return null
  }
  let paths: ChoicePath[] = [{ picks: new Map(), excluded: new Set() }]
  for (const [group, members] of groups) {
    paths = paths.flatMap((p) =>
      members.map((pick) => ({
        picks: new Map([...p.picks, [group, pick]]),
        excluded: new Set([...p.excluded, ...members.filter((k) => k !== pick)]),
      })),
    )
  }
  return paths
}

/** Publish-time blockers for how the groups are set up. Expects a well-formed graph. */
export function branchBlockers(missions: readonly Mission[]): Blocker[] {
  const blockers: Blocker[] = []
  for (const m of missions) {
    if (m.choice_group && m.fallback_group) {
      blockers.push(
        blocker('BRANCH_INVALID', `Mission "${m.mission_key}" is in a choice group and a fallback group. Pick one: a choice is one of several paths, a fallback is another way to do the same thing.`, [m.mission_key]),
      )
    }
  }
  for (const field of ['choice_group', 'fallback_group'] as const) {
    for (const [group, members] of groupsBy(missions, field)) {
      if (members.length > 1) continue
      const what = field === 'choice_group' ? 'Choice' : 'Fallback'
      blockers.push(blocker('BRANCH_INVALID', `${what} group "${group}" has one mission, "${members[0]}". Add a second mission to it or clear the group.`, members))
    }
  }
  if (choicePaths(missions) === null) {
    const keys = groupsBy(missions, 'choice_group').flatMap(([, members]) => members)
    blockers.push(
      blocker('CHOICE_LIMIT', `The choices in this Hunt combine into more than ${MAX_CHOICE_PATHS} different paths, too many to check that each one can finish. Use fewer choice groups or fewer options in each.`, keys),
    )
  }
  return blockers
}
