/* eslint-disable @next/next/no-img-element -- Satori/ImageResponse renders raw elements; next/image cannot run inside an OG ImageResponse */
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { siteMarkDataUrl } from '@/lib/og/site-mark'
import { loadStageFonts, STAGE_DISPLAY, STAGE_SANS } from '@/lib/og/load-stage-fonts'
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
  /** The badge, top right ("Free", "$48", "Open to join", "Cancelled"). `chip` is the older name for it. */
  badge?: string | null
  chip?: string | null
  /** Up to three small tags, bottom left above the title ("In person", "Breathwork"). */
  tags?: string[] | null
  /** The action drawn as a button, bottom right ("RSVP", "Join", "View"). The preview itself is flat; the tap opens the page. */
  cta?: string | null
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
  if (title.length <= 14) return 68
  if (title.length <= 26) return 56
  if (title.length <= 44) return 48
  return 40
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

/** One pill size for the whole card: the type, the badge and every tag share a height, a face and white text. */
const PILL_H = 48
const pillBase = {
  display: 'flex',
  alignItems: 'center',
  height: PILL_H,
  padding: '0 24px',
  borderRadius: 9999,
  fontFamily: STAGE_SANS,
  fontWeight: 700,
  fontSize: 22,
  lineHeight: 1,
  color: '#FFFFFF',
} as const

// Pink to blue, deep enough that white type clears contrast on it. The brand's magenta and sky, angled.
const PILL_FILL = 'linear-gradient(115deg, #C42FB6 0%, #3F7CF0 100%)'
const PILL_GLASS = 'rgba(8,13,30,0.62)'

function Orb({ size, top, left, right, tint }: { size: number; top: number; left?: number; right?: number; tint: 'pink' | 'blue' }) {
  const fill =
    tint === 'pink'
      ? 'radial-gradient(circle at 34% 30%, #FFFFFF 0%, #FFD9EF 22%, #FFB8EE 44%, #B3C6FF 78%, #8FE9FF 100%)'
      : 'radial-gradient(circle at 34% 30%, #FFFFFF 0%, #D6EBFF 24%, #A3D4FF 52%, #8FE9FF 100%)'
  return (
    <div
      style={{
        position: 'absolute',
        top,
        ...(left !== undefined ? { left } : {}),
        ...(right !== undefined ? { right } : {}),
        width: size,
        height: size,
        borderRadius: 9999,
        display: 'flex',
        backgroundImage: fill,
        boxShadow: tint === 'pink' ? '0 0 60px rgba(255,155,216,0.65)' : '0 0 60px rgba(143,233,255,0.6)',
      }}
    />
  )
}

function fill(extra: Record<string, string | number>) {
  return { position: 'absolute', top: 0, left: 0, width: STAGE_CARD_SIZE.width, height: STAGE_CARD_SIZE.height, display: 'flex', ...extra } as const
}

function stageCardElement(input: StageCardInput, mark: string) {
  const title = clampText(input.title, 72)
  const line = input.line ? clampText(input.line, 90) : null
  const meta = input.meta ? clampText(input.meta, 80) : null
  const badge = input.badge ?? input.chip ?? null
  const tags = (input.tags ?? []).filter(Boolean).slice(0, 3).map((t) => clampText(t, 22))
  const hasChip = !!(input.logo || input.initials)
  const initialsColor = input.accent && /^#[0-9a-fA-F]{6}$/.test(input.accent) ? input.accent : STAGE.raised
  // The title column stops short of the button column, so the two can never overlap.
  const textMax = (input.cta ? 1200 - 2 * MARGIN - 250 : 1200 - 2 * MARGIN) - (hasChip ? 148 : 0)

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
      {input.cover && (
        <>
          {/* Angled colour wash: magenta in from the top left, sky in from the top right. */}
          <div style={fill({ backgroundImage: 'linear-gradient(135deg, rgba(255,43,214,0.46) 0%, rgba(255,43,214,0) 46%)' })} />
          <div style={fill({ backgroundImage: 'linear-gradient(225deg, rgba(120,170,255,0.55) 0%, rgba(120,170,255,0) 50%)' })} />
          {/* The details sit on a dark gradient that rises at an angle, heavier at the left where the words are. */}
          <div
            style={fill({
              backgroundImage:
                'linear-gradient(180deg, rgba(7,11,20,0) 36%, rgba(7,11,20,0.7) 58%, rgba(8,12,30,0.94) 78%, rgba(7,11,20,1) 100%)',
            })}
          />
        </>
      )}
      {/* Angle: the dark leans in from the lower left, so the words sit in the deepest part. */}
      <div style={fill({ backgroundImage: 'linear-gradient(75deg, rgba(7,11,20,0.34) 0%, rgba(7,11,20,0.1) 45%, rgba(7,11,20,0) 70%)' })} />
      {/* Depth: a pink bloom bottom left and a blue one bottom right, under the words and the button. */}
      <div
        style={fill({
          backgroundImage:
            'radial-gradient(circle at 6% 112%, rgba(255,43,214,0.24) 0%, rgba(255,43,214,0) 46%), radial-gradient(circle at 96% 116%, rgba(61,242,255,0.2) 0%, rgba(61,242,255,0) 44%)',
        })}
      />
      {/* Orbs: mirrored left and right of the middle, clear of the pills and the type. */}
      <Orb size={84} top={132} left={84} tint="blue" />
      <Orb size={84} top={132} right={84} tint="pink" />
      <Orb size={30} top={206} left={196} tint="pink" />
      <Orb size={30} top={206} right={196} tint="blue" />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: `48px ${MARGIN}px`,
        }}
      >
        {/* Top row: type left, badge (or the Frequency mark) right. Same height, same margins. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              ...pillBase,
              backgroundImage: PILL_FILL,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontSize: 20,
              boxShadow: '0 0 36px rgba(163,212,255,0.45)',
            }}
          >
            {input.kicker}
          </div>
          {badge ? (
            <div
              style={{
                ...pillBase,
                ...(input.chipIsWarning
                  ? { backgroundColor: STAGE.dangerBg, border: `1.5px solid ${STAGE.danger}` }
                  : { backgroundColor: PILL_GLASS, border: '1.5px solid rgba(163,212,255,0.75)' }),
                boxShadow: '0 0 36px rgba(255,155,216,0.35)',
              }}
            >
              {clampText(badge, 24)}
            </div>
          ) : (
            <img src={mark} alt="" width={PILL_H} height={PILL_H} style={{ width: PILL_H, height: PILL_H }} />
          )}
        </div>

        {/* Bottom block: the message on the left, the action on the right. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
            {hasChip && (
              <div
                style={{
                  display: 'flex',
                  width: 120,
                  height: 120,
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
                  <img src={input.logo} alt="" width={120} height={120} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', fontFamily: STAGE_DISPLAY, fontWeight: 700, fontSize: 44, color: initialsColor }}>
                    {input.initials}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: textMax }}>
              {tags.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  {tags.map((t) => (
                    <div key={t} style={{ ...pillBase, backgroundColor: PILL_GLASS, border: '1.5px solid rgba(255,255,255,0.38)' }}>
                      {t}
                    </div>
                  ))}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  fontFamily: STAGE_DISPLAY,
                  fontWeight: 700,
                  fontSize: titleSize(title),
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  textShadow: '0 4px 28px rgba(0,0,0,0.45)',
                }}
              >
                {title}
              </div>
              {line && (
                <div style={{ display: 'flex', marginTop: 14, fontWeight: 500, fontSize: 30, lineHeight: 1.25, color: '#E6ECF8' }}>{line}</div>
              )}
              {meta && (
                <div style={{ display: 'flex', marginTop: 12, fontWeight: 500, fontSize: 23, color: '#B9C5DB' }}>{meta}</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
            {input.cta && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 68,
                  padding: '0 44px',
                  borderRadius: 9999,
                  fontFamily: STAGE_DISPLAY,
                  fontWeight: 700,
                  fontSize: 28,
                  color: STAGE.ink,
                  backgroundImage: STAGE.pastel,
                  boxShadow: '0 0 54px rgba(255,155,216,0.5), 0 0 90px rgba(163,212,255,0.45)',
                }}
              >
                {input.cta}
              </div>
            )}
            <div style={{ display: 'flex', marginTop: input.cta ? 16 : 0, fontWeight: 700, fontSize: 20, color: '#B9C5DB' }}>{HOST}</div>
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
