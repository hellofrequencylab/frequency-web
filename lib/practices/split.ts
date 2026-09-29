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
//      not yet a Focus ADDS it (with the primary's key kept first); dropping the Focus that is the
//      secondary drops the split with it.
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
  const primary = input.primary
  const secondary = typeof input.secondary === 'string' ? input.secondary.trim() : ''
  if (!primary || !UUID.test(secondary) || secondary === primary) return single

  const listed = Object.prototype.hasOwnProperty.call(input.focus, secondary)
  // The Focus that carried the split was removed, so the split goes with it (rule 4).
  if (!listed && !input.authored) return single

  const primary_pct = normalizePrimaryPct({
    pillarId: primary,
    secondaryPillarId: secondary,
    primaryPct: input.primaryPct ?? null,
  })
  return {
    secondary_domain_id: secondary,
    primary_pct,
    focus_details: listed
      ? null
      : // The primary's key first, so a reader that takes "the first Focus" still finds the primary.
        { [primary]: input.focus[primary] ?? EMPTY_FOCUS, ...input.focus, [secondary]: EMPTY_FOCUS },
  }
}
