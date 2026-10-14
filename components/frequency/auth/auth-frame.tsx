// THE DOORWAY FRAME, under the Frequency design (ADR-1737): the room sign-in, "check your email" and the
// standalone system screens stand in. The website's Commons look (sand canvas, the fixed wash, one glass
// panel) with the site wordmark over it, linking home. Styles: app/themes/frequency/auth.css.
//
// No hooks and no request data, so it renders from a Server Component (sign-in) and from a client error
// boundary (global-error) alike. The panel is labelled by its own heading, which is the page's one <h1>.

import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/active/auth'

export function AuthFrame({
  kicker,
  title,
  lead,
  children,
  after,
  wide = false,
  homeHref = '/',
}: {
  /** The small tracked line over the title (the kit's `.k`). */
  kicker?: string
  title: ReactNode
  lead?: ReactNode
  children?: ReactNode
  /** Anything under the panel (a quiet line of small print). */
  after?: ReactNode
  /** A status screen with a row of links takes a wider panel than a form. */
  wide?: boolean
  homeHref?: string
}) {
  return (
    <main id="main" className="fqa">
      <div className="fq-wash" aria-hidden="true" />
      <header className="fqa-top">
        <Link href={homeHref} className="fqa-mark" aria-label="Frequency home">
          <span className="fq-logo" aria-hidden="true" />
        </Link>
      </header>
      <div className="fqa-body">
        <section className={`fq-panel fqa-card${wide ? ' fqa-wide' : ''}`} aria-labelledby="fqa-title">
          <div className="fqa-head">
            {kicker && <p className="k">{kicker}</p>}
            <h1 id="fqa-title" className="fqa-h">
              {title}
            </h1>
            {lead && <p className="fqa-lead">{lead}</p>}
          </div>
          {children}
        </section>
        {after}
      </div>
    </main>
  )
}
