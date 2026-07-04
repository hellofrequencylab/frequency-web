// Rail intelligence (ADR-516 Phase E) — PURE, client-safe scoring + ordering over signals the rail
// ALREADY holds. No IO, no new instrumentation: the caller passes the existing signals (a label match, an
// on-page section, a completeness gap, the page archetype) and these helpers rank + order fail-safely.
// Every helper falls back to today's order when a signal is absent, so a missing signal never reorders.
//
// Unit-tested in rail-intel.test.ts; wired into the admin bar body (components/layout/admin-bar/
// admin-bar-body.tsx) for the sticky-search ranking, the completeness-based section ordering, and the
// contextual scroll-on-open.

import type { RailArchetype } from '@/lib/layout/page-chrome'

/** The signals available for scoring one search result, all derived from data the rail already holds. */
export interface ResultSignals {
  /** The result's section is currently MOUNTED on this page (an on-page scope match). */
  onPage?: boolean
  /** The result's area is INCOMPLETE (a completeness gap maps to its slot). */
  incomplete?: boolean
}

// The score weights, tiered so a label match always outranks a context boost: an exact label beats a
// prefix beats an on-page section beats an incomplete area beats the base. The context boosts are smaller
// than a prefix match, so "what you typed" always wins over "where you are".
const SCORE_EXACT = 1000
const SCORE_PREFIX = 500
const SCORE_ONPAGE = 100
const SCORE_INCOMPLETE = 50

/**
 * Score one search result (ADR-516 Phase E): exact/prefix label match > current-page scope > incomplete
 * area > base. PURE. A blank query scores only the context boosts; no signal at all scores 0 (the
 * fail-safe base, so an unscored result keeps its input order via {@link rankResults}).
 */
export function scoreResult(query: string, label: string, signals: ResultSignals = {}): number {
  const q = query.trim().toLowerCase()
  const l = label.trim().toLowerCase()
  let score = 0
  if (q) {
    if (l === q) score += SCORE_EXACT
    else if (l.startsWith(q)) score += SCORE_PREFIX
  }
  if (signals.onPage) score += SCORE_ONPAGE
  if (signals.incomplete) score += SCORE_INCOMPLETE
  return score
}

/**
 * Stable-rank items by `score` DESC, preserving the INPUT order for ties — so today's order is the
 * tiebreak and an all-zero set is returned unchanged (fail-safe). PURE.
 */
export function rankResults<T>(items: readonly T[], score: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ item }) => item)
}

/**
 * Reorder sections so INCOMPLETE ones float to the top, keeping the existing band/tier order as the
 * stable tiebreak (ADR-516 Phase E relevance ranking). Fail-safe: with nothing incomplete the order is
 * returned unchanged. PURE.
 */
export function orderByRelevance<T>(sections: readonly T[], isIncomplete: (section: T) => boolean): T[] {
  return sections
    .map((section, i) => ({ section, i, rank: isIncomplete(section) ? 0 : 1 }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ section }) => section)
}

/**
 * The spine slot to LAND on when the rail opens on a page, by archetype (ADR-516 Phase E contextual
 * entry): the profile `builder` lands on Layout; every other archetype lands at the top (null = no
 * scroll). PURE + fail-safe — an unknown archetype lands at the top.
 */
export function contextualEntrySlot(archetype: RailArchetype): string | null {
  return archetype === 'builder' ? 'layout' : null
}
