/**
 * Hunt version graph types (FH-007).
 *
 * Field names follow the Frequency Hunts plan (03-engine.md, "Graph semantics").
 * This module is pure: no database, no Next, no network. It runs the same in a
 * creator preview and in the authoritative claim path.
 *
 * Windows are half-open [open, close) UTC instants written as ISO strings with a
 * trailing Z. The organizer's IANA timezone is converted at publish, never here.
 *
 * Count rules (FH-030, count-rules.ts): a mission's bucket is the venue its placements
 * sit in, every placement bound to a mission is equivalent (one credit whichever is
 * scanned), and `chapters` group missions into regional chapters that can be switched off.
 *
 * Exclusive branches (FH-042, branches.ts): missions sharing a `choice_group` are an
 * exclusive choice, and missions sharing a `fallback_group` are one objective by
 * different means. A mission of kind `answer` is a Mystery: its answer is checked on
 * the server (lib/hunts/mystery.ts) and is never part of this graph.
 */

export const MAX_MISSIONS = 30
export const MAX_EDGES = 100

export type RuleLogic = 'all' | 'any' | 'count'

export interface RuleGroup {
  group_key?: string
  logic: RuleLogic
  /** Required for `count`. Counts distinct credit buckets, not missions. */
  min_count?: number
  /** Mission keys this group reads credits from. */
  members: string[]
}

/** One place a mission can be proven. Every placement of a mission is equivalent: any one credits it, once. */
export interface MissionPlacement {
  placement_key: string
  /** The venue (a Space key) the placement sits in. */
  venue?: string | null
  /** Live state, never version content: the venue is shut or the placement was pulled. */
  closed?: boolean
}

/** A regional chapter: a named cluster of missions. A mission in no chapter is shared by all of them. */
export interface Chapter {
  chapter_key: string
  /** A disabled chapter takes no new credit. Credits already earned in it still count. */
  enabled: boolean
  members: string[]
}

export interface Mission {
  mission_key: string
  kind?: string
  /** Inclusive start of the window, UTC ISO instant. Null/absent means no lower bound. */
  open?: string | null
  /** Exclusive end of the window, UTC ISO instant. Null/absent means no upper bound. */
  close?: string | null
  /**
   * Default credit bucket (for example a Space key). Two missions sharing a bucket
   * count once toward ANY and N-of-M. Defaults to the venue of its placements, then
   * to the mission key (count-rules.ts `missionBucket`).
   */
  bucket?: string | null
  /** Equivalent placements. Absent means the mission is not tied to a venue. */
  placements?: MissionPlacement[]
  /** True when the mission needs a paid entitlement. The free finish may not depend on one. */
  requires_entitlement?: boolean
  /** Exclusive choice: the first member credited is the run's choice and the others close. */
  choice_group?: string | null
  /** Alternative path: one credit satisfies every member and the others close. */
  fallback_group?: string | null
  /** Prerequisites. Several groups on one mission combine with AND. */
  rule_groups: RuleGroup[]
}

export interface FinishRule {
  /** Combined with AND. */
  rule_groups: RuleGroup[]
}

export interface HuntGraph {
  missions: Mission[]
  finish: FinishRule
  /** Regional chapters. Absent means one undivided Hunt. */
  chapters?: Chapter[]
}

/** One earned credit. A mission yields at most one bucket per run. */
export interface Credit {
  mission_key: string
  /** Overrides the mission's default bucket (for example the Space an alternate placement belongs to). */
  bucket?: string | null
  /** When the credit was accepted (an ISO instant). Orders two credits inside one exclusive group. */
  at?: string | null
}

export type BlockerCode =
  | 'MALFORMED_GRAPH'
  | 'MISSION_LIMIT'
  | 'EDGE_LIMIT'
  | 'DUPLICATE_MISSION'
  | 'MISSING_REF'
  | 'CYCLE'
  | 'GROUP_EMPTY'
  | 'COUNT_INVALID'
  | 'COUNT_IMPOSSIBLE'
  | 'WINDOW_INVALID'
  | 'WINDOW_EMPTY'
  | 'WINDOW_UNREACHABLE'
  | 'FINISH_EMPTY'
  | 'FINISH_UNREACHABLE'
  | 'NO_FREE_PATH'
  | 'VENUE_COUNTS_TWICE'
  | 'CHAPTER_INVALID'
  | 'CHAPTER_INFEASIBLE'
  | 'CHAPTER_NO_FREE_FINISH'
  | 'BRANCH_INVALID'
  | 'CHOICE_LIMIT'
  | 'BRANCH_DEAD_END'
  | 'MYSTERY_NO_FALLBACK'

export interface Blocker {
  code: BlockerCode
  /** Plain-English, says what to change. */
  message: string
  mission_keys: string[]
}

export interface ValidationResult {
  ok: boolean
  blockers: Blocker[]
}

export type MissionState = 'credited' | 'locked' | 'scheduled' | 'closed' | 'eligible'

export interface Evaluation {
  /** Unlocked, window open, not yet credited. Sorted. */
  eligible: string[]
  /** Prerequisites satisfied (any window state, credited or not). Sorted. */
  unlocked: string[]
  /** Missions with a counted credit. Sorted. */
  credited: string[]
  /** State per mission key. Keys only: no titles, answers or locations ever appear here. */
  status: Record<string, MissionState>
  finished: boolean
}
