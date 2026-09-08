/* eslint-disable @next/next/no-img-element -- Satori/ImageResponse renders raw elements; next/image cannot run inside an OG ImageResponse */
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { siteMarkDataUrl } from '@/lib/og/local-image'
import { loadNunito } from '@/lib/og/load-nunito'
import { cardResponse } from '@/lib/og/deliver'
import { SITE_NAME } from '@/lib/site'

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
// Satori has NO access to the CSS token system, so the few colors it needs are literals mirroring
// the existing event cards: events indigo #6366f1 accent, near-black ground, white display type.

export const EVENT_CARD_SIZE = { width: 1200, height: 630 } as const

const INDIGO = '#6366f1'

/** The one focal point a card falls back to when the operator set none. */
export const DEFAULT_COVER_FOCUS = '50% 50%'

export type EventCardInput = {
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
  /** Cancelled reads in a muted warning tone; every other chip rides the indigo brand surface. */
  isCancelled: boolean
  /** A remote, fetchable cover URL. Null renders the brand text card. */
  coverUrl?: string | null
  /** `events.theme.coverFocus` ("x% y%"), so every shared crop matches the page hero. */
  coverFocus?: string | null
}

function chipElement(input: EventCardInput) {
  if (!input.chip) return null
  return (
    <div
      style={{
        display: 'flex',
        alignSelf: 'flex-start',
        marginBottom: 18,
        padding: '8px 18px',
        borderRadius: 9999,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: input.isCancelled ? '#fca5a5' : '#c7d2fe',
        backgroundColor: input.isCancelled ? 'rgba(248,113,113,0.16)' : 'rgba(99,102,241,0.22)',
      }}
    >
      {input.chip}
    </div>
  )
}

/** The brand-styled TEXT card: no artwork, or the artwork failed to fetch. Built-in font only, so
 *  it can never slow or fail a crawl. */
function textCard(input: EventCardInput) {
  const title = input.title
  const where = input.where && input.where.length > 60 ? `${input.where.slice(0, 57)}…` : input.where
  return (
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
        {chipElement(input)}
        <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: INDIGO, marginBottom: 28 }} />
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 60 ? 52 : 68,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            maxWidth: 1040,
          }}
        >
          {title.length > 110 ? `${title.slice(0, 107)}…` : title}
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 30, marginTop: 22, color: 'rgba(255,255,255,0.9)', flexWrap: 'wrap', maxWidth: 1040 }}>
          {input.when && <span>{input.when}</span>}
          {where && <span>· {where}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
        {input.hostLine ?? 'A community gathering'}
      </div>
    </div>
  )
}

/**
 * Render an event's share card and deliver it through `cardResponse` (JPEG + the CDN headers).
 *
 * When a cover is supplied and fetchable, the card LEADS with it: the image across the full
 * 1200x630 canvas, the identity lockup over a legibility scrim, the Frequency mark top right — the
 * same visual language as the Space card. Any miss (no cover, a non-image, an oversized or slow
 * fetch) falls back to the brand text card, so a crawl can never slow or crash on a broken image.
 *
 * ⚠️ NEVER THROWS ON A MISSING IMAGE, and that is load-bearing for both callers: one of them is
 * prerendered-adjacent and the other is fetched by every crawler that meets the page.
 */
export async function eventCardResponse(input: EventCardInput): Promise<Response> {
  // Fetched + inlined because Satori needs bytes, not a remote src. Null on ANY problem.
  const cover = input.coverUrl ? await fetchRemoteImage(input.coverUrl) : null

  if (!cover) return cardResponse(textCard(input), { ...EVENT_CARD_SIZE })

  const displayTitle = input.title.length > 90 ? `${input.title.slice(0, 87)}…` : input.title
  const displayWhere = input.where && input.where.length > 56 ? `${input.where.slice(0, 53)}…` : input.where
  const metaLine = [input.when, displayWhere].filter(Boolean).join('  ·  ')

  // FULL Nunito faces read from public/fonts, memoised per process (lib/og/load-nunito.ts). Not
  // subsets: subsetting to the card's own glyphs rendered a name containing anything outside that
  // subset as tofu. And loadNunito CAN reject if public/fonts is missing from the bundle, which
  // returns a 500 and gets the previewer a text card. That is deliberate and recoverable, unlike
  // handing Satori an empty `fonts` array, which crashes it inside fontFamily.split().
  const [black, bold, mark] = await Promise.all([loadNunito(900), loadNunito(700), siteMarkDataUrl()])
  const fonts = [
    { name: 'Nunito', data: black, weight: 900 as const, style: 'normal' as const },
    { name: 'Nunito', data: bold, weight: 700 as const, style: 'normal' as const },
  ]

  return cardResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Nunito' }}>
        {/* Poster/cover background — the event's own image. */}
        <img
          src={cover}
          alt=""
          width={EVENT_CARD_SIZE.width}
          height={EVENT_CARD_SIZE.height}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // The SAME focal point the event page hero and the claim card apply
            // (events.theme.coverFocus), so every shared crop of this poster matches the page.
            objectPosition: input.coverFocus || DEFAULT_COVER_FOCUS,
          }}
        />
        {/* Ink legibility scrim: bottom-heavy fade so the identity clears any photo while the top
            stays crisp (the same treatment as the Space card). */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(180deg, rgba(13,13,18,0.16) 0%, rgba(13,13,18,0.34) 44%, rgba(13,13,18,0.80) 76%, rgba(13,13,18,0.94) 100%)',
          }}
        />
        {/* The Frequency mark, top-right — quiet network attribution. */}
        <img
          src={mark}
          alt=""
          width={72}
          height={72}
          style={{ position: 'absolute', top: 48, right: 56, width: 72, height: 72, opacity: 0.95 }}
        />
        {/* Identity lockup anchored bottom-left over the scrim: chip · accent bar · title · when/where · host. */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            width: '100%',
            height: '100%',
            padding: 64,
          }}
        >
          {chipElement(input)}
          <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: INDIGO, marginBottom: 20 }} />
          <div
            style={{
              display: 'flex',
              fontSize: displayTitle.length > 42 ? 56 : 72,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              textShadow: '0 2px 24px rgba(0,0,0,0.55)',
              maxWidth: 1000,
            }}
          >
            {displayTitle}
          </div>
          {metaLine && (
            <div
              style={{
                display: 'flex',
                fontSize: 30,
                fontWeight: 700,
                marginTop: 16,
                color: 'rgba(243,243,255,0.94)',
                textShadow: '0 1px 12px rgba(0,0,0,0.6)',
                maxWidth: 1000,
              }}
            >
              {metaLine}
            </div>
          )}
          {input.hostLine && (
            <div
              style={{
                display: 'flex',
                fontSize: 26,
                fontWeight: 700,
                marginTop: 12,
                color: 'rgba(243,243,255,0.78)',
                textShadow: '0 1px 12px rgba(0,0,0,0.6)',
              }}
            >
              {input.hostLine}
            </div>
          )}
        </div>
      </div>
    ),
    { ...EVENT_CARD_SIZE, fonts },
  )
}
