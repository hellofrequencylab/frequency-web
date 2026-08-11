// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — SEED MOODS.
//
// The mood taxonomy MOVED to the Studio kernel (lib/studio/kernel/moods.ts, ADR-597): a mood
// is not a business concept, so every entity's Spark and re-seed now shares one source. This
// module re-exports it unchanged (existing importer call sites keep working verbatim) and
// keeps the one genuinely Space-specific mapping: mood -> page theme.
//
// Voice canon (docs/CONTENT-VOICE.md): operator-facing copy stays plain, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpaceThemeId } from '@/lib/theme/space-themes'
import { normalizeSeedMood } from '@/lib/studio/kernel/moods'

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
