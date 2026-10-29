import { TempleKitSigil } from '@/components/sites/temple-kit-logo'
import { templeKitBarLinks, templeKitAnnounce } from '@/lib/sites/temple-kit-chrome'
import type { SiteFooter } from '@/lib/sites/site-footer'

// THE TEMPLE KIT ANNOUNCE BAR (design: the 36px strip over the header). The mark and one line on the left (the Space's own
// line, or its next gathering), a few small links on the right from 1240px. It sits inside the sticky top block with the header
// and collapses to nothing once the page has scrolled 40px (temple-kit-header-state.tsx sets data-scrolled; the skin does the rest).
// A Space with nothing to announce gets no bar.

export function TempleKitBar({ next, links, utility = null }: { next: { title: string; startsAt: string } | null; links: { label: string; href: string; external?: boolean }[]; utility?: SiteFooter['utility'] | null }) {
  const line = templeKitAnnounce(utility, next)
  if (!line) return null
  const small = templeKitBarLinks(links, utility)
  return (
    <div className="tk-bar">
      <div className="tk-bar-row">
        <p className="tk-bar-line">
          <TempleKitSigil size={13} />
          <span>{line}</span>
        </p>
        {small.length > 0 && (
          <nav className="tk-bar-links" aria-label="More">
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
