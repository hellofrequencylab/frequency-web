// Which comparison operators a field TYPE meaningfully supports, and how each reads for
// that type — the constraint that keeps the Segment Builder forgiving (ADR-630). Pure +
// unit-tested; imported by the client composer and by a test (no React, no server deps).
//
// The trait registry types split into two families:
//   • ordered / relational (number, timestamp) — the full comparison set makes sense
//     ("resonance_health at least 60", "activation_date after 2026-01-01"). Timestamps are
//     stored as ISO strings, whose lexicographic order IS chronological, so gt/lt hold.
//   • categorical (boolean, enum, string) — only equality reads sensibly ("is / is not").
//     Offering "greater than" on a lifecycle_stage or a boolean is a trap, so we hide it.

import type { TraitOp } from '@/lib/traits/segments'

export type FieldType = 'boolean' | 'number' | 'string' | 'enum' | 'timestamp'

const RELATIONAL: readonly TraitOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']
const CATEGORICAL: readonly TraitOp[] = ['eq', 'neq']

/** The operators a field of this type may be compared with. Ordered types (number,
 *  timestamp) get the full set; categorical types (boolean, enum, string) get equality
 *  only. An unknown/absent type falls back to the full set (harmless — the op control is
 *  only shown once a field is chosen). */
export function allowedOpsForType(type: FieldType | undefined): readonly TraitOp[] {
  switch (type) {
    case 'boolean':
    case 'enum':
    case 'string':
      return CATEGORICAL
    default:
      return RELATIONAL
  }
}

// Default (relational / number) labels, plus a timestamp override so a date reads in
// plain time words instead of "greater than". Categorical types only ever use eq/neq.
const DEFAULT_LABELS: Record<TraitOp, string> = {
  eq: 'is', neq: 'is not', gt: 'greater than', gte: 'at least', lt: 'less than', lte: 'at most',
}
const TIMESTAMP_LABELS: Record<TraitOp, string> = {
  eq: 'is', neq: 'is not', gt: 'after', gte: 'on or after', lt: 'before', lte: 'on or before',
}

/** How an operator reads for a given field type (e.g. `gt` is "after" for a date). */
export function opLabel(op: TraitOp, type: FieldType | undefined): string {
  return (type === 'timestamp' ? TIMESTAMP_LABELS : DEFAULT_LABELS)[op]
}

/** Clamp an operator to one the field type allows — used when the field changes so a row
 *  can't keep a stale `gt` from a previous numeric field after switching to a boolean. */
export function clampOp(op: TraitOp, type: FieldType | undefined): TraitOp {
  const allowed = allowedOpsForType(type)
  return allowed.includes(op) ? op : allowed[0]
}
