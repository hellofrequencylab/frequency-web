import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventHeroUrl } from '@/lib/events/hero-url'
import { publicVisibleLocation } from '@/lib/events/visible-location'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { eventCardResponse } from '@/lib/og/event-card'
import { cardResponse } from '@/lib/og/deliver'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `An event on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. This card puts the entity's cover across the full 1200x630 canvas, and
// next/og emits lossless PNG: 1,776KB measured, against 151KB as JPEG. cardResponse
// re-encodes and adds the CDN cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-event social share / SEO card for /events/<slug>. When the event has artwork, the card leads
// with THAT image as the background, with the identity lockup (title · when · where · host) over a
// legibility scrim and the Frequency watermark top-right — the SAME visual language as the Space OG
// card (spaces/[slug]/opengraph-image.tsx). When there is none (or the image fails to fetch), it
// falls back to the brand-styled TEXT card, so a crawl can never slow or crash on a missing/broken
// image. Privacy: title, date, the typed location line, and the host display name only. The
// cancelled / online / hybrid chip rides both variants.
//
// ⚠️ THE LAYOUT ITSELF NOW LIVES IN lib/og/event-card.tsx (ADR-1257), because the public twin at
// /discover/events/<slug> renders the same card and a second copy is how ADR-1179 happened. THIS
// FILE STILL OWNS EVERY RULE: the service-role read, the link-readability gate, the redacted
// location line, and the three-tier hero precedence. The shared module reads no database and
// resolves no storage path — it takes strings and one already-resolved cover URL.
//
// 🔴 "HAS ARTWORK" IS THREE SOURCES, NOT ONE, AND THIS ROUTE ONLY EVER ASKED FOR TWO. Until
// 2026-09-01 the select below omitted `cover_image_path` entirely, so every event whose host
// UPLOADED a cover — the ordinary case — resolved null and shared as the text card, while the page
// it links to showed the photo. Nothing caught it: the card renders successfully, and the only
// symptom is a plain card in someone else's message thread. The precedence now lives in
// lib/events/hero-url.ts, `scripts/check-event-hero-parity.test.ts` fails a PR that drops a column
// from this select, and ADR-1179 is the record.
//
// Satori has NO access to the CSS token system, so the few colors it needs are literals mirroring the
// existing event cards (the shared module + the claim card): events indigo #6366f1 accent,
// near-black ground, white display type.
const INDIGO = '#6366f1'

// The card a NON-PUBLIC event gets: brand ground, the events accent bar, and the words "An event on
// Frequency" — no title, no date, no venue, no host. Identity-free by construction, so a shared link
// to a private, draft or removed event reveals nothing through its image. Built-in font only, so it
// can never slow or fail a crawl. Mirrors the Space card's private branch.
//
// ⚠️ NOT the shared module's text card: this one must publish NO event strings at all, so it is
// written out here rather than assembled from fields a future edit could start filling in.
function neutralCard() {
  return cardResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundImage: 'linear-gradient(180deg, rgba(13,13,18,1) 0%, rgba(23,21,38,1) 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: '0.32em', color: 'rgba(255,255,255,0.85)' }}>
          {SITE_NAME.toUpperCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: INDIGO, marginBottom: 28 }} />
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', maxWidth: 1040 }}>
            An event on {SITE_NAME}
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          A community gathering
        </div>
      </div>
    ),
    size,
  )
}

type Row = {
  title: string | null
  starts_at: string | null
  attendance_mode: string | null
  is_cancelled: boolean | null
  // The VISIBILITY gate. The admin read below bypasses RLS, so these are the only thing standing
  // between a private/draft/removed row and an anonymous, CDN-cached share card.
  visibility: string | null
  status: string | null
  removed_at: string | null
  // The location inputs `publicVisibleLocation` needs. `location` is the host's free-text line and
  // often carries the street, so it is NEVER read directly here — see the header.
  hide_address: boolean | null
  location: string | null
  venue_name: string | null
  street: string | null
  city: string | null
  region: string | null
  // The three hero sources, in the precedence lib/events/hero-url.ts applies. All three are
  // required: selecting only the poster pair is what made every host-uploaded cover share as the
  // text card.
  cover_image_path: string | null
  poster_path: string | null
  details: EventDetailsWithMedia | null
  /** The presentation bag (events.theme jsonb) — read for its `coverFocus` key only. */
  theme: unknown
  host: { display_name: string | null } | null
}

// The Frequency mark is inlined through lib/og/local-image.ts, from lib/og/event-card.tsx (Satori
// needs bytes, not a relative URL). ⚠️ NOT a `readFile` in either file: a path built from a
// variable is unresolvable to @vercel/nft, which then globs the whole of public/ into every
// function under this segment, even though every call site passed a literal. See that module's
// header.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select(
      'title, starts_at, attendance_mode, is_cancelled, visibility, status, removed_at, hide_address, location, venue_name, street, city, region, cover_image_path, poster_path, details, theme, host:profiles!host_id ( display_name )',
    )
    .eq('slug', slug)
    .maybeSingle()
  const ev = (data ?? null) as Row | null

  // ── THE VISIBILITY GATE ─────────────────────────────────────────────────────────────────────────
  // The read above is the SERVICE-ROLE client, so RLS is bypassed and `.eq('slug', slug)` is the only
  // predicate. This route is also exempt from the sign-in wall (proxy.ts `isPublicEventView` lets all
  // of /events/* through except /new and /manage), Next emits its <meta og:image> on every event page
  // including the noindexed ones, and lib/og/deliver.ts caches the result on a shared CDN for 24h
  // with a week of stale-while-revalidate. So without this gate a private, circle-only, draft or
  // staff-removed event published its title, date, venue line and host name to anyone who could
  // guess a slug — and kept publishing it for a day after anyone fixed the row.
  //
  // `generateMetadata` in page.tsx has mirrored the page body's gate all along, with a comment
  // saying exactly why ("The admin read bypasses RLS, so mirror the page body's visibility gate
  // here"). The image route, in the same folder, reading the same table with the same client, had
  // none. The Space card does gate (spaces/[slug]/opengraph-image.tsx) and falls back to an
  // identity-free card, which is the pattern copied here.
  //
  // 🔴 THE GATE MIRRORS THE PAGE'S READABILITY RULE, NOT generateMetadata's INDEXABILITY RULE (ADR-1180), and
  // getting that backwards is a regression rather than a fix. `generateMetadata` noindexes anything
  // that is not strictly `public` — correct for a CRAWLER. But this card's question is different: may
  // the person who was SENT this link see it? `unlisted` exists precisely to be shared by link —
  // 20260612000000_events_visibility_rls.sql says so in words, "unlisted → readable by anyone WITH
  // THE LINK", and page.tsx:587 notFound()s only `private` while `circle_only` needs membership.
  // Neutralising the card for `unlisted` would blank the share preview for the exact events whose
  // whole distribution model is someone pasting the link. (Caught by checking production before
  // merge: the event this whole thread began with is `unlisted`, so the first version of this gate
  // would have broken the very card it was written to protect.)
  //
  // ⚪ `is_cancelled` is deliberately NOT part of the gate either. A cancelled public event is still
  // public, people have already shared its link, and the card has a "Cancelled" chip built for
  // precisely that — telling a recipient it is off is the useful answer, not hiding it.
  const linkReadable = ev?.visibility === 'public' || ev?.visibility === 'unlisted'
  const isPublic = linkReadable && (ev?.status ?? 'published') === 'published' && !ev?.removed_at

  if (!ev || !isPublic) {
    return neutralCard()
  }

  const title = ev?.title?.trim() || `An event on ${SITE_NAME}`
  const when = ev?.starts_at
    ? new Date(ev.starts_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  // ⚠️ NEVER `ev.location` directly — that is the host's free-text line and it routinely carries the
  // street. `publicVisibleLocation` is the ONE rule (SCAN-209) and it collapses to the city line when
  // the host set `hide_address`. This card cannot prove the reader is attending, so it never gets the
  // attendee exception the page grants.
  const where = publicVisibleLocation(ev ?? {})?.trim() || null
  const hostName = ev?.host?.display_name?.trim() || null
  const mode = ev?.attendance_mode ?? 'in_person'
  const chip = ev?.is_cancelled
    ? 'Cancelled'
    : mode === 'online'
      ? 'Online'
      : mode === 'hybrid'
        ? 'In person + online'
        : null

  // The event's own artwork — the SAME image the page hero renders, resolved through the one
  // precedence (uploaded public cover → full scanned poster → the scanner's cropped cover;
  // lib/events/hero-url.ts). The shared card fetches + inlines it, and any miss (no artwork, no
  // signed URL, a non-image / oversized / slow fetch) yields the text card, so a crawl can never
  // slow or crash on a broken image.
  const heroUrl = await resolveEventHeroUrl(ev)

  return eventCardResponse({
    title,
    when,
    where,
    hostLine: hostName ? `Hosted by ${hostName}` : null,
    chip,
    isCancelled: Boolean(ev?.is_cancelled),
    coverUrl: heroUrl,
    coverFocus: readEventCoverFocus(ev?.theme),
  })
}
