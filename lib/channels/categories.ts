// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL CATEGORY VOCABULARY — now a VIEW onto the shared subject taxonomy.
//
// ADR-887 hoisted the word list to lib/taxonomy/subjects.ts because Channels
// and Spaces share one answer to "what is this about?", and neither entity may
// own a vocabulary both read. This file keeps its ENTIRE public API (the type,
// the array, the readers, the icon map) so every existing import — the page
// hero, the directory card, the settings select, the full editor, the create
// action's validator — keeps working unchanged; it simply derives from the
// shared list instead of declaring its own.
//
// Everything ADR-879 locked still holds, and is still tested here:
//   • one source, no hand-written parallel maps;
//   • OFF-LIST VALUES ARE NOT REWRITTEN — readers are TOTAL, an unknown value
//     keeps its own text as the label and falls back to the generic Radio icon;
//   • the settings select surfaces an off-list value as a marked option so
//     saving another field never silently relabels a Channel;
//   • the icon map sits on a NULL PROTOTYPE, so a stored category named
//     'toString' resolves undefined and the caller's ?? fallback fires instead
//     of React throwing on Object.prototype.toString (this crashed the whole
//     /channels directory before it was caught).
//
// PURE + data-only (no Supabase / Next / server imports).
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import { Radio } from 'lucide-react'
import {
  SUBJECTS,
  isSubjectKey,
  findSubject,
  type SubjectKey,
  type SubjectChoice,
} from '@/lib/taxonomy/subjects'

/** The closed set of Channel category keys — the shared subject keys (ADR-887). */
export type ChannelCategory = SubjectKey

/** One category: its stored key, the label people read, the card/hero icon, and the chip accent. */
export type ChannelCategoryChoice = SubjectChoice

/** The categories, in the order the settings select lists them — THE shared subject list. */
export const CHANNEL_CATEGORIES: readonly ChannelCategoryChoice[] = SUBJECTS


/** What a Channel shows when its stored category is off-list (an old free-text value). */
export const FALLBACK_CHANNEL_CATEGORY_ICON: LucideIcon = Radio
export const FALLBACK_CHANNEL_CATEGORY_ACCENT = 'text-muted bg-surface'

/** The key → icon lookup, DERIVED from the array above (never hand-written). A component that picks
 *  its icon during render reads this map rather than calling `channelCategoryIcon`, so the icon is a
 *  stable module-level reference and not a component value created during render. */
export const CHANNEL_CATEGORY_ICON: Readonly<Record<string, LucideIcon>> = Object.freeze(
  // On a NULL PROTOTYPE, and that is load-bearing. Object.fromEntries inherits Object.prototype,
  // so indexing the map with a stored category of 'toString' or 'constructor' returned a real,
  // truthy FUNCTION, the caller's `?? FALLBACK` never fired, and React threw rendering it - taking
  // down the Channel page and the whole /channels directory. The category column is free text
  // (any host can type anything at create), so those keys are reachable, not theoretical. With no
  // prototype, every off-list key is undefined and the fallback fires.
  Object.assign(Object.create(null), Object.fromEntries(CHANNEL_CATEGORIES.map((c) => [c.key, c.Icon]))),
)

/** Is `value` one of the registered category keys? (Closed set.) PURE. */
export function isChannelCategory(value: unknown): value is ChannelCategory {
  return isSubjectKey(value)
}

const find = findSubject

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
