// THE FREQUENCY PUBLIC FOOTER (`footer.ft2`, identical on every template page). Server component, no JS.
// The logo sheen and the roundel beside "Your people stay yours." are what fx.js adds after load; here
// they are in the markup from the start. Links: lib/frequency/site-nav.ts (a link with no route yet is
// left out).

import Image from 'next/image'
import Link from 'next/link'
import { FOOTER_COLUMNS, FOOTER_LEGAL, ROUTES, SIDE_CTA } from '@/lib/frequency/site-nav'
import { JsonLd } from '@/components/json-ld'
import { siteNavigationSchema } from '@/lib/jsonld'
import { CONTACT_EMAIL, SOCIAL_PROFILES, SITE_SIGNOFF, socialLabel } from '@/lib/site'

const WORDMARK = '/brand/frequency/frequency-wordmark.png'

// The index is also written as SiteNavigationElement JSON-LD (siteNavigationSchema), from the SAME columns the
// footer draws, so the structured data cannot name a link the page does not show (LIVE-1030).
const INDEX = [
  ...FOOTER_COLUMNS.map((c) => ({ title: c.heading, links: c.links.filter((l) => l.href).map((l) => ({ label: l.label, href: l.href! })) })),
  { title: 'Legal', links: FOOTER_LEGAL.map((l) => ({ label: l.label, href: l.href! })) },
]

export function SiteFooter() {
  return (
    <footer className="ft2">
      <JsonLd data={siteNavigationSchema(INDEX)} />
      <div className="wrap">
        <div className="ft2-top">
          <div className="ft2-brand">
            <Link href={ROUTES.home} aria-label="Frequency home" className="lg-fx">
              <Image className="w" src={WORDMARK} alt="Frequency Community Collective" width={1920} height={389} loading="lazy" />
              <span className="lg-sheen" aria-hidden="true" style={{ '--fq-lg': `url("${WORDMARK}")` } as React.CSSProperties} />
            </Link>
            <p>
              {SITE_SIGNOFF} Find community around a walk, a class or a gathering near you.
            </p>
            <div className="ctas">
              <Link className="btn fq-iri-btn" href={SIDE_CTA.p.href!}>
                {SIDE_CTA.p.label}
              </Link>
              <Link className="btn btn-ghost fq-iri-rim" href={SIDE_CTA.e.href!}>
                {SIDE_CTA.e.label}
              </Link>
            </div>
          </div>
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
