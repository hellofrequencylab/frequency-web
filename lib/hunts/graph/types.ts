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
 * TODO(FH-042): exclusive branches. `choice_group` and `fallback_group` are carried
 * on the type so graphs round-trip, but neither the validator nor the evaluator
 * gives them meaning yet.
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

export interface Mission {
  mission_key: string
  kind?: string
  /** Inclusive start of the window, UTC ISO instant. Null/absent means no lower bound. */
  open?: string | null
  /** Exclusive end of the window, UTC ISO instant. Null/absent means no upper bound. */
  close?: string | null
  /**
   * Default credit bucket (for example a Space key). Two missions sharing a bucket
   * count once toward ANY and N-of-M. Defaults to the mission key.
   */
  bucket?: string | null
  /** True when the mission needs a paid entitlement. The free finish may not depend on one. */
  requires_entitlement?: boolean
  choice_group?: string | null
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
}

/** One earned credit. A mission yields at most one bucket per run. */
export interface Credit {
  mission_key: string
  /** Overrides the mission's default bucket (for example the Space an alternate placement belongs to). */
  bucket?: string | null
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
