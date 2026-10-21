import { stageCardResponse } from '@/lib/og/stage-card'

// ── THE ONE EVENT SHARE CARD, drawn once and rendered by both event surfaces ──────────────────
//
// An event has two share cards: the member one at /events/<slug> (ADR-1179, ADR-1180) and the
// crawlable public one at /discover/events/<slug>. They are the same card and they must stay the
// same card, so the layout lives here and each route supplies only the STRINGS it is allowed to
// publish. ADR-1179 is the reason this module exists at all: an event's hero precedence was
// hand-rolled at three call sites, two agreed and the third silently drifted, and nothing in the
// app ever looks at a share card, so the only symptom was a plain card on somebody else's phone.
// A layout copied into a second route is the same failure waiting on a second surface.
//
// 🔴 THIS MODULE DECIDES NOTHING ABOUT VISIBILITY OR REDACTION, ON PURPOSE. It never reads the
// database and never resolves a storage path. The two callers answer different questions and must
// keep answering them for themselves:
//   · /events/<slug> reads on the SERVICE-ROLE client, so it carries the link-readability gate and
//     resolves `where` through publicVisibleLocation (ADR-1180, SCAN-209), and its cover may come
//     from the PRIVATE poster bucket through lib/events/hero-url.ts.
//   · /discover/events/<slug> reads on the ANON client, so RLS is the gate, `where` is the city and
//     nothing else (ADR-186), and its cover is tier 1 ONLY — the public event-media bucket. A
//     scanned flyer can carry the venue address that surface deliberately redacts to city level, so
//     the private tiers must never reach it.
// Everything below is presentation. If a rule ever needs to live in one place for both callers, it
// belongs in the module that owns the rule, not in this one.
//
// The layout is the shared Stage card (lib/og/stage-card.tsx): this module maps an event's strings
// onto it and nothing else. With a cover the card leads with the event's own image; without one (or
// when the fetch fails) it is the branded Stage fallback, so a crawl never slows or breaks on a bad image.

type EventCardInput = {
  /** The event's title, or the identity-free fallback string the caller chose. */
  title: string
  /** The formatted date line, or null. */
  when: string | null
  /** The location line the CALLER is allowed to publish. Never a raw venue field. */
  where: string | null
  /** The already-composed attribution line ("Hosted by ..."), or null for the generic one. */
  hostLine: string | null
  /** The small chip's label ("Cancelled" / "Online" / "In person + online"), or null. */
  chip: string | null
  /** Cancelled reads in a muted warning tone; every other chip rides the pastel surface. */
  isCancelled: boolean
  /** A remote, fetchable cover URL. Null renders the branded card. */
  coverUrl?: string | null
  /** `events.theme.coverFocus` ("x% y%"), so every shared crop matches the page hero. */
  coverFocus?: string | null
}

/**
 * Render an event's share card and deliver it through `cardResponse` (JPEG + the CDN headers).
 *
 * ⚠️ NEVER THROWS ON A MISSING IMAGE, and that is load-bearing for both callers: one of them is
 * prerendered-adjacent and the other is fetched by every crawler that meets the page.
 */
export async function eventCardResponse(input: EventCardInput): Promise<Response> {
  return stageCardResponse({
    kicker: 'Event',
    title: input.title,
    meta: [input.when, input.where].filter(Boolean).join(' · ') || null,
    line: input.hostLine ?? 'A community gathering',
    chip: input.chip,
    chipIsWarning: input.isCancelled,
    coverUrl: input.coverUrl,
    coverFocus: input.coverFocus,
  })
}
