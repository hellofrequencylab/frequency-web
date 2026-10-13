import { sky } from '@/lib/theme/astrology-wheel'
import { dateLabel } from '@/lib/sites/menswork-page'
import { WhGlyph, WhMoon } from './wildheart-symbols'

// THE DATE LINE (owner brief 2026-10-12: "the date line at the top of every page"). A Server Component that
// reads one date and prints season and its theme, the sign with its glyph, the house, and the moon, as a
// tracked-caps eyebrow. The Wildheart chrome draws it under the header on every page (WildheartSubBar), and
// the WildheartNowLine block places it inside a page. Every word is the sky's; the one Space fact is the
// Space's own next event, labelled generically.

export function WildheartNowLine({ date = new Date(), show = ['season', 'sign', 'house', 'moon'] }: { date?: Date; show?: readonly ('season' | 'sign' | 'house' | 'moon')[] }) {
  const s = sky(date)
  const parts: [string, React.ReactNode][] = []
  if (show.includes('season')) parts.push(['season', <span key="season" className="wh-nowline-season">{s.seasonName} · {s.seasonTheme}</span>])
  if (show.includes('sign')) parts.push(['sign', <span key="sign"><WhGlyph name={s.sign} size={14} />{s.signName}</span>])
  if (show.includes('house')) parts.push(['house', <span key="house">{s.house} · {s.houseName}</span>])
  if (show.includes('moon')) parts.push(['moon', <span key="moon" className="wh-nowline-moon"><WhMoon phase={s.phase} size={12} />{s.phaseName}</span>])
  return (
    <p className="wh-nowline">
      {parts.map(([key, p], i) => (
        // Each part with its own leading dot, so a theme can hide one part whole (the house on a phone).
        <span key={key} className={`wh-nowline-part wh-nowline-${key}-part`} style={{ display: 'contents' }}>
          {i > 0 && <span className="wh-nowline-dot" aria-hidden="true" />}
          {p}
        </span>
      ))}
    </p>
  )
}

/** The bar under a Wildheart site's header: the date line, and the Space's next event when it has one. */
export function WildheartSubBar({ date = new Date(), next }: { date?: Date; next: { title: string; startsAt: string } | null }) {
  const when = next ? dateLabel(next.startsAt) : null
  return (
    <div className="hs-season">
      <div className="hs-season-now">
        <WildheartNowLine date={date} />
      </div>
      {next && when && (
        <p className="hs-season-next">
          <span>Next · {next.title}</span> {when.day}
          {when.time ? ` · ${when.time}` : ''}
        </p>
      )}
    </div>
  )
}
