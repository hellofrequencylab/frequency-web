// THE FREQUENCY PUBLIC FOOTER (`footer.ft2`, identical on every template page). Server component; the one
// client island is the Pause motion button.
// The logo sheen and the roundel beside "Your people stay yours." are what fx.js adds after load; here
// they are in the markup from the start. Links: lib/frequency/site-nav.ts (a link with no route yet is
// left out).

import Image from 'next/image'
import Link from 'next/link'
import { FOOTER_COLUMNS, FOOTER_LEGAL, ROUTES } from '@/lib/frequency/site-nav'
import { JsonLd } from '@/components/json-ld'
import { MotionPause } from '@/components/frequency/site/shell/motion-pause'
import { siteNavigationSchema } from '@/lib/jsonld'
import { CONTACT_EMAIL, SOCIAL_PROFILES, SITE_SIGNOFF, socialLabel } from '@/lib/site'

const WORDMARK = '/brand/frequency/frequency-wordmark.png'

// The index is also written as SiteNavigationElement JSON-LD (siteNavigationSchema), from the SAME columns the
// footer draws, so the structured data cannot name a link the page does not show (LIVE-1030).
const INDEX = [
  ...FOOTER_COLUMNS.map((c) => ({ title: c.heading, links: c.links.filter((l) => l.href).map((l) => ({ label: l.label, href: l.href! })) })),
  { title: 'Legal', links: FOOTER_LEGAL.map((l) => ({ label: l.label, href: l.href! })) },
]

const QUICK_LINKS = [
  { label: 'Discover', href: ROUTES.happening },
  { label: 'For Spaces', href: ROUTES.spaces },
  { label: 'Pricing', href: ROUTES.pricing },
  { label: 'Help', href: ROUTES.help },
  { label: 'About', href: ROUTES.about },
]

export function SiteFooter() {
  return (
    <footer className="ft2">
      <JsonLd data={siteNavigationSchema(INDEX)} />
      <div className="wrap">
        <div className="ft2-top">
          <div className="ft2-brand">
            <Link href={ROUTES.home} aria-label="Frequency home" className="lg-fx">
              <Image className="w" src={WORDMARK} alt="Frequency Community Collective" width={1920} height={389} sizes="176px" loading="lazy" />
              <span className="lg-sheen" aria-hidden="true" style={{ '--fq-lg': `url("${WORDMARK}")` } as React.CSSProperties} />
            </Link>
            <p>
              {SITE_SIGNOFF} Find community around a walk, a class or a gathering near you.
            </p>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href={ROUTES.join}>
                Get started
              </Link>
            </div>
          </div>
          <div className="ft2-main">
            {/* The five links that matter, always visible. Everything else sits behind a native fold: it is
                in the HTML for crawlers and keyboard users, and a click away for a person (menu strategy
                2026-11-03). The SiteNavigationElement JSON-LD above still lists every column. */}
            <nav className="ft2-quick" aria-label="Footer quick links">
              {QUICK_LINKS.map((l) => (
                <Link key={l.label} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
            <details className="ft2-more">
              <summary>More from Frequency</summary>
              <nav className="ft2-cols" aria-label="Footer">
                {FOOTER_COLUMNS.map((col) => (
                  <div key={col.heading}>
                    <b role="heading" aria-level={2}>{col.heading}</b>
                    {col.links
                      .filter((l) => l.href)
                      .map((l) => (
                        <Link key={l.label} href={l.href!}>
                          {l.label}
                        </Link>
                      ))}
                  </div>
                ))}
              </nav>
            </details>
          </div>
        </div>
        <div className="ft2-bot">
          <span>© {new Date().getFullYear()} Frequency Community Collective</span>
          <span className="ft2-legal">
            {FOOTER_LEGAL.map((l) => (
              <Link key={l.label} href={l.href!}>
                {l.label}
              </Link>
            ))}
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
            {SOCIAL_PROFILES.map((url) => (
              <a key={url} href={url} rel="me noopener" target="_blank">
                {socialLabel(url)}
              </a>
            ))}
            <MotionPause />
          </span>
          <span className="ft2-sign">
            <span className="fq-logo-icon fq-iridescent ft2-roundel" aria-hidden="true" />
            <em>Your people stay yours.</em>
          </span>
        </div>
      </div>
    </footer>
  )
}
