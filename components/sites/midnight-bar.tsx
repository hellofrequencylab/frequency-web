import { MidnightSigil } from '@/components/sites/midnight-sigil'
import { midnightMoon } from '@/lib/theme/midnight-moon'
import { dateLabel } from '@/lib/sites/menswork-page'

// The Midnight top bar (design: the thin bar over the header): the moon's phase and the next gathering on the left,
// a few small links on the right. It is not sticky, so it scrolls away under the sticky header, which is how the
// design's bar "collapses". The skin (.mn-bar*) sets every colour and size.

export type MidnightBarLink = { label: string; href: string; external?: boolean }

const SMALL_LINK = /^(gift|the letter|letter|about|contact)/i

/** The links the bar carries: the site's own Gift cards, Letter, About and Contact pages, at most four. */
export function midnightBarLinks(links: MidnightBarLink[]): MidnightBarLink[] {
  return links.filter((l) => SMALL_LINK.test(l.label.trim())).slice(0, 4)
}

export function MidnightBar({ now, next, links }: { now: Date; next: { title: string; startsAt: string } | null; links: MidnightBarLink[] }) {
  const moon = midnightMoon(now)
  const when = next ? dateLabel(next.startsAt) : null
  const small = midnightBarLinks(links)
  return (
    <div className="mn-bar">
      <p className="mn-bar-now">
        <MidnightSigil name={moon.sigil} size={14} />
        <span className="mn-bar-moon">{moon.name}</span>
        {next && <span className="mn-bar-next">{`${next.title}${when ? ` · ${when.day}` : ''}`}</span>}
      </p>
      {small.length > 0 && (
        <nav className="mn-bar-links" aria-label="More">
          {small.map((l) => (
            <a key={l.label} href={l.href} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{l.label}</a>
          ))}
        </nav>
      )}
    </div>
  )
}
