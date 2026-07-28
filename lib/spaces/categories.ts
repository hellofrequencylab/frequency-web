// ─────────────────────────────────────────────────────────────────────────────
// SPACE KIND TAXONOMY — what SHAPE of thing a Space is (ADR-887). One of the
// three axes the design fixed:
//   • SUBJECT — what it is ABOUT: the shared vocabulary in lib/taxonomy/subjects.ts
//     (fifteen keys, same list Channels use). Stored at
//     `spaces.preferences.profileData.subject`.
//   • KIND — what SHAPE of thing it is (this file). Space-only: a general
//     business, a practitioner, guides / coaches, a studio, a shop, a venue.
//     Stored at `spaces.preferences.profileData.kind` (legacy rows still carry
//     the old `profileData.category` key; readers fall back to it until
//     scripts/adr-887-space-kind-migration.sql runs).
//   • PILLAR — game only; a Space never has one.
//
// This file used to be the conflated "directory category". ADR-887 split the
// axes: a yoga studio is subject `movement` AND kind `studio` instead of picking
// one true answer. The SIX keys are UNCHANGED (business / practitioner / coach /
// studio / maker / venue) so no stored row is invalidated; only the concept and
// the exported names moved from *Category* to *Kind*, and `coach` relabeled to
// "Guides / Coaches" (owner's phrasing). `business` stays the catch-all DEFAULT.
//
// SCOPE NOTE — kind is a browse/display FACET only. It is DISTINCT from:
//   • the public TYPE chip on a profile, which is always "Business" / "Non Profit"
//     (NAMING.md §"Business pages": no third public designator), and
//   • the internal `spaces.mode_variant` layout FOCUS (appointments / packages /
//     service / ticketed), which tunes the starter layout + lexicon (documented
//     separately by the directory-UI owner).
// Per NAMING.md these words (Practitioner / Coach / Studio / Event) are valid as
// FRAMING only — a self-selected browse facet, never the profile's type chip.
//
// PURE + data-only: no React / Supabase / Next imports, so the taxonomy + its
// guards are trivially unit-testable and safe to import anywhere (the settings
// picker, the discovery read, the directory cards). Copy runs NAMING.md +
// CONTENT-VOICE §10: plain, sentence-ish labels, no em dashes, no hype.
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  HeartHandshake,
  GraduationCap,
  Users,
  ShoppingBag,
  Tent,
} from 'lucide-react'

/** The closed set of Space kind keys. `business` is the catch-all default. Keys are the SAME six the
 *  old category vocabulary used, so stored rows never move. */
export type SpaceKind = 'business' | 'practitioner' | 'coach' | 'studio' | 'maker' | 'venue'

/** One kind: its stable key, the member-facing label + one-line blurb, and a lucide icon for the
 *  chip / card / picker. Copy is plain, no em dashes (CONTENT-VOICE §10). */
export interface SpaceKindChoice {
  key: SpaceKind
  /** The filter/label word a member sees. */
  label: string
  /** A one-line plain description of what belongs here (the picker + filter hint). */
  blurb: string
  /** The lucide icon for the chip / card. */
  Icon: LucideIcon
}

/** The six kinds, in the order the picker lists them. `business` leads as the general default; the
 *  rest run from the most personal (1:1) out to the most public (venues). */
export const SPACE_KINDS: readonly SpaceKindChoice[] = [
  {
    key: 'business',
    label: 'Business',
    blurb: 'A general business. The right home when none of the others fit.',
    Icon: Briefcase,
  },
  {
    key: 'practitioner',
    label: 'Practitioner',
    blurb: 'One-on-one healing work: bodywork, acupuncture, reiki, therapy, energy work.',
    Icon: HeartHandshake,
  },
  {
    key: 'coach',
    label: 'Guides / Coaches',
    blurb: 'Coaching, mentoring, teaching, and courses that move people forward.',
    Icon: GraduationCap,
  },
  {
    key: 'studio',
    label: 'Studios',
    blurb: 'Yoga, movement, group classes, and fitness you gather people for.',
    Icon: Users,
  },
  {
    key: 'maker',
    label: 'Shops',
    blurb: 'Products, art, craft, and goods you make and sell.',
    Icon: ShoppingBag,
  },
  {
    key: 'venue',
    label: 'Event Space',
    blurb: 'Venues, retreats, and ticketed gatherings people come to.',
    Icon: Tent,
  },
] as const

/** The catch-all default when a Space has not picked (or picked an unknown) kind. */
export const DEFAULT_SPACE_KIND: SpaceKind = 'business'

const KIND_KEYS: readonly SpaceKind[] = SPACE_KINDS.map((k) => k.key)

/** Is `value` a registered kind key? (Closed set.) PURE. */
export function isSpaceKind(value: unknown): value is SpaceKind {
  return typeof value === 'string' && (KIND_KEYS as readonly string[]).includes(value)
}

/** Coerce an arbitrary value to a known SpaceKind. An unknown / empty / malformed value falls back
 *  to the default ('business'), so a stale or forged value never breaks the directory. PURE + total. */
export function normalizeSpaceKind(value: unknown): SpaceKind {
  return isSpaceKind(value) ? value : DEFAULT_SPACE_KIND
}

/** The member-facing label for a kind key (falls back to the default's label for an unknown key). PURE. */
export function spaceKindLabel(key: unknown): string {
  const found = SPACE_KINDS.find((k) => k.key === normalizeSpaceKind(key))
  return found?.label ?? 'Business'
}
