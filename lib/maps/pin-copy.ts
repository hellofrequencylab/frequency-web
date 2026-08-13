// WHAT A PIN SAYS ABOUT WHERE IT IS — one set of rules, every layer (ADR-1027).
//
// The Around You map draws four kinds of thing at two precisions, and before this module each
// combination was assembled inline in the loader. That produced the line the owner screenshotted on
// 2026-08-13:
//
//   Royal Temple - RSVP for Address · Approximate area. The host shares the address when you RSVP.
//
// Two different things saying "RSVP for address" in one sentence, because the venue NAME the host
// typed already carried the instruction and the map added its own. The rules are here now, as pure
// functions over the row's own fields, so the same decision cannot be made twice in two voices.
//
// ── THE RULE, STATED ONCE ──────────────────────────────────────────────────────────────────────
//
//   EXACT       → the street address. If a member can walk to the door, tell them the door.
//   APPROXIMATE → the CITY, and a pill that says why it is only the city.
//
// 🔴 AT APPROXIMATE PRECISION THE VENUE NAME IS DROPPED, and that is the point rather than an
// oversight. A venue name is frequently an address in disguise: "Royal Temple" is one building in
// Vista, and a member with a search engine turns that name into a street number in one step. Pairing
// a coarsened COORDINATE with a precise NAME would coarsen the dot and publish the address beside
// it, which is worse than not coarsening at all because it looks careful. The city is the honest
// grain, and it matches what the pin itself is already showing.
//
// PURE, NO IMPORTS. Testable as strings (lib/maps/pin-copy.test.ts), importable from a server loader
// and a client component alike. Copy obeys docs/CONTENT-VOICE.md §10: plain, concrete, no em dashes,
// no narrated feelings.

/** The address parts a row can offer. Every field optional: rows arrive half-filled. */
export type AddressParts = {
  venueName?: string | null
  street?: string | null
  city?: string | null
  region?: string | null
}

function clean(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * The line for a place whose exact spot is published.
 *
 * Venue name first when there is one, because "Encinitas Viewpoint Park" is what a member is
 * looking for on arrival and the street is how they get there. Falls back through street then city,
 * so a row that only ever got one of the three still says something true.
 */
export function exactLocationLine(parts: AddressParts): string | null {
  const venue = clean(parts.venueName)
  const street = clean(parts.street)
  const city = clean(parts.city)

  const out: string[] = []
  if (venue) out.push(venue)
  if (street) out.push(street)
  // The city is dropped only when the STREET line already spells it ("3598 Royal Road, Vista"),
  // which is common in free-text address fields.
  //
  // 🔴 Deliberately NOT checked against the venue name. "Encinitas Viewpoint Park" contains the word
  // Encinitas without being an address in Encinitas, and an earlier version of this function used
  // `out.some(...)` and therefore printed "Encinitas Viewpoint Park, 56 East D Street" with no city
  // at all. A venue that happens to be named after its town is not a substitute for the town.
  const streetHasCity = city != null && street != null && street.toLowerCase().includes(city.toLowerCase())
  if (city && !streetHasCity) out.push(city)

  return out.length > 0 ? out.join(', ') : null
}

/**
 * The line for a place published as an area: the city, and nothing sharper.
 *
 * `region` rides along only when it is short enough to be a state code or a short name, because
 * "Vista, California" is useful and "Vista, California, United States of America" is a form field
 * read aloud. Never the street, never the venue name (see the header).
 */
export function approximateLocationLine(parts: AddressParts): string | null {
  const city = clean(parts.city)
  const region = clean(parts.region)
  if (!city) return region
  if (region && region.length <= 12 && region.toLowerCase() !== city.toLowerCase()) {
    return `${city}, ${region}`
  }
  return city
}

/** The pill on a coarsened EVENT pin. The host has a way to give the address, so the pill names it
 *  rather than only apologising for what is missing. */
export const EVENT_APPROX_BADGE = 'RSVP for address'

/** The pill on a coarsened SPACE pin. Nothing to RSVP to, so the sentence stops at the honest half. */
export const SPACE_APPROX_BADGE = 'Approximate area'

/**
 * The whole location answer for one pin: the line, and the pill that qualifies it.
 *
 * `kind` decides which pill, `approximate` decides which line. A caller passes the row's own fields
 * and gets back exactly what to render, so the loader never assembles a sentence itself.
 */
export function locationCopy(
  parts: AddressParts,
  opts: { approximate: boolean; kind: 'event' | 'space' | 'circle' },
): { line: string | null; badge: string | null } {
  if (!opts.approximate) {
    return { line: exactLocationLine(parts), badge: null }
  }
  return {
    line: approximateLocationLine(parts),
    badge: opts.kind === 'event' ? EVENT_APPROX_BADGE : SPACE_APPROX_BADGE,
  }
}

/** "and 8 more dates", or nothing at all for a one-off. Singular is spelled, because "1 more dates"
 *  on the one surface built to fix a counting bug would be its own joke. */
export function moreDatesLine(moreCount: number): string | null {
  if (!Number.isFinite(moreCount) || moreCount <= 0) return null
  return moreCount === 1 ? 'and 1 more date' : `and ${moreCount} more dates`
}

/** "12 members" / "1 member". The one place the plural is decided. */
export function memberCountLine(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  return `${n} ${n === 1 ? 'member' : 'members'}`
}
