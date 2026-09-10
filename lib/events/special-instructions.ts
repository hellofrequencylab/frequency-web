// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT'S CHECK-IN DETAILS — `events.details.specialInstructions` (ADR-1306).
//
// The host's door note: parking, the code on the gate, what to bring, an accessibility line. The
// create form has asked for it since the first version of that form, and NOTHING in the repo ever
// read it back: no page printed it, no editor changed it, and it is outside `coerceEventDetails`'
// allow-list, so any code that laundered the whole `details` bag through that function silently
// deleted it. It was write-only for the life of the column.
//
// This module is the one place that fact is stated: the member-facing NAME, the guidance under the
// control, and the pure reader every surface uses. Same shape as `checkin-enabled.ts` and
// `market-listing.ts`, and for the same reason: the Studio manifest must stay import-free, so a
// word it shares with a page has to live in a module with zero imports.
//
// PURE + total. Zero imports.
// ─────────────────────────────────────────────────────────────────────────────

/** What a host is asked for, everywhere it is asked (naming canon: one name for one thing). */
export const SPECIAL_INSTRUCTIONS_LABEL = 'Check-in details'

/** The standing guidance under the control. Says who sees it and when, because that is the part a
 *  host cannot guess and the part that decides whether a door code belongs in it. */
export const SPECIAL_INSTRUCTIONS_HELP =
  'Parking, the door code, what to bring, accessibility notes. Guests see this on the event page while check-in is open.'

/** The longest note we keep. A paste of a whole newsletter belongs in the description, not here. */
export const SPECIAL_INSTRUCTIONS_MAX = 2000

/** The stored note, trimmed and capped, or null when there is none. Reads an arbitrary `details`
 *  bag, so a malformed or absent one is simply "no note" rather than a throw. */
export function readEventSpecialInstructions(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null
  const raw = (details as Record<string, unknown>).specialInstructions
  if (typeof raw !== 'string') return null
  const note = raw.trim().slice(0, SPECIAL_INSTRUCTIONS_MAX)
  return note || null
}
