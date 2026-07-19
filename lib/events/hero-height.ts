// The event page hero height. It resolves from the SHARED cover-height ladder (lib/layout/cover-height.ts)
// that the Business Space cover hero also uses — one ladder, one set of functions (Short / Standard /
// Tall), instead of a second near-identical copy. Stored on the existing events.theme jsonb bag under
// `heroHeight` (no new DB column); 'standard' is the default and is dropped when written so a plain event
// keeps an empty theme.

import {
  coverHeightClass,
  asCoverHeight,
  COVER_HEIGHT_OPTIONS,
  COVER_HEIGHT_DEFAULT,
  type CoverHeight,
} from '@/lib/layout/cover-height'

export type EventHeroHeight = CoverHeight

/** The height tiers for the event hero picker (the shared Short / Standard / Tall ladder). */
export const EVENT_HERO_HEIGHTS: { value: EventHeroHeight; label: string }[] = [...COVER_HEIGHT_OPTIONS]

/** The Tailwind height classes for a hero height (delegates to the shared ladder). */
export function eventHeroHeightClass(height: EventHeroHeight): string {
  return coverHeightClass(height)
}

/** Read the saved hero height out of events.theme (jsonb), defaulting to 'standard' (maps legacy 'medium'). */
export function readEventHeroHeight(theme: unknown): EventHeroHeight {
  if (theme && typeof theme === 'object') {
    const h = asCoverHeight((theme as Record<string, unknown>).heroHeight)
    if (h) return h
  }
  return COVER_HEIGHT_DEFAULT
}

/** Merge a chosen hero height into an existing theme object, dropping the key when it is the
 *  default so the stored theme stays sparse (empty for a plain event). Returns the next theme. */
export function writeEventHeroHeight(
  theme: unknown,
  height: EventHeroHeight,
): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  if (height === COVER_HEIGHT_DEFAULT) delete base.heroHeight
  else base.heroHeight = height
  return base
}
