// THE SITE'S STATUS PAGES: not found and "hit a snag", in the kit's own hero (`.phero`), so a broken
// link or a failed render on a website page still wears the design instead of dropping to DAWN's
// EmptyState inside the Frequency shell. Rendered by app/(marketing)/not-found.tsx and the error
// boundaries of (marketing) and (help) when SITE_DESIGN is 'frequency'; DAWN keeps its own.
//
// No hooks and no request data: the not-found stays static, and the error boundary (a client
// component) wraps this with its retry button in site-error.tsx.

import Link from 'next/link'
import type { ReactNode } from 'react'

export interface SiteStatusProps {
  /** The trail after Home, last item unlinked. */
  crumb: string
  title: ReactNode
  lead: string
  /** The actions row: kit buttons (`btn fq-iri-btn`, `btn btn-ghost fq-iri-rim`). */
  children: ReactNode
  label?: string
}

export function SiteStatus({ crumb, title, lead, children, label = '01 Status' }: SiteStatusProps) {
  return (
    <section className="phero" data-energy="still" data-screen-label={label}>
      <div className="bg" style={{ backgroundImage: "url('/brand/frequency/photos/gathering-03.jpg')" }} />
      <div className="fq-aura" style={{ '--fq-aura-opacity': 0.24 } as React.CSSProperties} />
      <div className="shade" />
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{crumb}</span>
        </nav>
        <h1 className="h-xl">{title}</h1>
        <p>{lead}</p>
        <div className="ctas">{children}</div>
      </div>
    </section>
  )
}

/** The website's not-found: three ways back in, every one a route that exists. */
export function SiteNotFound() {
  return (
    <SiteStatus
      crumb="Not found"
      title={
        <>
          This page <em className="fq-iri-text">isn’t here.</em>
        </>
      }
      lead="It may have moved, or the link’s broken. Start from the front door, or find what’s happening near you."
    >
      <Link className="btn fq-iri-btn" href="/">
        Back home
      </Link>
      <Link className="btn btn-ghost fq-iri-rim" href="/the-community#near">
        What’s happening
      </Link>
      <Link className="btn btn-ghost fq-iri-rim" href="/help">
        Help
      </Link>
    </SiteStatus>
  )
}
