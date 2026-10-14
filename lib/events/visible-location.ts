// ONE rule for "what venue line may this reader see" (SCAN-209).
//
// ⚪ THE THREE AUTHORITIES, AND WHICH ONE OWNS WHAT — recorded because this line has already been
// mis-'corrected' once (ADR-1189). ADR-825's own body settles it in one sentence:
//     "The public /discover surface was already city-level only (ADR-186) and the event JSON-LD
//      never carried the venue, so the event page was the single leak surface."
//   · ADR-186  — city-level public surfaces, and the JSON-LD carrying no venue. PRIOR state, which
//                ADR-825 credits to it by name. Not only about member proximity.
//   · ADR-825  — hiding the EXACT address on the event page until a viewer registers. The new rule.
//   · SCAN-209 — that hide_address was a render-layer control, so the address leaked through grants,
//                two feeds and the .ics. The bug, not the policy.
//
// 🔴 WHY THIS IS A MODULE AND NOT A LINE IN EACH CALLER. The rule was already written down — inside
// lib/events/guest-rsvp-email.ts, module-private — and its own comment predicted exactly how it
// would be broken:
//
//     "Calendar links go too, wholesale — an .ics carries the address in its own LOCATION field,
//      so redacting the visible line alone would leak it straight back."
//
// Which is what happened. The event page honoured `hide_address`. The guest email honoured it. The
// JSON-LD is city-level by ADR-186 and so never had the problem. The `.ics` surfaces did not consult
// it at all, and on 2026-08-25 the master public calendar feed — which needs no credential — was
// publishing `3598 Royal Rd, Vista, California` for a host who had switched the address off. A rule
// that lives in one consumer is a rule the next consumer does not know about.
//
// The two uncredentialed FEEDS are fixed in the database (20270331000000), because they are read by
// three routes and returning an unpublishable value invites a fourth mistake. This module is for the
// readers that hold the row itself.

import { mapsSearchUrl } from './maps-link'

/** The columns the rule needs. Structural, so any row shape with these fields can be passed. */
export interface EventLocationFields {
  hide_address?: boolean | null
  /** The host's free-text venue line. NOT city-redacted — it is whatever they typed. */
  location?: string | null
  venue_name?: string | null
  street?: string | null
  city?: string | null
  region?: string | null
}

/** The city line: `city, region`, empty parts dropped, null when neither is known.
 *  Null rather than a placeholder is deliberate — a calendar entry with no LOCATION is honest, and
 *  "Location shared with members" read three months later out of context is not useful. */
export function cityLine(ev: EventLocationFields): string | null {
  return [ev.city, ev.region].filter(Boolean).join(', ') || null
}

/** The venue line a reader who is NOT attending may see.
 *
 *  `hide_address` true -> the city line only. Otherwise the host's own line, falling back to the
 *  parts. The event page applies the same rule with one addition this function deliberately does not
 *  make: a viewer who IS going sees the exact address even when it is hidden. That exception belongs
 *  to callers that can prove attendance — the page, and `event_calendar_feed(_token)`, whose every
 *  row is a going RSVP. A caller that cannot prove it must use this. */
export function publicVisibleLocation(ev: EventLocationFields): string | null {
  if (ev.hide_address === true) return cityLine(ev)
  return (
    ev.location ||
    [ev.venue_name, ev.street, ev.city, ev.region].filter(Boolean).join(', ') ||
    null
  )
}

/** The venue parts the public page may receive: what lib/events/public-venue.ts returns. */
export interface PublicPageVenue {
  name?: string | null
  street?: string | null
  postal_code?: string | null
}

export interface PublicPageWhere {
  /** The where-line: `Venue · street, city` when the host left the address visible, else the city. */
  line: string | null
  /** A Maps search link for the exact venue. Null whenever the line is city-only. */
  mapsHref: string | null
  /** True when the line carries the venue (name or street), not just the city. */
  exact: boolean
}

const trimmed = (v: string | null | undefined): string | null => v?.trim() || null

/** The where-line for the PUBLIC event page, `/events/<slug>` (owner ruling 2026-10-14, ADR-1744).
 *
 *  Shows the venue name and street plus the city ONLY when `hide_address` is explicitly `false`; a
 *  `true`, `null` or unread flag (ADR-1743's rule, the one `publishableVenue` applies to the JSON-LD)
 *  gives the city alone. `venue` must come from `getPublicEventVenue`, which drops every venue column
 *  on the server for a hidden address, so this is the second of two checks, never the only one.
 *  Blank parts are omitted: no stray comma or dot. */
export function publicPageWhere(input: {
  hide_address: boolean | null | undefined
  venue: PublicPageVenue | null | undefined
  city: string | null | undefined
}): PublicPageWhere {
  const city = trimmed(input.city)
  const venue = input.hide_address === false ? input.venue : null
  const name = trimmed(venue?.name)
  const street = trimmed(venue?.street)
  if (!name && !street) return { line: city, mapsHref: null, exact: false }
  const address = [street, city].filter(Boolean).join(', ')
  const line = [name, address].filter(Boolean).join(' · ')
  const query = [name, street, city, trimmed(venue?.postal_code)].filter(Boolean).join(', ')
  return { line, mapsHref: mapsSearchUrl(query), exact: true }
}
