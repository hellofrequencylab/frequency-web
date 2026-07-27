// PUBLIC LISTING for an event (ADR-844): whether a public event is merchandised on the browse
// surfaces (the /events home and the Marketplace Events tab), separate from WHO can see it.
//
// Two different questions, deliberately kept apart:
//   * `events.visibility` — who may see the event at all. 'public' means anyone, 'unlisted' means
//     anyone with the link, and so on. Unchanged by this module.
//   * THIS flag — given a public event, does it appear in the browse listings. A host can keep an
//     event fully public, linkable, and on their Space calendar, while opting out of being listed
//     alongside everyone else's.
// Without the split the only way to leave the listings was to stop being public, which also took
// the event off the master calendar and out of link-shareable discovery. That was too blunt.
//
// STORAGE: the existing `events.theme` jsonb bag, under `marketListed`, alongside `coverFocus`
// (lib/events/cover-focus.ts) and `heroHeight` (lib/events/hero-height.ts). NO new column and no
// migration. Listed is the DEFAULT, so the key is only ever written when a host opts OUT, and
// every event that exists today keeps listing exactly as it does now.
//
// Pure + total, so it is safe on both sides of the wire.

/** The theme key. Present and `false` = opted out; absent = listed (the default). */
const KEY = 'marketListed'

/**
 * Is this event listed on the public browse surfaces? Defaults to TRUE, so an event that has
 * never touched the control (which is all of them today) lists exactly as it does now. Only an
 * explicit stored `false` opts out; any other value is treated as listed, which fails OPEN on
 * purpose. Hiding a host's event because of a malformed theme bag would be the worse failure.
 */
export function readEventMarketListed(theme: unknown): boolean {
  if (theme && typeof theme === 'object') {
    const v = (theme as Record<string, unknown>)[KEY]
    if (v === false) return false
  }
  return true
}

/**
 * Merge the choice into an existing theme object. Writing `true` DELETES the key rather than
 * storing it, so the stored theme stays sparse and "listed" remains a true default rather than a
 * value every row has to carry. Returns the next theme.
 */
export function writeEventMarketListed(theme: unknown, listed: boolean): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  if (listed) delete base[KEY]
  else base[KEY] = false
  return base
}

/**
 * Filter a batch of rows down to the ones that may be LISTED. Applied in app code rather than as a
 * SQL predicate on purpose: a jsonb `->>` filter treats a missing key as NULL, and `NULL <> 'true'`
 * is NULL, so the obvious `.not('theme->>marketListed','eq','false')` would silently drop every
 * event that never set the key, which is all of them. The reads this runs after are already
 * narrowed and capped, so filtering here is both correct and cheap.
 */
export function listableOnly<T extends { theme?: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => readEventMarketListed(r.theme))
}

/** The host-facing copy for the control, kept next to the rule so surface and meaning cannot drift. */
export const MARKET_LISTING_LABEL = 'List this event publicly'
export const MARKET_LISTING_HELP =
  'On, it shows up when people browse events. Off, it stays public and anyone with the link can still open it.'
