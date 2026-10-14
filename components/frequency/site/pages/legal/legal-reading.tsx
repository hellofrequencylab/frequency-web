// THE LEGAL AND UTILITY PAGES on the Frequency design (/privacy, /terms, /guidelines, /space-email-policy,
// and the card pages: /manage-emails, /unsubscribe, /code-unavailable). The design draws none of them;
// they take the help article's reading idiom (frequency-help-pages.tsx) so the reference pages read as one
// place: the `.hp-hero` (crumbs, a display heading, a meta line), then the `.hp-prose` reading column.
// They sit on Commons (components/frequency/site/shell/commons-layout.tsx): long reading is never Stage.
//
// The text is each page's own, unchanged. The DAWN render of every page lives in components/legal and is
// untouched; these are only reached when SITE_DESIGN is 'frequency'.
import Link from 'next/link'
import '@/app/themes/frequency/site-pages-b.css'
import '@/app/themes/frequency/site-pages-legal.css'

/** A legal page: crumbs, the title, the "Last updated" line, then the reading column. */
export function FrequencyLegalReading({
  title,
  updated,
  children,
}: {
  title: string
  /** The page's own "Last updated: …" line, verbatim. */
  updated: string
  children: React.ReactNode
}) {
  return (
    <>
      <section className="hp-hero hp-inner hp-m lg-hero" data-energy="still" data-screen-label="01 Legal">
        <div className="fq-aura" style={{ '--fq-aura-opacity': 0.18 } as React.CSSProperties} />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="hp-crumb">
              <Link href="/">Home</Link>
            </span>
            <span className="hp-crumb">
              <span aria-hidden="true">/</span>
              <span aria-current="page">{title}</span>
            </span>
          </nav>
          <h1 className="h-xl">{title}</h1>
          <p className="hp-meta">{updated}</p>
        </div>
      </section>
      <section className="sec hp-read" style={{ paddingTop: 0 }} data-screen-label="02 Policy">
        <div className="wrap">
          <article className="hp-col">
            <div className="hp-prose lg-prose">{children}</div>
          </article>
        </div>
      </section>
    </>
  )
}

/** A one-card utility page (an email landing, a dead QR code): a heading, a line, and the action. */
export function FrequencyUtilityCard({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="lg-util" data-screen-label="01 Utility">
      <div className="wrap">
        <div className="lg-card">
          <h1 className="lg-card-h">{title}</h1>
          {description && <p className="lg-card-d">{description}</p>}
          <div className="lg-card-b">{children}</div>
        </div>
      </div>
    </section>
  )
}
