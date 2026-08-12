// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — SEED MOODS (Importer v2, owner request 2026-07-07).
// A small, brand-aligned taxonomy of "moods" an operator picks when they Seed or Re-Seed a business.
// A mood is a single dial that steers the whole compose: the reframe TONE (words fed to the voice
// primer), the CTA POSTURE, and the design-block ACCENT emphasis. It is deliberately pure metadata —
// no IO, no AI, no React — so the reframe stage, the page composer, the re-seed action, and the seeder
// UI all read the SAME source and can never drift. Wired consumers land incrementally (#7/#8/#9).
//
// Voice canon (docs/CONTENT-VOICE.md): operator-facing copy here stays plain, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpaceThemeId } from '@/lib/theme/space-themes'

/** The four seed moods (owner pick, 2026-07-07). */
export type SeedMood = 'warm' | 'bold' | 'calm' | 'playful'

/** The default when no mood is chosen (Frequency's DAWN house feel). */
export const DEFAULT_SEED_MOOD: SeedMood = 'warm'

/** How forward the composed calls to action read. */
export type CtaPosture = 'gentle' | 'direct' | 'confident'

/** Which design-block accent emphasis the composed page leans on (maps to the block color/height
 *  controls the page composer already exposes, ADR-570/571). */
export type AccentEmphasis = 'soft' | 'vivid' | 'minimal' | 'high'

/** One mood: a label + operator blurb, the tone words the reframe voice primer folds in, the CTA
 *  posture, and the accent emphasis the composer uses. PURE data. */
export interface SeedMoodSpec {
  key: SeedMood
  /** Member/operator-facing name. */
  label: string
  /** One line on what this mood expresses (voice canon: no em dashes). */
  description: string
  /** Tone adjectives injected into the reframe primer so the copy reads on-mood. */
  toneWords: readonly string[]
  /** How the composed CTAs read. */
  cta: CtaPosture
  /** The design-block accent emphasis the page composer applies. */
  accent: AccentEmphasis
}

export const SEED_MOODS: readonly SeedMoodSpec[] = [
  {
    key: 'warm',
    label: 'Warm and grounded',
    description: 'Human, welcoming, unhurried. The DAWN house feel: real people, plain words, a soft glow.',
    toneWords: ['warm', 'welcoming', 'grounded', 'human', 'unhurried'],
    cta: 'gentle',
    accent: 'soft',
  },
  {
    key: 'bold',
    label: 'Bold and energizing',
    description: 'Confident and high contrast. Strong statements, motion, a clear reason to act now.',
    toneWords: ['bold', 'energizing', 'confident', 'vivid', 'direct'],
    cta: 'confident',
    accent: 'vivid',
  },
  {
    key: 'calm',
    label: 'Calm and trustworthy',
    description: 'Quiet, precise, credible. Room to breathe, evidence over hype, an expert you can trust.',
    toneWords: ['calm', 'precise', 'credible', 'clear', 'reassuring'],
    cta: 'direct',
    accent: 'minimal',
  },
  {
    key: 'playful',
    label: 'Playful and vibrant',
    description: 'Bright, friendly, a little fun. Color, personality, and an easy invitation to join in.',
    toneWords: ['playful', 'vibrant', 'friendly', 'bright', 'inviting'],
    cta: 'direct',
    accent: 'high',
  },
]

const BY_KEY = new Map<SeedMood, SeedMoodSpec>(SEED_MOODS.map((m) => [m.key, m]))

/** Whether a value is a known seed mood key. */
export function isSeedMood(value: unknown): value is SeedMood {
  return typeof value === 'string' && BY_KEY.has(value as SeedMood)
}

/** Coerce any value to a valid seed mood, falling back to the default. Total + safe for stored input. */
export function normalizeSeedMood(value: unknown): SeedMood {
  return isSeedMood(value) ? value : DEFAULT_SEED_MOOD
}

/** The spec for a mood (normalized first, so it never returns undefined). PURE + total. */
export function seedMoodSpec(value: unknown): SeedMoodSpec {
  return BY_KEY.get(normalizeSeedMood(value)) as SeedMoodSpec
}

/** The tone line a mood contributes to the reframe voice primer (#1/#7). Empty-safe. */
export function moodToneDirective(value: unknown): string {
  const spec = seedMoodSpec(value)
  return `Aim for a ${spec.toneWords.join(', ')} tone (the "${spec.label}" mood).`
}

/** The PAGE STYLE a mood drives (task #21): each mood maps to one of the five colour-free page themes
 *  (typography + shape) so the seeded page's LOOK matches its mood, not just its copy tone. The seed applies
 *  this to preferences.theme; the operator can still override it in the Identity & Branding chooser.
 *    warm → editorial (quiet, roomy, unhurried) · bold → bold (the punchy house look) ·
 *    calm → classic (settled, bookish) · playful → playful (rounded, warm).
 *  'accessible' is intentionally not mapped: it stays an explicit operator choice for readability-first. */
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
