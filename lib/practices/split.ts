// ─────────────────────────────────────────────────────────────────────────────
// THE PILLAR SPLIT, AS WRITTEN (LIVE-641, ADR-1604; the split itself is ADR-438).
//
// A practice has one primary Pillar (`domain_id`) and may name a second
// (`secondary_domain_id`) with the primary's share (`primary_pct`, 50 to 100). The attribution
// ledger (./attribution.ts) has read that pair on every log since ADR-1131; this is the one rule
// that decides what an EDIT may store in it, so every write path (the Studio builder's autosave
// and the Practice rail) lands the same answer.
//
// The rules, each mirroring a database CHECK or a meaning the rest of the code already relies on:
//   1. The secondary is never the primary (`practices_secondary_domain_distinct`), and a practice with no
//      primary has no secondary. Either case stores no secondary.
//   2. With no secondary, `primary_pct` stores the column default. The column is NOT NULL (it was
//      never "null when single-Pillar"), and `normalizePrimaryPct` already reads a lone primary as
//      100% whatever the share says, so the default is the honest resting value.
//   3. With a secondary, the share is `normalizePrimaryPct`'s: clamped into [50, 100], 75 when
//      missing or unreadable. The clamp and the default are the attribution module's, not restated.
//   4. The secondary is one of the practice's Focuses (`focus_details` keys, ADR-992), because a
//      Pillar the practice earns Zaps toward is a Pillar it develops. Choosing a secondary that is
//      not yet a Focus ADDS it; dropping the Focus that is the secondary drops the split with it.
//   5. The primary is `domain_id`, never "the first Focus" (LIVE-650, ADR-1618). `focus_details` is
//      jsonb, which keeps no key order (Postgres stores object keys by length, then bytewise), so
//      a map read back from the row lists its Pillars in id order. `keepPrimary` keeps the declared
//      primary while it is still a Focus and reaches for a key only when it left the set.
//
// PURE: no database, no clock. `updatePractice` (lib/practices.ts) reads the current row and
// calls this; the unit test in split.test.ts owns every rule above.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePrimaryPct, PRIMARY_PCT_DEFAULT } from './attribution'

/** Pillar ids are UUIDs. Anything else (including `__proto__`) is never stored or used as a key. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The `focus_details` shape (lib/practices.ts `FocusDetails`), restated structurally so this
 *  module does not import the file that imports it. */
type FocusMap = Record<string, { instructions: string; timing: string }>

export interface SplitWriteInput {
  /** The primary Pillar the row holds AFTER this write (`domain_id`). */
  primary: string | null
  /** The Focus map the row holds AFTER this write (`focus_details`). */
  focus: FocusMap
  /** The secondary to store: the patch's when `authored`, otherwise the row's current one. */
  secondary: string | null | undefined
  /** The primary share to store: the patch's when it carries one, otherwise the row's current one. */
  primaryPct: number | null | undefined
  /** True when this write CHOOSES the secondary. False when the row's own secondary is only being
   *  carried through a change to the primary or to the Focus set. */
  authored: boolean
}

export interface SplitWrite {
  secondary_domain_id: string | null
  primary_pct: number
  /** The Focus map with the chosen secondary added, or null when the map needs no change. */
  focus_details: FocusMap | null
}

const EMPTY_FOCUS = { instructions: '', timing: '' }

/** Resolve what one edit stores for the split. Total: any junk in, a row the CHECKs accept out. */
export function resolveSplitWrite(input: SplitWriteInput): SplitWrite {
  const single: SplitWrite = { secondary_domain_id: null, primary_pct: PRIMARY_PCT_DEFAULT, focus_details: null }
  const primary = typeof input.primary === 'string' ? input.primary : ''
  const secondary = typeof input.secondary === 'string' ? input.secondary.trim() : ''
  if (!UUID.test(primary) || !UUID.test(secondary) || secondary === primary) return single

  const listed = Object.prototype.hasOwnProperty.call(input.focus, secondary)
  // The Focus that carried the split was removed, so the split goes with it (rule 4).
  if (!listed && !input.authored) return single

  const primary_pct = normalizePrimaryPct({
    pillarId: primary,
    secondaryPillarId: secondary,
    primaryPct: input.primaryPct ?? null,
  })
  return { secondary_domain_id: secondary, primary_pct, focus_details: listed ? null : withSecondary(input.focus, primary, secondary) }
}

/** The Focus map with `secondary` added: the primary's entry, then every existing UUID-keyed entry
 *  once, then the secondary. The order is only tidy, never meaning: once stored, jsonb re-sorts the
 *  keys, and the primary is read from `domain_id` (rule 5). Built through a Map and
 *  `Object.fromEntries`, never a computed-key write, and any key that is not a Pillar id
 *  (`__proto__`, `constructor`, junk) is dropped, so a stored map can hold nothing but Pillar ids.
 *  Both ids are UUID-checked by the caller. */
function withSecondary(focus: FocusMap, primary: string, secondary: string): FocusMap {
  const own = (k: string) => (Object.prototype.hasOwnProperty.call(focus, k) ? focus[k] : undefined)
  const entries = new Map<string, FocusMap[string]>([[primary, own(primary) ?? EMPTY_FOCUS]])
  for (const [key, detail] of Object.entries(focus)) {
    if (UUID.test(key) && !entries.has(key)) entries.set(key, detail)
  }
  entries.set(secondary, EMPTY_FOCUS)
  return Object.fromEntries(entries)
}

/** The primary Pillar a write that carries a Focus map stores (rule 5; LIVE-650, ADR-1618).
 *  `declared` is the primary this write keeps: the patch's `domain_id` when it names one, else
 *  the row's current `domain_id`. While that Pillar is still one of the Focuses it stays, whatever
 *  order the map's keys arrive in, so a save that round-trips a stored map (keys in id order) can
 *  no longer move the primary to the Pillar whose id sorts first. Only when the declared primary
 *  left the set (or there was none) does the first key of the map as handed stand in: for the
 *  Studio builder that is the Focus it shows as primary, and for a map read from the row it is as
 *  good as any. An empty map has no primary. */
export function keepPrimary(declared: string | null | undefined, focus: FocusMap): string | null {
  if (typeof declared === 'string' && UUID.test(declared) && Object.prototype.hasOwnProperty.call(focus, declared)) {
    return declared
  }
  for (const key of Object.keys(focus)) if (UUID.test(key)) return key
  return null
}
