import { settleBranches, type RawCredit } from './branches'
import { missionBucket, playableKeys } from './count-rules'
import { allGroupsSatisfied, parseInstant } from './rules'
import type { Credit, Evaluation, HuntGraph, MissionState } from './types'

export type Instant = Date | number | string

function toMs(now: Instant): number {
  if (now instanceof Date) return now.getTime()
  if (typeof now === 'number') return now
  return parseInstant(now)
}

/**
 * Evaluate a run against a graph. Pure and deterministic: the same graph, credits
 * and `now` give the same output whatever order the credits or missions arrive in.
 *
 * Rules:
 * - Credits for unknown missions are ignored. A mission yields at most one bucket:
 *   when several credits name one mission, the lowest bucket string wins.
 * - Earned credits are kept when a window later closes. Windows only gate whether a
 *   mission can still be claimed (`eligible`), never whether an earned credit counts.
 * - Unlock = every prerequisite group passes. Eligible = unlocked, window open
 *   ([open, close) against `now`), and not yet credited.
 * - A credit counts under the mission's fixed bucket (count-rules.ts), so a second
 *   placement or a substitute venue never adds a second count.
 * - A mission whose placements are all closed, or whose chapter is disabled, reads
 *   `closed`: it takes no new credit, and a credit already earned still counts.
 * - Exclusive branches (branches.ts): one credit counts per choice group and per
 *   fallback group, the earliest accepted. The other members read `closed`, and a
 *   later credit for one of them is ignored, so a choice cannot be changed.
 * - An unparseable `now` leaves every windowed mission closed (fail shut).
 * - Output is keys and states only. Titles, answers and locations are not part of
 *   the graph, so nothing locked can leak from here.
 */
export function evaluate(graph: HuntGraph, credits: readonly Credit[], now: Instant): Evaluation {
  const nowMs = toMs(now)
  const missions = [...graph.missions].sort((a, b) => (a.mission_key < b.mission_key ? -1 : a.mission_key > b.mission_key ? 1 : 0))
  const byKey = new Map(missions.map((m) => [m.mission_key, m]))

  const raw = new Map<string, RawCredit>()
  for (const c of credits) {
    const m = byKey.get(c.mission_key)
    if (!m) continue
    const b = c.bucket ? c.bucket : missionBucket(m)
    const at = typeof c.at === 'string' ? Date.parse(c.at) : NaN
    const prev = raw.get(m.mission_key)
    if (prev === undefined) raw.set(m.mission_key, { bucket: b, at })
    else raw.set(m.mission_key, { bucket: b < prev.bucket ? b : prev.bucket, at: Number.isNaN(prev.at) || at < prev.at ? at : prev.at })
  }
  const { counted, view: buckets, closedKeys } = settleBranches(missions, raw)

  const playable = playableKeys(graph)
  const status: Record<string, MissionState> = {}
  const eligible: string[] = []
  const unlocked: string[] = []
  const credited: string[] = []

  for (const m of missions) {
    const isUnlocked = allGroupsSatisfied(m.rule_groups, buckets)
    if (isUnlocked) unlocked.push(m.mission_key)
    if (counted.has(m.mission_key)) {
      credited.push(m.mission_key)
      status[m.mission_key] = 'credited'
      continue
    }
    if (closedKeys.has(m.mission_key)) {
      status[m.mission_key] = 'closed'
      continue
    }
    if (!isUnlocked) {
      status[m.mission_key] = 'locked'
      continue
    }
    if (!playable.has(m.mission_key)) {
      status[m.mission_key] = 'closed'
      continue
    }
    const open = m.open ? parseInstant(m.open) : -Infinity
    const close = m.close ? parseInstant(m.close) : Infinity
    if (Number.isNaN(open) || Number.isNaN(close) || (Number.isNaN(nowMs) && (m.open || m.close))) {
      status[m.mission_key] = 'closed'
    } else if (nowMs < open) {
      status[m.mission_key] = 'scheduled'
    } else if (nowMs >= close) {
      status[m.mission_key] = 'closed'
    } else {
      status[m.mission_key] = 'eligible'
      eligible.push(m.mission_key)
    }
  }

  const finished = graph.finish.rule_groups.length > 0 && allGroupsSatisfied(graph.finish.rule_groups, buckets)
  return { eligible, unlocked, credited, status, finished }
}
