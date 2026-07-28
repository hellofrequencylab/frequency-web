// ─────────────────────────────────────────────────────────────────────────────
// SPACE DIRECTORY CATEGORY TAXONOMY — the "business style" facet the public
// Business Spaces directory (/spaces/directory) browses + filters by.
//
// SIX categories cover everything; `business` is the catch-all DEFAULT. A Space's
// owner picks one in the business-info settings form; it persists on
// `spaces.preferences.profileData.category` (no new column) and the directory reads
// it back to group + filter the cards.
//
// SCOPE NOTE — this is the PUBLIC DIRECTORY category, a browse/filter FACET only. It
// is DISTINCT from:
//   • the public TYPE chip on a profile, which is always "Business" / "Non Profit"
//     (NAMING.md §"Business pages": no third public designator), and
//   • the internal `spaces.mode_variant` layout FOCUS (appointments / packages /
//     service / ticketed), which tunes the starter layout + lexicon (documented
//     separately by the directory-UI owner).
// Per NAMING.md these words (Practitioner / Coach / Studio / Event) are valid as
// FRAMING only — a self-selected browse category, never the profile's type chip.
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

/** The closed set of directory category keys. `business` is the catch-all default. */
export type SpaceCategory = 'business' | 'practitioner' | 'coach' | 'studio' | 'maker' | 'venue'

/** One browse category: its stable key, the member-facing label + one-line blurb, and a lucide icon
 *  for the filter chip / card. Copy is plain, no em dashes (CONTENT-VOICE §10). */
export interface SpaceCategoryChoice {
  key: SpaceCategory
  /** The filter/label word a member sees. */
  label: string
  /** A one-line plain description of what belongs here (the picker + filter hint). */
  blurb: string
  /** The lucide icon for the chip / card. */
  Icon: LucideIcon
}

/** The six directory categories, in the order the picker + the filter bar list them. `business` leads
 *  as the general default; the rest run from the most personal (1:1) out to the most public (venues). */
export const SPACE_CATEGORIES: readonly SpaceCategoryChoice[] = [
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
    label: 'Coach & Guide',
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

/** The catch-all default when a Space has not picked (or picked an unknown) category. */
export const DEFAULT_SPACE_CATEGORY: SpaceCategory = 'business'

const CATEGORY_KEYS: readonly SpaceCategory[] = SPACE_CATEGORIES.map((c) => c.key)

/** Is `value` a registered directory category key? (Closed set.) PURE. */
export function isSpaceCategory(value: unknown): value is SpaceCategory {
  return typeof value === 'string' && (CATEGORY_KEYS as readonly string[]).includes(value)
}

/** Coerce an arbitrary value to a known SpaceCategory. An unknown / empty / malformed value falls back
 *  to the default ('business'), so a stale or forged value never breaks the directory. PURE + total. */
export function normalizeSpaceCategory(value: unknown): SpaceCategory {
  return isSpaceCategory(value) ? value : DEFAULT_SPACE_CATEGORY
}

/** The member-facing label for a category key (falls back to the default's label for an unknown key). PURE. */
export function spaceCategoryLabel(key: unknown): string {
  const found = SPACE_CATEGORIES.find((c) => c.key === normalizeSpaceCategory(key))
  return found?.label ?? 'Business'
}
