import { branchBlockers, choicePaths, withFallbackAliases } from './branches'
import { chapterScopes, countRuleBlockers, missionBucket, playableKeys } from './count-rules'
import { allGroupsSatisfied, blocker, distinctMembers, edgeCount, parseInstant } from './rules'
import { MAX_EDGES, MAX_MISSIONS } from './types'
import type { Blocker, HuntGraph, Mission, RuleGroup, ValidationResult } from './types'

function finalize(blockers: Blocker[]): ValidationResult {
  blockers.sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    const ak = a.mission_keys.join(',')
    const bk = b.mission_keys.join(',')
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })
  return { ok: blockers.length === 0, blockers }
}

function wellFormedGroup(g: unknown): g is RuleGroup {
  if (!g || typeof g !== 'object') return false
  const r = g as RuleGroup
  return (
    (r.logic === 'all' || r.logic === 'any' || r.logic === 'count') &&
    Array.isArray(r.members) &&
    r.members.every((k) => typeof k === 'string')
  )
}

function shapeProblem(graph: unknown): string | null {
  const g = graph as HuntGraph | null
  if (!g || typeof g !== 'object' || !Array.isArray(g.missions)) return 'The graph needs a missions list.'
  if (!g.finish || typeof g.finish !== 'object' || !Array.isArray(g.finish.rule_groups)) {
    return 'The graph needs a finish rule with rule_groups.'
  }
  for (const m of g.missions) {
    if (!m || typeof m !== 'object' || typeof m.mission_key !== 'string' || !m.mission_key) {
      return 'Every mission needs a mission_key.'
    }
    if (!Array.isArray(m.rule_groups)) return `Mission "${m.mission_key}" needs a rule_groups list (it can be empty).`
    if (!m.rule_groups.every(wellFormedGroup)) {
      return `Mission "${m.mission_key}" has a rule group that is not all, any or count with a members list.`
    }
    if (m.placements !== undefined && m.placements !== null) {
      const ok = Array.isArray(m.placements) && m.placements.every((p) => p && typeof p === 'object' && typeof p.placement_key === 'string' && p.placement_key !== '')
      if (!ok) return `Mission "${m.mission_key}" has a placement without a placement_key.`
    }
  }
  if (g.chapters !== undefined && g.chapters !== null) {
    const ok =
      Array.isArray(g.chapters) &&
      g.chapters.every(
        (c) =>
          c && typeof c === 'object' && typeof c.chapter_key === 'string' && c.chapter_key !== '' &&
          typeof c.enabled === 'boolean' && Array.isArray(c.members) && c.members.every((k) => typeof k === 'string'),
      )
    if (!ok) return 'Every chapter needs a chapter_key, an enabled flag and a members list.'
  }
  if (!g.finish.rule_groups.every(wellFormedGroup)) {
    return 'The finish rule has a group that is not all, any or count with a members list.'
  }
  return null
}

/** Strongly connected components with more than one node, or a self-loop. Bounded by MAX_MISSIONS. */
function findCycles(missions: Mission[]): string[][] {
  const keys = new Set(missions.map((m) => m.mission_key))
  const adj = new Map<string, string[]>()
  for (const m of missions) {
    const out = new Set<string>()
    for (const g of m.rule_groups) for (const k of g.members) if (keys.has(k)) out.add(k)
    adj.set(m.mission_key, [...out].sort())
  }
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const on = new Set<string>()
  const cycles: string[][] = []
  const visit = (v: string): void => {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    on.add(v)
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (on.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        on.delete(w)
        comp.push(w)
      } while (w !== v)
      if (comp.length > 1 || (adj.get(v) ?? []).includes(v)) cycles.push(comp.sort())
    }
  }
  for (const k of [...keys].sort()) if (!idx.has(k)) visit(k)
  return cycles.sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

/**
 * Fixed point of "which missions can ever be credited", assuming every creditable
 * mission is credited under its bucket. With `timed`, a prerequisite whose
 * window opens at or after the dependent mission closes cannot help that mission.
 * With `freeOnly`, missions behind a paid entitlement are skipped. Only missions in
 * `scope` can be credited (count-rules.ts: an open placement, an enabled chapter).
 */
function reach(
  missions: Mission[],
  opts: { timed: boolean; freeOnly: boolean; scope: ReadonlySet<string> },
  validWindow: Set<string>,
): Map<string, string> {
  const byKey = new Map(missions.map((m) => [m.mission_key, m]))
  const creditable = new Map<string, string>()
  const closeOf = (m: Mission) => (m.close ? parseInstant(m.close) : Infinity)
  const openOf = (m: Mission) => (m.open ? parseInstant(m.open) : -Infinity)
  let changed = true
  while (changed) {
    changed = false
    for (const m of missions) {
      if (creditable.has(m.mission_key)) continue
      if (!validWindow.has(m.mission_key) || !opts.scope.has(m.mission_key)) continue
      if (opts.freeOnly && m.requires_entitlement) continue
      const seen = new Map<string, string>()
      for (const [k, b] of creditable) {
        if (opts.timed && openOf(byKey.get(k)!) >= closeOf(m)) continue
        seen.set(k, b)
      }
      // One credit in a fallback group stands for every member (branches.ts).
      if (allGroupsSatisfied(m.rule_groups, withFallbackAliases(missions, seen))) {
        creditable.set(m.mission_key, missionBucket(m))
        changed = true
      }
    }
  }
  return creditable
}

/**
 * Publish-time checks on a Hunt graph. Never throws: a graph that cannot be
 * analysed comes back as blockers the creator can act on.
 *
 * Window overlap is read as feasibility: a mission whose prerequisites only open
 * at or after it closes can never be reached (WINDOW_UNREACHABLE).
 *
 * Count rules (FH-030): thresholds count distinct buckets among missions that can
 * still be played, so a closed venue or a disabled chapter can make a threshold
 * impossible; and every enabled chapter must hold a route to the finish, and one
 * that needs no purchase (CHAPTER_INFEASIBLE, CHAPTER_NO_FREE_FINISH).
 *
 * Exclusive branches (FH-042): reachability is worked out once per choice path
 * (branches.ts `choicePaths`, bounded). Whatever a player has committed to, some
 * path must still finish (BRANCH_DEAD_END), and the finish must hold with every
 * answer mission out of play, because a Mystery can run out of attempts
 * (MYSTERY_NO_FALLBACK).
 */
export function validateGraph(graph: HuntGraph): ValidationResult {
  try {
    return validateInner(graph)
  } catch {
    return finalize([
      blocker('MALFORMED_GRAPH', 'The graph could not be read. Check that every mission and rule group is filled in.'),
    ])
  }
}

function validateInner(graph: HuntGraph): ValidationResult {
  const problem = shapeProblem(graph)
  if (problem) return finalize([blocker('MALFORMED_GRAPH', problem)])

  const { missions } = graph
  const blockers: Blocker[] = []

  // Size limits first: they bound the cost of everything below.
  const edges = edgeCount(graph)
  if (missions.length > MAX_MISSIONS) {
    blockers.push(
      blocker(
        'MISSION_LIMIT',
        `A Hunt can have at most ${MAX_MISSIONS} missions; this one has ${missions.length}. Remove ${missions.length - MAX_MISSIONS} or split it into two Hunts.`,
      ),
    )
  }
  if (edges > MAX_EDGES) {
    blockers.push(
      blocker('EDGE_LIMIT', `A Hunt can have at most ${MAX_EDGES} prerequisite links; this one has ${edges}. Simplify the unlock rules.`),
    )
  }
  if (blockers.length > 0) return finalize(blockers)

  const counts = new Map<string, number>()
  for (const m of missions) counts.set(m.mission_key, (counts.get(m.mission_key) ?? 0) + 1)
  for (const [k, n] of counts) {
    if (n > 1) blockers.push(blocker('DUPLICATE_MISSION', `Mission key "${k}" is used ${n} times. Give each mission its own key.`, [k]))
  }
  const keys = new Set(counts.keys())
  const byKey = new Map(missions.map((m) => [m.mission_key, m]))
  const playable = playableKeys(graph)

  const checkGroup = (g: RuleGroup, where: string, owner: string[]): void => {
    const members = distinctMembers(g)
    const missing = members.filter((k) => !keys.has(k))
    if (missing.length) {
      blockers.push(
        blocker(
          'MISSING_REF',
          `${where} points at ${missing.map((k) => `"${k}"`).join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not in this Hunt. Add the mission or remove the link.`,
          [...owner, ...missing],
        ),
      )
    }
    if (members.length === 0) {
      blockers.push(blocker('GROUP_EMPTY', `${where} has a rule group with no missions in it. Add one or remove the group.`, owner))
      return
    }
    if (g.logic !== 'count') return
    const min = g.min_count
    if (typeof min !== 'number' || !Number.isInteger(min) || min < 1) {
      blockers.push(blocker('COUNT_INVALID', `${where} uses "count" but min_count is not a whole number of at least 1.`, owner))
      return
    }
    const real = members.filter((k) => keys.has(k))
    const distinct = new Set(real.filter((k) => playable.has(k)).map((k) => missionBucket(byKey.get(k)!)))
    if (min > distinct.size) {
      blockers.push(
        blocker(
          'COUNT_IMPOSSIBLE',
          `${where} needs ${min} distinct ones but only ${distinct.size} can ever count (missions that share a bucket count once, and a closed venue or a disabled chapter counts for nothing). Lower the number or add more distinct missions.`,
          [...owner, ...real],
        ),
      )
    }
  }
  for (const m of missions) for (const g of m.rule_groups) checkGroup(g, `Mission "${m.mission_key}"`, [m.mission_key])
  for (const g of graph.finish.rule_groups) checkGroup(g, 'The finish rule', [])
  if (graph.finish.rule_groups.length === 0) {
    blockers.push(blocker('FINISH_EMPTY', 'The finish rule is empty, so nobody could ever complete this Hunt. Say which mission or credits finish it.'))
  }

  blockers.push(...countRuleBlockers(graph))
  blockers.push(...branchBlockers(missions))

  // Windows.
  const validWindow = new Set<string>()
  for (const m of missions) {
    const open = m.open ? parseInstant(m.open) : -Infinity
    const close = m.close ? parseInstant(m.close) : Infinity
    if (Number.isNaN(open) || Number.isNaN(close)) {
      blockers.push(
        blocker('WINDOW_INVALID', `Mission "${m.mission_key}" has an open or close time that is not a UTC time like 2026-12-01T08:00:00Z.`, [m.mission_key]),
      )
    } else if (open >= close) {
      blockers.push(
        blocker('WINDOW_EMPTY', `Mission "${m.mission_key}" closes at or before it opens. Windows run from open up to, not including, close.`, [m.mission_key]),
      )
    } else {
      validWindow.add(m.mission_key)
    }
  }

  // Cycles.
  const cyclic = new Set<string>()
  for (const cyc of findCycles(missions)) {
    cyc.forEach((k) => cyclic.add(k))
    blockers.push(
      blocker('CYCLE', `Missions ${cyc.map((k) => `"${k}"`).join(', ')} wait on each other, so none can ever unlock. Break the loop by removing one prerequisite.`, cyc),
    )
  }

  // Reachability. Skipped when the structure is already broken: those blockers
  // say what to fix and reachability would only add noise.
  const structurallyBroken = blockers.some((b) =>
    ['GROUP_EMPTY', 'COUNT_INVALID', 'MISSING_REF', 'DUPLICATE_MISSION', 'FINISH_EMPTY', 'CHAPTER_INVALID', 'BRANCH_INVALID', 'CHOICE_LIMIT'].includes(b.code),
  )
  const paths = structurallyBroken ? null : choicePaths(missions)
  if (paths) {
    const finishes = (credited: ReadonlyMap<string, string>) => allGroupsSatisfied(graph.finish.rule_groups, withFallbackAliases(missions, credited))
    /** Reachability of one scope, once per choice path. */
    const analyse = (scope: ReadonlySet<string>) => {
      const runs = paths.map((path) => {
        const inPath = new Set([...scope].filter((k) => !path.excluded.has(k)))
        const timed = reach(missions, { timed: true, freeOnly: false, scope: inPath }, validWindow)
        const free = reach(missions, { timed: true, freeOnly: true, scope: inPath }, validWindow)
        return { path, inPath, timed, finishes: finishes(timed), free: finishes(free) }
      })
      // A player holds the picks of a path that they could actually reach. From there some path that
      // keeps those picks must finish; if none does, those picks are a dead end.
      const deadEnds = new Map<string, string[]>()
      for (const run of runs) {
        const held = [...run.path.picks].filter(([, pick]) => run.timed.has(pick))
        const ok = runs.some((other) => other.finishes && held.every(([group, pick]) => other.path.picks.get(group) === pick))
        if (!ok) deadEnds.set(held.map(([, pick]) => pick).sort().join(','), held.map(([, pick]) => pick).sort())
      }
      return { runs, canFinish: runs.some((r) => r.finishes), canFinishFree: runs.some((r) => r.free), deadEnds: [...deadEnds.values()] }
    }

    const whole = analyse(playable)
    const timed = new Set(whole.runs.flatMap((r) => [...r.timed.keys()]))
    const untimed = new Set(whole.runs.flatMap((r) => [...reach(missions, { timed: false, freeOnly: false, scope: r.inPath }, validWindow).keys()]))

    for (const m of missions) {
      if (untimed.has(m.mission_key) && !timed.has(m.mission_key)) {
        blockers.push(
          blocker(
            'WINDOW_UNREACHABLE',
            `Mission "${m.mission_key}" closes before the missions it depends on open, so nobody can reach it. Move its close later or its prerequisites' open earlier.`,
            [m.mission_key],
          ),
        )
      }
    }
    if (!whole.canFinish) {
      const stuck = missions.map((m) => m.mission_key).filter((k) => !timed.has(k) && !cyclic.has(k))
      blockers.push(
        blocker(
          'FINISH_UNREACHABLE',
          'No route reaches the finish. Check the finish rule, and any missions that can never unlock or whose windows cannot be met.',
          stuck,
        ),
      )
    } else {
      for (const picks of whole.deadEnds) {
        blockers.push(
          blocker(
            'BRANCH_DEAD_END',
            `A player who chooses ${picks.map((k) => `"${k}"`).join(' and ')} can never finish. Every choice has to lead to the finish: add a route from it or remove the choice.`,
            picks,
          ),
        )
      }
      if (!whole.canFinishFree) {
        const paid = missions.filter((m) => m.requires_entitlement).map((m) => m.mission_key)
        blockers.push(
          blocker('NO_FREE_PATH', 'The finish can only be reached through a paid mission. A free route to the finish has to exist.', paid),
        )
      }
      // A Mystery answer has a bounded number of attempts, so it can be lost for good. With every
      // answer mission out of play, each choice must still finish (through its fallback).
      const answers = missions.filter((m) => m.kind === 'answer').map((m) => m.mission_key)
      if (answers.length > 0 && whole.deadEnds.length === 0) {
        const without = analyse(new Set([...playable].filter((k) => !answers.includes(k))))
        if (!without.canFinish || without.deadEnds.length > 0) {
          blockers.push(
            blocker(
              'MYSTERY_NO_FALLBACK',
              'A player who runs out of attempts on a Mystery answer would be stuck. Give each answer mission a fallback mission in the same fallback group, or keep it off the route to the finish.',
              answers,
            ),
          )
        }
      }
    }

    // Every enabled chapter: a player who stays inside it can finish, and can finish free.
    for (const scope of chapterScopes(graph)) {
      const inChapter = analyse(scope.keys)
      if (!inChapter.canFinish) {
        blockers.push(
          blocker(
            'CHAPTER_INFEASIBLE',
            `Chapter "${scope.chapter_key}" has no route to the finish on its own. Add missions or venues to it, lower the threshold, or switch the chapter off.`,
            scope.members,
          ),
        )
      } else if (!inChapter.canFinishFree) {
        blockers.push(
          blocker(
            'CHAPTER_NO_FREE_FINISH',
            `Chapter "${scope.chapter_key}" can only be finished through a paid mission. Each chapter needs a finish that costs nothing.`,
            scope.members,
          ),
        )
      }
    }
  }

  return finalize(blockers)
}
