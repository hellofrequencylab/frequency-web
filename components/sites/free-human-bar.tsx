import { templeKitAnnounce, templeKitBarLinks } from '@/lib/sites/temple-kit-chrome'
import type { SiteFooter } from '@/lib/sites/site-footer'

// THE FREE HUMAN ANNOUNCE BAR (design: the 38px night strip over the header). A breathing halo and one lyric line on the left (the
// Space's own line, or its next gathering) that opens the calendar, a few small links on the right from 900px. A Space with nothing
// to announce gets no bar. The words and the choice are Temple Kit's pure helpers (lib/sites/temple-kit-chrome.ts).

export function FreeHumanBar({ next, links, utility = null, calendarHref = null }: { next: { title: string; startsAt: string } | null; links: { label: string; href: string; external?: boolean }[]; utility?: SiteFooter['utility'] | null; calendarHref?: string | null }) {
  const line = templeKitAnnounce(utility, next)
  if (!line) return null
  const small = templeKitBarLinks(links, utility)
  const text = (
    <>
      <i className="fh-halo fh-breathe" aria-hidden />
      <span>{line}</span>
      {calendarHref && <span className="fh-bar-more"> &middot; See the calendar &rarr;</span>}
    </>
  )
  return (
    <div className="fh-bar">
      <div className="fh-bar-row">
        <p className="fh-bar-line">{calendarHref ? <a href={calendarHref}>{text}</a> : text}</p>
        {small.length > 0 && (
          <nav className="fh-bar-links" aria-label="More">
            {calendarHref && <a href={calendarHref}>Calendar</a>}
            {small.map((l) => (
              <a key={`${l.href}:${l.label}`} href={l.href} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {l.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
