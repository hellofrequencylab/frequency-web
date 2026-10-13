// THE FREQUENCY PUBLIC FOOTER (`footer.ft2`, identical on every template page). Server component, no JS.
// The logo sheen and the roundel beside "Your people stay yours." are what fx.js adds after load; here
// they are in the markup from the start. Links: lib/frequency/site-nav.ts (a link with no route yet is
// left out).

import Image from 'next/image'
import Link from 'next/link'
import { FOOTER_COLUMNS, FOOTER_LEGAL, ROUTES, SIDE_CTA } from '@/lib/frequency/site-nav'

const WORDMARK = '/brand/frequency/frequency-wordmark.png'

export function SiteFooter() {
  return (
    <footer className="ft2">
      <div className="wrap">
        <div className="ft2-top">
          <div className="ft2-brand">
            <Link href={ROUTES.home} aria-label="Frequency home" className="lg-fx">
              <Image className="w" src={WORDMARK} alt="Frequency Community Collective" width={1920} height={389} loading="lazy" />
              <span className="lg-sheen" aria-hidden="true" style={{ '--fq-lg': `url("${WORDMARK}")` } as React.CSSProperties} />
            </Link>
            <p>
              Build circles, not walls. A community network where people find groups near them and keep coming back,
              and Spaces host experiences people come back to.
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
                <b>{col.heading}</b>
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
