// ─────────────────────────────────────────────────────────────────────────────
// SEED MOODS — the mood-to-LOOK mapping (ADR-993).
//
// The mood taxonomy MOVED to the Studio kernel (lib/studio/kernel/moods.ts, ADR-597): a mood
// is not a business concept, so every entity's Spark and re-seed now shares one source. This
// module re-exports it unchanged (existing importer call sites keep working verbatim) and owns
// the half the kernel deliberately cannot: the mapping from a mood to a LOOK.
//
// WHY THE LOOK LIVES HERE, NOT IN THE KERNEL: a look is made of ENTITY types (a SpaceThemeId, a
// Studio AccentKey) and the kernel declares no entity types. The kernel says what a mood MEANS
// (tone words, CTA posture, accent emphasis); this file says what a mood LOOKS LIKE in the
// concrete controls the product actually has.
//
// ONE dial, three outputs: `moodLook()` returns the page theme, the accent colour, and the image
// style words in one call, so an entity with a theme OR an accent OR a generated cover reads its
// whole look from the same place instead of inventing a second mapping.
//
// PURE: no IO, no AI, no React. Unit-tested in moods.test.ts.
//
// Voice canon (docs/CONTENT-VOICE.md): operator-facing copy stays plain, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpaceThemeId } from '@/lib/theme/space-themes'
import { DEFAULT_ACCENT, STUDIO_ACCENTS, type AccentKey } from '@/lib/studio/accents'
import { normalizeSeedMood, seedMoodSpec, type AccentEmphasis } from '@/lib/studio/kernel/moods'

export {
  DEFAULT_SEED_MOOD,
  SEED_MOODS,
  isSeedMood,
  moodToneDirective,
  normalizeSeedMood,
  seedMoodSpec,
} from '@/lib/studio/kernel/moods'
export type { AccentEmphasis, CtaPosture, SeedMood, SeedMoodSpec } from '@/lib/studio/kernel/moods'

/** The PAGE STYLE a mood drives (task #21): each mood maps to one of the five colour-free page themes
 *  (typography + shape) so the seeded page's LOOK matches its mood, not just its copy tone. The seed applies
 *  this to preferences.theme; the operator can still override it in the Identity & Branding chooser.
 *    warm → editorial (quiet, roomy, unhurried) · bold → bold (the punchy house look) ·
 *    calm → classic (settled, bookish) · playful → playful (rounded, warm).
 *  'accessible' is intentionally not mapped: it stays an explicit operator choice for readability-first.
 *
 *  STAYS HERE (not in the kernel): SpaceThemeId is a Space type, and the kernel declares no entity types. */
export function moodToSpaceTheme(value: unknown): SpaceThemeId {
  switch (normalizeSeedMood(value)) {
    case 'bold':
      return 'bold'
    case 'calm':
      return 'classic'
    case 'playful':
      return 'playful'
    case 'warm':
    default:
      return 'editorial'
  }
}

/** The ACCENT COLOUR a mood drives (ADR-993). The Space's look is a page theme; a Journey's (and a
 *  Quest's) is a single accent from the Studio palette (lib/studio/accents.ts), which is the same
 *  question asked in the shape that entity happens to have. So the mood answers both.
 *    warm → clay (earthy, unhurried) · bold → indigo (deep, high contrast) ·
 *    calm → teal (quiet, credible) · playful → gold (bright, friendly).
 *  'jade' is intentionally not mapped: it stays the house default for anything created without a mood,
 *  so "no mood chosen" and "chose warm" never collapse into the same look.
 *
 *  STAYS HERE (not in the kernel): AccentKey is a Studio entity type, same rule as SpaceThemeId. */
export function moodToAccent(value: unknown): AccentKey {
  switch (normalizeSeedMood(value)) {
    case 'bold':
      return 'indigo'
    case 'calm':
      return 'teal'
    case 'playful':
      return 'gold'
    case 'warm':
    default:
      return 'clay'
  }
}

/** The IMAGE STYLE words a mood contributes to a generated cover (ADR-993, the Recraft cover offer in
 *  lib/loom/cover.ts). The same dial that sets the type and the colour also sets what a generated image
 *  looks like, so a "calm and trustworthy" Journey does not get a neon cover. Plain words a diffusion
 *  model reads well; no em dashes, no brand names. */
export function moodImageStyle(value: unknown): string {
  switch (normalizeSeedMood(value)) {
    case 'bold':
      return 'high contrast, strong simple shapes, saturated colour, confident composition'
    case 'calm':
      return 'muted palette, lots of negative space, soft even light, quiet and precise'
    case 'playful':
      return 'bright friendly colour, rounded shapes, light and cheerful'
    case 'warm':
    default:
      return 'warm earthy palette, soft natural light, unhurried and human'
  }
}

/** Everything a mood says about how a thing LOOKS, in one call: the page theme (for an entity with a
 *  theme), the accent colour (for an entity with an accent), the kernel's accent EMPHASIS (how hard the
 *  composer leans on it), and the image style words (for a generated cover). Total + PURE: an unknown
 *  value resolves to the default mood's look, never undefined.
 *
 *  This is the one function a new entity calls. Reaching past it to a single mapping is how the look
 *  drifts entity by entity, which is exactly what this file exists to stop. */
export interface MoodLook {
  theme: SpaceThemeId
  accent: AccentKey
  emphasis: AccentEmphasis
  imageStyle: string
}

export function moodLook(value: unknown): MoodLook {
  return {
    theme: moodToSpaceTheme(value),
    accent: moodToAccent(value),
    emphasis: seedMoodSpec(value).accent,
    imageStyle: moodImageStyle(value),
  }
}

/** Whether a string is a real Studio accent key. Used by the tests and by any caller storing a mood's
 *  accent on a row, so a bad mapping can never persist a key with no colour behind it. PURE. */
export function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === 'string' && STUDIO_ACCENTS.some((a) => a.key === value)
}

/** The accent used when nothing has been chosen at all (no mood, no author pick). Re-exported so a
 *  caller never has to import two modules to answer one question. */
export { DEFAULT_ACCENT }
