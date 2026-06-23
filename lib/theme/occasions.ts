// The OCCASION registry — the single typed place a seasonal/temporal "occasion" (a
// time-boxed accent applied via [data-occasion] on the shell root) is declared, so the
// core never edits to add one (docs/SPACES.md, docs/DECISIONS.md). An occasion is the
// time axis of the theme: orthogonal to the light/dark MODE, the SKIN palette, and the
// GENERATION feel, it layers a light seasonal touch (e.g. a solstice accent) for the
// in-app subtree during its calendar window, then falls back to `none`.
//
// This registry is the typed mirror of the CSS: every non-`none` id here MUST have a
// matching `[data-occasion="<id>"]` block in app/globals.css (`none` is the baseline and
// needs no block). The guardrail test in occasions.test.ts reads globals.css from disk and
// enforces that pairing forever, so the CSS and the registry can never quietly drift apart.
//
// Imported statically (no runtime registration), so the registry is deterministic
// regardless of import order — same pattern as lib/verticals/registry.ts and skins.ts.

/** The set of authored occasion ids. Add one = author its CSS block AND extend this union. */
export type OccasionId = 'none' | 'solstice'

/** The full declaration of an occasion — its id, member-facing label, and active window. */
export interface OccasionDef {
  /** Stable id, the `[data-occasion]` value. `none` is the baseline (no accent). */
  id: OccasionId
  /** Short, member-facing label (docs/NAMING.md, docs/CONTENT-VOICE.md — plain, no em dashes). */
  label: string
  /**
   * The calendar window this occasion is active, inclusive, as 'MM-DD' strings. Omitted
   * for `none` (always-on baseline). A window may wrap the year-end (start > end), e.g. a
   * winter window of '12-20'..'01-02'.
   */
  window?: { start: string; end: string }
}

/**
 * Every registered occasion. `none` is the baseline (no seasonal accent); each other
 * occasion declares the window during which resolveOccasionForDate selects it.
 */
export const OCCASIONS: readonly OccasionDef[] = [
  {
    id: 'none',
    label: 'No occasion',
  },
  {
    id: 'solstice',
    label: 'Solstice',
    // The June solstice falls on 20-21; a short window around it carries the accent.
    window: { start: '06-18', end: '06-22' },
  },
]

/** The fallback occasion id. An unknown or missing value resolves to this. */
export const DEFAULT_OCCASION: OccasionId = 'none'

/** Type guard: is this raw string a known occasion id? */
export function isOccasionId(id: string): id is OccasionId {
  return OCCASIONS.some((o) => o.id === id)
}

/** Format a Date as the local-calendar 'MM-DD' key used to test occasion windows. */
function monthDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

/**
 * The occasion whose 'MM-DD' window contains `d`, else `none`. Windows are inclusive on
 * both ends. A window that wraps the year-end (start > end, e.g. '12-20'..'01-02') matches
 * dates on EITHER side of the wrap. The first matching occasion in registry order wins.
 */
export function resolveOccasionForDate(d: Date): OccasionId {
  const key = monthDay(d)
  for (const occ of OCCASIONS) {
    if (!occ.window) continue
    const { start, end } = occ.window
    const inWindow =
      start <= end
        ? key >= start && key <= end // normal window within one year
        : key >= start || key <= end // year-wrapping window
    if (inWindow) return occ.id
  }
  return DEFAULT_OCCASION
}
