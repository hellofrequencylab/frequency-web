/* eslint-disable @next/next/no-img-element -- Satori/ImageResponse renders raw elements; next/image cannot run inside an OG ImageResponse */
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { siteMarkDataUrl } from '@/lib/og/local-image'
import { loadStageFonts, STAGE_DISPLAY, STAGE_SANS, STAGE_SERIF } from '@/lib/og/load-stage-fonts'
import { cardResponse } from '@/lib/og/deliver'
import { STAGE } from '@/lib/og/stage-tokens'
import { SITE_URL } from '@/lib/site'

// ── THE ONE SHARE CARD. Every public page type draws it. ──────────────────────────────────────
//
// A link preview is the first thing a stranger sees of Frequency, and it used to be fifteen
// hand-copied layouts in three type systems. This is the single layout, in the dark "Stage" theme of
// the design system (design_handoff/frequency, `[data-theme="stage"]`) and its three faces: Unbounded
// for the title, Instrument Serif italic for the one human line, Hanken Grotesk for the facts.
//
// The routes supply STRINGS and an image; they decide nothing about layout. Visibility and redaction
// stay with each route, exactly as lib/og/event-card.tsx documents: this module reads no database.
//
// LAYOUT (1200x630). 64px safe margins on every side, so no previewer's crop (LinkedIn and iMessage
// trim the edges; Twitter trims the sides on a small card) can clip type. Top row: kicker pill left,
// Frequency mark right. Bottom block: iridescent rule, title (Unbounded, at most three lines,
// ellipsised), one serif-italic line, then the facts row with the host line left and the domain right.
//
// WITH AN IMAGE the entity's own picture runs full-bleed under a Stage scrim: cool-tinted at the top
// so the pill reads, near-solid Stage canvas at the bottom so the title clears any photograph. WITHOUT
// ONE the card is the branded fallback: the Stage canvas with the aura (sky, magenta, aqua) and a
// pastel orb, so a card with nothing to show still looks like Frequency rather than a blank rectangle.
//
// ⚠️ SATORI RULES THIS FILE OBEYS: every div that holds more than one child is `display: flex`, every
// scrim has an explicit box and `display` (an `inset: 0` div with no display collapses to 0x0 and
// draws nothing, LIVE-183), and every image src is a data URL from fetchRemoteImage / local-image.

const STAGE_CARD_SIZE = { width: 1200, height: 630 } as const

const MARGIN = 64

// The logo chip's corner, mirroring `--radius-cover` (app/globals.css :root, 24px): a Space's logo chip is
// identity media and stays round on every theme (ADR-1192). Pinned to the token by
// app/(main)/spaces/[slug]/accent-scope-coverage.test.ts (LIVE-196).
const COVER_RADIUS = 24

type StageCardInput = {
  /** The designator pill, top left: "Event", "Space", "Circle", "Journey". */
  kicker: string
  /** The entity's name. Clamped, never overflows. */
  title: string
  /** The single serif-italic line: a tagline, a pitch, the date. */
  line?: string | null
  /** The facts row, left: "Sat 8 Nov · Encinitas", "42 members". */
  meta?: string | null
  /** A status chip above the title ("Cancelled", "Online"). */
  chip?: string | null
  /** Cancelled reads in a muted warning tone; every other chip rides the Stage glass surface. */
  chipIsWarning?: boolean
  /** A data URL, or null for the branded fallback. */
  cover?: string | null
  /** "x% y%", so the shared crop matches the page hero. */
  coverFocus?: string | null
  /** A data URL for the logo chip (Spaces and claim links). */
  logo?: string | null
  /** Initials drawn in the logo chip when `logo` is null. Omit both for no chip at all. */
  initials?: string | null
  /** The operator's own hex, when they set one: tints the logo-chip initials only. */
  accent?: string | null
}

/** Cut a string to a hard cap on a word boundary where one is near, adding an ellipsis. */
function clampText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** Unbounded is a wide face (~0.8em a glyph), so the size steps down with length, not with the box. */
function titleSize(title: string): number {
  if (title.length <= 18) return 72
  if (title.length <= 34) return 60
  if (title.length <= 56) return 50
  return 42
}

const HOST = SITE_URL.replace(/^https?:\/\//, '')

function Fallback() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: STAGE.canvas,
        backgroundImage: `radial-gradient(circle at 82% 8%, rgba(163,212,255,0.40) 0%, rgba(139,92,255,0) 46%), radial-gradient(circle at 96% 62%, rgba(255,43,214,0.30) 0%, rgba(255,43,214,0) 42%), radial-gradient(circle at 58% 108%, rgba(61,242,255,0.26) 0%, rgba(61,242,255,0) 48%)`,
      }}
    >
      {/* The pastel orb: the design system's --pa-orb, large and quiet behind the title. */}
      <div
        style={{
          position: 'absolute',
          top: 104,
          right: 128,
          width: 232,
          height: 232,
          borderRadius: 9999,
          display: 'flex',
          opacity: 0.9,
          backgroundImage: 'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #E6CDF4 26%, #B3C6FF 58%, #8FE9FF 100%)',
          boxShadow: '0 0 120px rgba(163,212,255,0.45)',
        }}
      />
    </div>
  )
}

function stageCardElement(input: StageCardInput, mark: string) {
  const title = clampText(input.title, 72)
  const line = input.line ? clampText(input.line, 110) : null
  const meta = input.meta ? clampText(input.meta, 70) : null
  const hasChip = !!(input.logo || input.initials)
  const initialsColor = input.accent && /^#[0-9a-fA-F]{6}$/.test(input.accent) ? input.accent : STAGE.raised

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        backgroundColor: STAGE.canvas,
        color: STAGE.text,
        fontFamily: STAGE_SANS,
      }}
    >
      {input.cover ? (
        <img
          src={input.cover}
          alt=""
          width={STAGE_CARD_SIZE.width}
          height={STAGE_CARD_SIZE.height}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: input.coverFocus || '50% 50%',
          }}
        />
      ) : (
        <Fallback />
      )}
      {/* Stage scrim: only over a photograph. Violet-tinted top, near-canvas bottom. */}
      {input.cover && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            backgroundImage:
              'linear-gradient(180deg, rgba(7,11,20,0.58) 0%, rgba(7,11,20,0.44) 24%, rgba(7,11,20,0.78) 56%, rgba(7,11,20,0.94) 82%, rgba(7,11,20,0.98) 100%)',
          }}
        />
      )}

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: `56px ${MARGIN}px`,
        }}
      >
        {/* Top row: kicker pill, Frequency mark. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 9999,
              fontFamily: STAGE_DISPLAY,
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: STAGE.text,
              backgroundColor: 'rgba(18,28,46,0.72)',
              border: `1px solid ${STAGE.border}`,
            }}
          >
            {input.kicker}
          </div>
          <img src={mark} alt="" width={64} height={64} style={{ width: 64, height: 64 }} />
        </div>

        {/* Bottom block. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32 }}>
          {hasChip && (
            <div
              style={{
                display: 'flex',
                width: 132,
                height: 132,
                borderRadius: COVER_RADIUS,
                backgroundColor: STAGE.text,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              }}
            >
              {input.logo ? (
                <img src={input.logo} alt="" width={132} height={132} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', fontFamily: STAGE_DISPLAY, fontWeight: 700, fontSize: 48, color: initialsColor }}>
                  {input.initials}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
            {input.chip && (
              <div
                style={{
                  display: 'flex',
                  alignSelf: 'flex-start',
                  marginBottom: 16,
                  padding: '6px 16px',
                  borderRadius: 9999,
                  fontWeight: 700,
                  fontSize: 22,
                  color: input.chipIsWarning ? STAGE.danger : STAGE.ink,
                  // One property, never `undefined`: Satori trims every style value and throws on it.
                  ...(input.chipIsWarning ? { backgroundColor: STAGE.dangerBg } : { backgroundImage: STAGE.pastel }),
                }}
              >
                {input.chip}
              </div>
            )}
            <div style={{ width: 96, height: 6, borderRadius: 9999, marginBottom: 20, display: 'flex', backgroundImage: STAGE.iridescent }} />
            <div
              style={{
                display: 'flex',
                fontFamily: STAGE_DISPLAY,
                fontWeight: 700,
                fontSize: titleSize(title),
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: STAGE.text,
                maxWidth: hasChip ? 960 - 164 : 1000,
              }}
            >
              {title}
            </div>
            {line && (
              <div
                style={{
                  display: 'flex',
                  marginTop: 14,
                  fontFamily: STAGE_SERIF,
                  fontStyle: 'italic',
                  fontWeight: 400,
                  fontSize: 38,
                  lineHeight: 1.2,
                  color: STAGE.body,
                  maxWidth: hasChip ? 960 - 164 : 1000,
                }}
              >
                {line}
              </div>
            )}
            <div style={{ display: 'flex', marginTop: 20, alignItems: 'center', justifyContent: 'space-between', fontSize: 24, fontWeight: 500 }}>
              <div style={{ display: 'flex', color: STAGE.muted, maxWidth: 760 }}>{meta ?? ''}</div>
              <div style={{ display: 'flex', fontWeight: 700, color: STAGE.text }}>{HOST}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** What a route hands over: strings plus URLs to fetch. */
type StageCardRequest = Omit<StageCardInput, 'cover' | 'logo'> & {
  /** A remote image URL to fetch and inline; any failure falls back to `coverPlaceholder`, then the branded card. */
  coverUrl?: string | null
  /** An already-inlined data URL (a local placeholder photo) used when `coverUrl` is absent or unreadable. */
  coverPlaceholder?: string | null
  logoUrl?: string | null
}

/** Render the card and deliver it as a cached JPEG. Never throws on a bad image. */
export async function stageCardResponse(req: StageCardRequest): Promise<Response> {
  const [remoteCover, logo, mark, fonts] = await Promise.all([
    req.coverUrl ? fetchRemoteImage(req.coverUrl) : Promise.resolve(null),
    req.logoUrl ? fetchRemoteImage(req.logoUrl) : Promise.resolve(null),
    siteMarkDataUrl(),
    loadStageFonts(),
  ])
  const { coverUrl: _c, coverPlaceholder, logoUrl: _l, ...rest } = req
  void _c
  void _l
  return cardResponse(stageCardElement({ ...rest, cover: remoteCover ?? coverPlaceholder ?? null, logo }, mark), {
    ...STAGE_CARD_SIZE,
    fonts,
  })
}
