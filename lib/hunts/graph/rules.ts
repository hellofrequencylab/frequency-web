import type { HuntGraph, Mission, RuleGroup } from './types'

/** Strict UTC instant: ISO 8601 with a trailing Z. */
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/

/** Epoch ms for a UTC ISO instant, or NaN when it is not one. */
export function parseInstant(value: string): number {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value)) return NaN
  return Date.parse(value)
}

export function defaultBucket(m: Mission): string {
  return m.bucket ? m.bucket : m.mission_key
}

export function distinctMembers(g: RuleGroup): string[] {
  return [...new Set(g.members)]
}

/**
 * Is a rule group satisfied, given which missions are credited and under which bucket?
 * ALL: every member credited. ANY: at least one. COUNT: at least `min_count`
 * distinct buckets among credited members.
 */
export function groupSatisfied(g: RuleGroup, buckets: ReadonlyMap<string, string>): boolean {
  const members = distinctMembers(g)
  if (g.logic === 'all') return members.length > 0 && members.every((k) => buckets.has(k))
  const seen = new Set<string>()
  for (const k of members) {
    const b = buckets.get(k)
    if (b !== undefined) seen.add(b)
  }
  if (g.logic === 'any') return seen.size >= 1
  return typeof g.min_count === 'number' && g.min_count >= 1 && seen.size >= g.min_count
}

export function allGroupsSatisfied(groups: readonly RuleGroup[], buckets: ReadonlyMap<string, string>): boolean {
  return groups.every((g) => groupSatisfied(g, buckets))
}

/** Mission-to-mission edges (finish excluded). */
export function edgeCount(graph: HuntGraph): number {
  let n = 0
  for (const m of graph.missions) for (const g of m.rule_groups) n += distinctMembers(g).length
  return n
}
