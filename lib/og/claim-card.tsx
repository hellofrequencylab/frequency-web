import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { loadNunito } from '@/lib/og/load-nunito'
import { SITE_NAME } from '@/lib/site'

// SHARED CLAIM-LINK OG CARD (SEO/AIO). The share card a scraper renders for a seeded entity's claim
// link (/spaces/claim/<token>, /events/claim/<token>, /listings/claim/<token>) — NOT the generic site
// card. It is a MARKETING PITCH aimed at the real owner: the entity's own cover as the background so
// they recognize it, the pitch line "Claim your <noun> on Frequency", the entity DESIGNATOR pill top
// left (Coach / Practitioner / Business / Non Profit / Event), and the Frequency watermark top right.
//
// One place builds the card so every claim route reads the same visual language as the rest of the
// site's OG cards (app/opengraph-image.tsx, the spaces + events cards). Satori has no access to the
// CSS token system, so the DAWN tokens it needs are mirrored here as literals (app/globals.css :root):
// ink #141210 · on-ink #F3EEE3 · primary #E2912F. Voice canon: plain imperative, no em or en dashes.

export const CLAIM_OG_SIZE = { width: 1200, height: 630 } as const

const ON_INK = '#F3EEE3'
const PRIMARY = '#E2912F'

/** Base64-inline a build-time asset under public/ (Satori needs bytes, not a relative URL). */
async function localImage(relPath: string): Promise<string> {
  const clean = relPath.replace(/^\//, '')
  const data = await readFile(join(process.cwd(), 'public', clean))
  const mime = clean.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${data.toString('base64')}`
}

export interface ClaimCardInput {
  /** The entity's own name (the business / event / listing title). */
  name: string
  /** The DESIGNATOR pill, top left: "Coach", "Practitioner", "Business", "Non Profit", "Event". */
  pill: string
  /** The pitch noun: "business", "event", "nonprofit", "listing". Fills "Claim your <noun> on ...". */
  noun: string
  /** A remote cover to fetch + inline (the entity's own image), if any. */
  coverUrl?: string | null
  /** A local placeholder under public/ used when there is no remote cover (deterministic per entity). */
  placeholderRelPath: string
  /** A remote logo/avatar to fetch + inline into the chip, if any. */
  logoUrl?: string | null
  /** The brand accent as a literal hex (Satori cannot resolve token names). */
  accent: string
}

/**
 * Build the claim-link OG ImageResponse. Fetches the entity's own cover + logo (fail-safe to a local
 * placeholder / initials chip), subsets the exact glyphs, and composes the pitch card. Never throws on
 * a missing image, so a crawler's card fetch can never hang or crash.
 */
export async function claimCardResponse(input: ClaimCardInput): Promise<ImageResponse> {
  const name = input.name.trim() || 'Your business'
  const displayName = name.length > 44 ? `${name.slice(0, 41)}...` : name
  const accent = /^#[0-9a-fA-F]{6}$/.test(input.accent) ? input.accent : PRIMARY
  const pitch = `Claim your ${input.noun} on ${SITE_NAME}`

  const [remoteCover, logo, mark] = await Promise.all([
    input.coverUrl ? fetchRemoteImage(input.coverUrl) : Promise.resolve(null),
    input.logoUrl ? fetchRemoteImage(input.logoUrl) : Promise.resolve(null),
    localImage('images/Frequency-Logo-Round-Icon-white.png'),
  ])
  const cover = remoteCover ?? (await localImage(input.placeholderRelPath))
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const [black, bold] = await Promise.all([
    loadNunito(900, displayName),
    loadNunito(700, `${pitch}${input.pill}${initials}`),
  ])
  const fonts = [
    { name: 'Nunito', data: black, weight: 900 as const, style: 'normal' as const },
    { name: 'Nunito', data: bold, weight: 700 as const, style: 'normal' as const },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Nunito' }}>
        {/* The entity's own cover as the background (the recognizable identity). */}
        <img
          src={cover}
          alt=""
          width={CLAIM_OG_SIZE.width}
          height={CLAIM_OG_SIZE.height}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Legibility scrim: a touch at the top so the pill + watermark read, heavy at the bottom for
            the lockup. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(180deg, rgba(20,18,16,0.55) 0%, rgba(20,18,16,0.20) 30%, rgba(20,18,16,0.50) 66%, rgba(20,18,16,0.90) 100%)',
          }}
        />

        {/* Top-left: the entity DESIGNATOR pill. */}
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 56,
            display: 'flex',
            padding: '10px 22px',
            borderRadius: 9999,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: ON_INK,
            backgroundColor: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.40)',
          }}
        >
          {input.pill}
        </div>

        {/* Top-right: the Frequency watermark. */}
        <img
          src={mark}
          alt=""
          width={76}
          height={76}
          style={{ position: 'absolute', top: 44, right: 56, width: 76, height: 76, opacity: 0.96 }}
        />

        {/* Bottom-left lockup: logo chip + accent bar + entity name + the pitch line. */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            width: '100%',
            height: '100%',
            padding: 64,
            gap: 32,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 140,
              height: 140,
              borderRadius: 26,
              backgroundColor: '#FFFFFF',
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {logo ? (
              <img src={logo} alt="" width={140} height={140} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ display: 'flex', fontWeight: 700, fontSize: 58, color: accent }}>{initials}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
            <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: accent, marginBottom: 18 }} />
            <div
              style={{
                display: 'flex',
                fontSize: displayName.length > 24 ? 58 : 72,
                fontWeight: 900,
                lineHeight: 1.04,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                textShadow: '0 2px 24px rgba(0,0,0,0.55)',
                maxWidth: 900,
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1.25,
                marginTop: 14,
                color: ON_INK,
                textShadow: '0 1px 12px rgba(0,0,0,0.6)',
                maxWidth: 900,
              }}
            >
              {pitch}
            </div>
          </div>
        </div>

        {/* A thin brand keyline along the bottom edge in the accent, tying the card to the network. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, backgroundColor: accent }} />
      </div>
    ),
    { ...CLAIM_OG_SIZE, fonts },
  )
}
