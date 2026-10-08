import { MENSWORK_PALETTE, MENSWORK_SEASONS, MENSWORK_SEASON_INFO, type MensworkSeason } from '@/lib/theme/menswork'

// THE MENSWORK WEBSITE'S SHARE CARD (LIVE-870, owner ask 2026-10-08: "Make sure the site has a really well
// designed social share card with the logo on it."). 1200x630, drawn by Satori in the website's own look:
// the charcoal ground, the Space's cover photo fading in from the right, the Space's logo, its name in the
// theme's display face, the website hero's headline with its accent word in the season's colour, and the
// season chevrons over the site's domain. No Frequency mark: a website stands alone (ADR-1723).
//
// Satori cannot read the CSS tokens, so the theme's palette comes from lib/theme/menswork.ts as literals.

export const MENSWORK_CARD_SIZE = { width: 1200, height: 630 }

const P = MENSWORK_PALETTE
const ORDER: MensworkSeason[] = ['winter', 'spring', 'summer', 'fall']

interface MensworkCardInput {
  brandName: string
  /** The hero headline, `*word*` marking the accent word. */
  headline: string | null
  domain: string
  season: MensworkSeason
  /** Inlined data URLs (lib/og/remote-image.ts), or null. */
  logo: string | null
  cover: string | null
}

export function MensworkSiteCard({ brandName, headline, domain, season, logo, cover }: MensworkCardInput) {
  const accent = MENSWORK_SEASONS[season]
  const parts = splitAccent(headline ?? '')
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', backgroundColor: P.charcoal, fontFamily: 'Barlow' }}>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img>
        <img
          src={cover}
          alt=""
          width={760}
          height={630}
          style={{ position: 'absolute', top: 0, right: 0, width: 760, height: 630, objectFit: 'cover' }}
        />
      )}
      {/* The cover fades into the charcoal under the type, and darkens a little overall. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          backgroundImage: `linear-gradient(90deg, ${P.charcoal} 0%, ${P.charcoal} 38%, rgba(17,20,24,0.86) 52%, rgba(17,20,24,0.45) 72%, rgba(17,20,24,0.25) 100%)`,
        }}
      />
      {/* The season's accent edge. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 6,
          height: 630,
          backgroundColor: accent,
        }}
      />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: '56px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img>
            <img src={logo} alt="" width={168} height={168} style={{ width: 168, height: 168, objectFit: 'contain' }} />
          )}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Sofia',
              fontWeight: 800,
              fontSize: 88,
              lineHeight: 0.9,
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
              color: P.primary,
              maxWidth: 560,
            }}
          >
            {brandName}
          </div>
        </div>

        {parts.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              fontFamily: 'Sofia',
              fontWeight: 800,
              fontSize: 64,
              lineHeight: 1,
              textTransform: 'uppercase',
              color: P.primary,
              maxWidth: 580,
            }}
          >
            {parts.map((p, i) => (
              <span key={i} style={{ color: p.accent ? accent : P.primary, whiteSpace: 'pre' }}>
                {p.text}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {ORDER.map((s) => (
              <div
                key={s}
                style={{
                  display: 'flex',
                  width: 112,
                  height: 6,
                  backgroundColor: s === season ? MENSWORK_SEASONS[s] : P.hairline,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, fontSize: 22, letterSpacing: '0.16em', textTransform: 'uppercase', color: P.secondary }}>
            <span style={{ color: accent }}>{MENSWORK_SEASON_INFO[season].name}</span>
            <span>{domain}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The headline as runs, `*word*` set apart (the website hero's accent mark), each run split into words so
 *  Satori can wrap between them. */
function splitAccent(text: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = []
  const re = /\*([^*]+)\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), accent: false })
    out.push({ text: m[1], accent: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false })
  return out.flatMap((r) => r.text.split(/(?<= )/).filter(Boolean).map((w) => ({ text: w, accent: r.accent })))
}
