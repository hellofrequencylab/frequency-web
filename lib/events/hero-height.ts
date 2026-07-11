// The event page hero height — a 3-way lever the host picks (Event page overhaul), mirroring the
// Business Space cover hero (lib/spaces/hero-config.ts). Stored on the existing events.theme jsonb
// bag under `heroHeight` (no new DB column); 'standard' is the default and is dropped when written
// so a plain event keeps an empty theme. The classes match the Space cover heights so the "tall"
// option gives the same large-hero feel.

export type EventHeroHeight = 'short' | 'standard' | 'tall'

export const EVENT_HERO_HEIGHTS: { value: EventHeroHeight; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'standard', label: 'Standard' },
  { value: 'tall', label: 'Tall' },
]

const DEFAULT_HEIGHT: EventHeroHeight = 'standard'

// Fixed heights (full-width, object-cover), mirroring the Space cover hero's short/medium/tall.
const HERO_HEIGHT_CLASS: Record<EventHeroHeight, string> = {
  short: 'h-56 sm:h-72',
  standard: 'h-72 sm:h-[22rem]',
  tall: 'h-[24rem] sm:h-[32rem]',
}

/** The Tailwind height classes for a hero height. */
export function eventHeroHeightClass(height: EventHeroHeight): string {
  return HERO_HEIGHT_CLASS[height]
}

function isHeroHeight(v: unknown): v is EventHeroHeight {
  return v === 'short' || v === 'standard' || v === 'tall'
}

/** Read the saved hero height out of events.theme (jsonb), defaulting to 'standard'. */
export function readEventHeroHeight(theme: unknown): EventHeroHeight {
  if (theme && typeof theme === 'object') {
    const h = (theme as Record<string, unknown>).heroHeight
    if (isHeroHeight(h)) return h
  }
  return DEFAULT_HEIGHT
}

/** Merge a chosen hero height into an existing theme object, dropping the key when it is the
 *  default so the stored theme stays sparse (empty for a plain event). Returns the next theme. */
export function writeEventHeroHeight(
  theme: unknown,
  height: EventHeroHeight,
): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  if (height === DEFAULT_HEIGHT) delete base.heroHeight
  else base.heroHeight = height
  return base
}
