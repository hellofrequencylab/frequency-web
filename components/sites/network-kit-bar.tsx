import { dateLabel } from '@/lib/sites/menswork-page'

// The Network Theme Kit announce bar (design: the 40px bar over the header): one accent dot and the next gathering
// on the left, a few small links on the right at 1240px and up. It folds away once the page scrolls
// (network-kit-header-state.tsx sets data-scrolled; the skin does the rest). With nothing to announce and no links
// it draws nothing, so a site never carries a placeholder line.

export type NetworkKitBarLink = { label: string; href: string; external?: boolean }

const SMALL_LINK = /^(gift|the letter|letter|newsletter|about|contact)/i

/** The links the bar carries: the site's own Gift cards, Letter, About and Contact pages, at most four. */
export function networkKitBarLinks(links: NetworkKitBarLink[]): NetworkKitBarLink[] {
  return links.filter((l) => SMALL_LINK.test(l.label.trim())).slice(0, 4)
}

export function NetworkKitBar({ next, links, utility = null }: { next: { title: string; startsAt: string } | null; links: NetworkKitBarLink[]; utility?: { left: string | null; items: { label: string; href: string | null }[] } | null }) {
  const when = next ? dateLabel(next.startsAt) : null
  const small = utility?.items.length ? utility.items.flatMap((i): NetworkKitBarLink[] => (i.href ? [{ label: i.label, href: i.href }] : [])) : networkKitBarLinks(links)
  const now = utility?.left ?? (next ? `Next up: ${next.title}${when ? `, ${when.day}` : ''}` : null)
  if (!now && small.length === 0) return null
  return (
    <div className="nk-bar">
      <div className="nk-bar-in">
        {now ? <p className="nk-bar-now"><span>{now}</span></p> : <span />}
        {small.length > 0 && (
          <nav className="nk-bar-links" aria-label="More">
            {small.map((l) => (
              <a key={l.label} href={l.href} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{l.label}</a>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
