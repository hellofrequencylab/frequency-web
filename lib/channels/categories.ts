// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL CATEGORY VOCABULARY — the ONE source for `topical_channels.category`.
//
// The category is a small closed set that drives what a Channel LOOKS like: the
// icon on its directory card, the icon chip + eyebrow on its page hero, and the
// accent behind that chip. Before ADR-879 the vocabulary was implied by two
// hand-written `CATEGORY_ICON` maps (the channel page and the channels list)
// while the operator typed the value as free text, so an operator could quietly
// pick a word neither map knew and the Channel would fall back to a generic
// icon with no warning. Now the settings select, the icon, the accent, and the
// label all read this file, so they cannot drift.
//
// PURE + data-only (no Supabase / Next / server imports), so it is trivially
// unit-testable and safe to import from a Server Component, a client rail
// module, and a server action alike. Copy runs NAMING.md + CONTENT-VOICE §10:
// plain label words, no em dashes, no hype.
//
// OFF-LIST VALUES ARE NOT REWRITTEN. Existing rows may hold anything (the old
// free-text field defaulted to 'general'). Every reader here is TOTAL: an
// unknown value keeps its own text as the label and renders the generic Radio
// icon, exactly as it did before. The settings select surfaces an off-list value
// as a marked option so saving another field never silently relabels a Channel.
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import {
  Sparkles,
  Activity,
  Heart,
  MessagesSquare,
  Megaphone,
  Palette,
  Briefcase,
  Radio,
} from 'lucide-react'

/** The closed set of Channel category keys. */
export type ChannelCategory =
  | 'spirituality'
  | 'movement'
  | 'holistic-health'
  | 'human-relating'
  | 'activism'
  | 'creative'
  | 'business-support'

/** One category: its stored key, the label people read, the card/hero icon, and the chip accent. */
export interface ChannelCategoryChoice {
  /** The value stored in `topical_channels.category`. */
  key: ChannelCategory
  /** The word a member sees (the hero eyebrow). */
  label: string
  /** The lucide icon for the directory card and the hero chip. */
  Icon: LucideIcon
  /** Token-only accent classes for the chip (no hex, DAWN tokens only). */
  accent: string
}

/** The seven categories, in the order the settings select lists them. */
export const CHANNEL_CATEGORIES: readonly ChannelCategoryChoice[] = [
  {
    key: 'spirituality',
    label: 'Spirituality',
    Icon: Sparkles,
    accent: 'text-signal-strong bg-signal-bg/40',
  },
  {
    key: 'movement',
    label: 'Movement',
    Icon: Activity,
    accent: 'text-signal-strong bg-success-bg/40',
  },
  {
    key: 'holistic-health',
    label: 'Holistic Health',
    Icon: Heart,
    accent: 'text-danger bg-danger-bg',
  },
  {
    key: 'human-relating',
    label: 'Human Relating',
    Icon: MessagesSquare,
    accent: 'text-signal-strong bg-signal-bg',
  },
  {
    key: 'activism',
    label: 'Activism',
    Icon: Megaphone,
    accent: 'text-warning dark:text-primary bg-warning-bg',
  },
  {
    key: 'creative',
    label: 'Creative',
    Icon: Palette,
    accent: 'text-warning bg-warning-bg/40',
  },
  {
    key: 'business-support',
    label: 'Business Support',
    Icon: Briefcase,
    accent: 'text-muted dark:text-subtle bg-surface',
  },
] as const

/** What a Channel shows when its stored category is off-list (an old free-text value). */
export const FALLBACK_CHANNEL_CATEGORY_ICON: LucideIcon = Radio
export const FALLBACK_CHANNEL_CATEGORY_ACCENT = 'text-muted bg-surface'

/** The key → icon lookup, DERIVED from the array above (never hand-written). A component that picks
 *  its icon during render reads this map rather than calling `channelCategoryIcon`, so the icon is a
 *  stable module-level reference and not a component value created during render. */
export const CHANNEL_CATEGORY_ICON: Readonly<Record<string, LucideIcon>> = Object.freeze(
  Object.fromEntries(CHANNEL_CATEGORIES.map((c) => [c.key, c.Icon])),
)

const CATEGORY_KEYS: readonly ChannelCategory[] = CHANNEL_CATEGORIES.map((c) => c.key)

/** Is `value` one of the registered category keys? (Closed set.) PURE. */
export function isChannelCategory(value: unknown): value is ChannelCategory {
  return typeof value === 'string' && (CATEGORY_KEYS as readonly string[]).includes(value)
}

function find(value: unknown): ChannelCategoryChoice | undefined {
  return isChannelCategory(value) ? CHANNEL_CATEGORIES.find((c) => c.key === value) : undefined
}

/** The icon for a stored category. An off-list value gets the generic Radio. PURE + total. */
export function channelCategoryIcon(value: unknown): LucideIcon {
  return find(value)?.Icon ?? FALLBACK_CHANNEL_CATEGORY_ICON
}

/** The chip accent for a stored category. An off-list value gets the neutral accent. PURE + total. */
export function channelCategoryAccent(value: unknown): string {
  return find(value)?.accent ?? FALLBACK_CHANNEL_CATEGORY_ACCENT
}

/** The label for a stored category. An off-list value keeps its own text, so nothing is renamed
 *  behind an operator's back. An empty or non-string value reads as 'Channel'. PURE + total. */
export function channelCategoryLabel(value: unknown): string {
  const found = find(value)
  if (found) return found.label
  return typeof value === 'string' && value.trim() ? value : 'Channel'
}
