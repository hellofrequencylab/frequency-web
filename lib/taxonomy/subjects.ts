// ─────────────────────────────────────────────────────────────────────────────
// THE SUBJECT VOCABULARY — one shared answer to "what is this about?", for
// Channels AND Spaces (ADR-887).
//
// Hoisted out of lib/channels/categories.ts because the word both entities need
// cannot live inside either one: a Channel is ABOUT Meditation, and so is the
// breathwork studio down the street. The Channel file keeps its whole public
// API and derives from this list, so every existing import keeps working.
//
// Subject is ONE of three axes, and the boundaries are the design
// (docs/DECISIONS.md ADR-887):
//   • SUBJECT — what it is about (this file). Channels, Spaces, and through a
//     Circle's Channel, Circles.
//   • KIND — what shape of thing it is. Space-only (Guides / Coaches, Studios,
//     Venues; lib/spaces/categories.ts). A yoga studio is subject `movement`
//     AND kind `studio`; before the split it had to pick one true answer.
//   • PILLAR — what it develops (Mind / Body / Spirit / Expression). Game only,
//     orthogonal, and a Space can never have one, which is what rules out
//     nesting subject under Pillar.
//
// NAMING (owner directive, 2026-07-28, recorded in CONTENT-VOICE §2a): door
// names may say the plain wellness word out loud — Spirituality, Meditation,
// Holistic Health, Functional Medicine. The register rule that survives is
// about CONTENT, not names: no heavy spiritual flair in body copy. Every label
// here is what a real person would call the thing; combo labels use " / " so
// one door covers a focused group without a second door.
//
// KEY STABILITY. Five of the seven original Channel keys are unchanged, so
// their rows never move. Two keys are RETIRED as vocabulary but their live rows
// were remapped by the owner-approved script (scripts/adr-887-subject-remap.sql):
// `human-relating` → `friendship`, and the Mental / Emotional Health Channel's
// `holistic-health` → `mental-health`. Off-list values in the wild are still
// never rewritten at read time (the ADR-879 rule): readers stay TOTAL, the
// label keeps its own text, the icon falls back.
//
// PURE + data-only: no Supabase / Next / server imports.
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import {
  Sparkles,
  Flower2,
  Activity,
  Mountain,
  Heart,
  Stethoscope,
  Brain,
  Users,
  Palette,
  Scissors,
  UtensilsCrossed,
  Sprout,
  Megaphone,
  Briefcase,
  Baby,
} from 'lucide-react'

/** The closed set of subject keys, shared by Channels and Spaces. */
export type SubjectKey =
  | 'spirituality'
  | 'meditation'
  | 'movement'
  | 'outdoors'
  | 'holistic-health'
  | 'functional-medicine'
  | 'mental-health'
  | 'friendship'
  | 'creative'
  | 'crafts-hobbies'
  | 'food'
  | 'gardening'
  | 'parenting'
  | 'activism'
  | 'business-support'

export interface SubjectChoice {
  /** The stored value (topical_channels.category; spaces profileData.subject). */
  key: SubjectKey
  /** The door name a member reads. */
  label: string
  /** The lucide icon for cards and hero chips. */
  Icon: LucideIcon
  /** Token-only accent classes for the chip (DAWN tokens, never hex). */
  accent: string
}

/** The fifteen subjects, in the order every picker lists them. Doors first
 *  (the friendly, concrete ones people browse by), practice-adjacent depth in
 *  the middle, civic and work last — the same arc the directory reads best in. */
export const SUBJECTS: readonly SubjectChoice[] = [
  {
    key: 'spirituality',
    label: 'Spirituality',
    Icon: Sparkles,
    accent: 'text-signal-strong bg-signal-bg/40',
  },
  {
    key: 'meditation',
    label: 'Meditation / Breathwork',
    Icon: Flower2,
    accent: 'text-signal-strong bg-signal-bg/60',
  },
  {
    key: 'movement',
    label: 'Movement / Fitness',
    Icon: Activity,
    accent: 'text-signal-strong bg-success-bg/40',
  },
  {
    key: 'outdoors',
    label: 'Outdoors / Adventure',
    Icon: Mountain,
    accent: 'text-signal-strong bg-success-bg/60',
  },
  {
    key: 'holistic-health',
    label: 'Holistic Health',
    Icon: Heart,
    accent: 'text-danger bg-danger-bg',
  },
  {
    key: 'functional-medicine',
    label: 'Functional Medicine',
    Icon: Stethoscope,
    accent: 'text-danger bg-danger-bg/60',
  },
  {
    key: 'mental-health',
    label: 'Mental Health / Recovery',
    Icon: Brain,
    accent: 'text-signal-strong bg-signal-bg',
  },
  {
    key: 'friendship',
    label: 'Friendship / Relationships',
    Icon: Users,
    accent: 'text-signal-strong bg-signal-bg',
  },
  {
    key: 'creative',
    label: 'Creative / Arts',
    Icon: Palette,
    accent: 'text-warning bg-warning-bg/40',
  },
  {
    key: 'crafts-hobbies',
    label: 'Crafts & Hobbies',
    Icon: Scissors,
    accent: 'text-warning bg-warning-bg/60',
  },
  {
    key: 'food',
    label: 'Food / Cooking',
    Icon: UtensilsCrossed,
    accent: 'text-warning dark:text-primary bg-warning-bg',
  },
  {
    key: 'gardening',
    label: 'Gardening',
    Icon: Sprout,
    accent: 'text-signal-strong bg-success-bg/40',
  },
  {
    key: 'parenting',
    label: 'Parenting / Kids',
    Icon: Baby,
    accent: 'text-signal-strong bg-signal-bg/40',
  },
  {
    key: 'activism',
    label: 'Service / Activism',
    Icon: Megaphone,
    accent: 'text-warning dark:text-primary bg-warning-bg',
  },
  {
    key: 'business-support',
    label: 'Business Support',
    Icon: Briefcase,
    accent: 'text-muted dark:text-subtle bg-surface',
  },
] as const

const SUBJECT_KEYS: readonly SubjectKey[] = SUBJECTS.map((s) => s.key)

/** Is `value` one of the registered subject keys? (Closed set.) PURE. */
export function isSubjectKey(value: unknown): value is SubjectKey {
  return typeof value === 'string' && (SUBJECT_KEYS as readonly string[]).includes(value)
}

/** The subject for a stored value, or undefined when it is off-list. PURE. */
export function findSubject(value: unknown): SubjectChoice | undefined {
  return isSubjectKey(value) ? SUBJECTS.find((s) => s.key === value) : undefined
}
