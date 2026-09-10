// ─────────────────────────────────────────────────────────────────────────────
// THE RAIL'S FIELD TRANSPORT (ADR-1306).
//
// A rail form holds ONE bag of values, `Record<string, string>` keyed by manifest path, because a
// FormData is strings and the autosave form reads its own snapshot back. Most field kinds are a
// string already. Four are NOT: `tags`, `multiselect`, `images` and `daterange` are lists, and the
// kit's controls for them take and return arrays.
//
// 🔴 THE ROUND TRIP WAS BROKEN, IN PRODUCTION, ON THE JOURNEY RAIL. `RailManifestFields` joined a
// control's array with ', ' on the way out and handed the joined STRING back in on the way down.
// The kit's `asList` reads a string as a one-item list, so three tags saved as "breath, sound, rest"
// came back as a single chip literally spelled `breath, sound, rest`, and the next save persisted
// that one tag. Nothing failed; the list simply collapsed a little more each time it was edited.
//
// So the split is stated ONCE, here, where it can be tested without mounting React, and both
// directions are the same function's inverse.
//
// PURE: no React, no DOM. The separator is ', ' because that is what the tag control commits on —
// a comma ENDS a chip there, so a value can never contain one and the join is lossless.
// ─────────────────────────────────────────────────────────────────────────────

import type { FieldKind } from '@/lib/studio/kernel/manifest'

/** The kinds whose control value is a LIST. Everything else round-trips as one string. */
export const LIST_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(['tags', 'multiselect', 'images', 'daterange'])

/** What a joined list is joined with. */
export const LIST_SEPARATOR = ', '

/** Whether this kind's control takes and returns an array. */
export function isListKind(kind: FieldKind): boolean {
  return LIST_KINDS.has(kind)
}

/**
 * The stored string as the CONTROL wants it: a list for a list kind, the string itself otherwise.
 * Total: an absent value reads as empty, and an empty list value is `[]` rather than `['']`.
 */
export function splitFieldValue(kind: FieldKind, raw: string | undefined): string | string[] {
  if (!isListKind(kind)) return raw ?? ''
  return (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** The control's value as the ONE string the values bag and the FormData carry. */
export function joinFieldValue(next: string | string[]): string {
  return Array.isArray(next) ? next.filter(Boolean).join(LIST_SEPARATOR) : next
}

/**
 * ONE row of a repeat group, as control strings keyed by the group's RELATIVE field paths. A
 * collection of bare scalars keys its single value at `REPEAT_ITEM_SELF`, which is the empty path.
 * It lives here rather than beside the control because a rail PLAN builds these rows and must stay
 * free of React.
 */
export type RepeatRow = Record<string, string>
