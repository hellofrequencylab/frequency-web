// The STRUCTURE axis — a pure mapping from the style/generation preset to a
// *structural* layout variant, so a template can change its LAYOUT (column count,
// rhythm, header scale, measure) by preset, not just its color/skin.
//
// This is the missing half of the theming story. The generation registry
// (lib/theme/generations.ts) already tunes TYPE SCALE, ornamentation, target
// size, and the contrast floor via [data-generation] CSS. Those are *intra-band*
// knobs — they restyle the same boxes. STRUCTURE is the orthogonal, coarser knob:
// it decides how many columns the body flows into and how generous the rhythm is,
// i.e. the COMPOSITION of the page, from the same content.
//
// Why three buckets (the evidence):
//   • The calm end of the adult spectrum (`spacious`) and EVERY kids band exist to
//     LOWER cognitive + motor load: bigger targets, fewer things competing on a
//     row, a single scannable column, generous whitespace. NN/g's age-band work
//     (cited in generations.ts) and the same calm-surface intent behind `spacious`
//     both point at single-column, low-density, large-target layouts. → 'simple'.
//   • The bold middle (`bold`) explicitly wants "more on screen at once" (its own
//     vibe copy) and carries only the AA floor, so it can TOLERATE a denser,
//     multi-column composition. → 'dense'.
//   • Everything in between (`classic`, `balanced`, `playful`) is the comfortable
//     default — the current, proven layout. → 'standard'.
//
// Pure + dependency-free (just the GenerationId union), so it is safe to import
// from a Server Component, a Client Component, or a test. The template resolves
// the generation (server-side, from the cookie) and asks this function for the
// structural variant; the mapping itself never reads the cookie or the DOM.

import type { GenerationId } from './generations'

/**
 * A structural layout variant. Coarser than a generation: many generations map to
 * one structure. A template reads this to swap LAYOUT (columns, rhythm, header
 * scale), never to change *what* content is shown.
 *
 *  - `simple`   — single column, generous rhythm, larger header. Calmest, most
 *                 scannable; for the calm + kids presets (lowest density).
 *  - `standard` — the current/default composition. The comfortable middle.
 *  - `dense`    — one step denser (more columns where the grid allows), compact
 *                 rhythm + header. For the bold preset ("more on screen at once").
 */
export type Structure = 'simple' | 'standard' | 'dense'

/** The kids age bands — all map to `'simple'` (lowest density, largest targets). */
const KIDS_GENERATIONS: ReadonlySet<GenerationId> = new Set<GenerationId>([
  'kids-early',
  'kids-mid',
  'kids-tween',
])

/**
 * Resolve the structural variant for a generation.
 *
 *   spacious + all kids bands → 'simple'   (calm / low-density / large-target)
 *   bold                      → 'dense'     ("more on screen at once")
 *   classic | balanced | playful → 'standard' (the proven default)
 *
 * Total over GenerationId and exhaustively switched, so adding a generation to the
 * union forces a compile-time decision here (no silent fall-through to a default).
 */
export function structureFor(generation: GenerationId): Structure {
  if (generation === 'spacious' || KIDS_GENERATIONS.has(generation)) return 'simple'

  switch (generation) {
    case 'bold':
      return 'dense'
    case 'classic':
    case 'balanced':
    case 'playful':
      return 'standard'
    // kids bands are handled above; listed here so the switch stays exhaustive
    // over GenerationId and a new id can't compile without a structure decision.
    case 'kids-early':
    case 'kids-mid':
    case 'kids-tween':
      return 'simple'
  }
}
