// PER-TYPE BLOCK LIMITS for the entity-block documents (E0 task 10, docs/EDITOR-E0.md §1.3).
//
// Until this module, "how many of one block may a document hold" had one answer, ONE, and it was
// enforced by six independent `seen` sets (rows-ops `normalize`; layout.ts `parseRows`,
// `sanitizeRows`, `sanitizeEntityLayout`, `mergeEntityLayout`, `resolveRows`). Global uniqueness
// made two Text blocks on one page illegal, which is acceptable for a profile and fatal for a Site.
// The six sets are gone; every one of those sites now asks `typeLimiter()` instead, so the policy
// lives here once and a missed site cannot survive a refactor.
//
// The policy is ported from the sibling system, lib/page-editor/block-limits.ts, for the same reason
// it gives: a DATA block is the single canonical section for its live content, so a second instance
// would double-render the same rows. Authored CONTENT blocks repeat freely. The seven design blocks
// sit between the two, at three, so an operator can run two Zigzags down a page and no more.
//
// PURE + framework-free (no React / Next / Supabase), like every module beside it, so the parse,
// sanitize, merge, resolve and mutation paths and the unit test share one source.
//
// What this does NOT do yet (task 11): a legacy document still keys `content` / `style` by block id,
// so two Text blocks share one authored bag and `hidden` still hides every placement of a type. The
// node tree (`node-tree.ts`) already gives each placement its own bag; the writers move there next.

import { entityBlockById, DESIGN_ENTITY_BLOCK_IDS } from './registry'

/** A DATA block (About, Offerings, Events, ...) appears at most once per document. */
export const DATA_BLOCK_LIMIT = 1
/** A design block (Banner, Editorial, Card grid, Zigzag, Accent beat, Display heading, Text Block)
 *  appears at most three times per document. */
export const DESIGN_BLOCK_LIMIT = 3

const DESIGN_SET: ReadonlySet<string> = new Set(DESIGN_ENTITY_BLOCK_IDS)

/**
 * The per-document cap for a registry block id, or `null` for unlimited. An id outside the registry
 * also reads as `null`: legality of the TYPE is the registry's question (`entityBlockById`), asked
 * by every caller before this one, so this function only ever answers "how many".
 */
export function entityBlockLimit(id: string): number | null {
  if (DESIGN_SET.has(id)) return DESIGN_BLOCK_LIMIT
  const block = entityBlockById(id)
  if (block && block.category === 'data') return DATA_BLOCK_LIMIT
  return null
}

/**
 * A fresh per-document counter. Call `admit(id)` for every placement in document order; it answers
 * whether THIS occurrence is within the type's cap and counts it when it is. Replaces the six `seen`
 * sets one for one: where a site wrote `!seen.has(id)` then `seen.add(id)`, it writes `admit(id)`.
 *
 * Deliberately a closure over a Map, not a class: the six call sites are tight loops that only ever
 * needed one predicate, and a predicate cannot be forgotten half-way (no separate `add` to skip).
 */
export function typeLimiter(): (id: string) => boolean {
  const counts = new Map<string, number>()
  return (id: string) => {
    const limit = entityBlockLimit(id)
    const next = (counts.get(id) ?? 0) + 1
    if (limit !== null && next > limit) return false
    counts.set(id, next)
    return true
  }
}
