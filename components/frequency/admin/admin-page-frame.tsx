import type { ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'

// THE ADMIN PAGE FRAME (Frequency, ADR-1740). The outer frame every console page that has no Member Admin
// design of its own wears inside the Frequency admin shell: the design's page head (kicker, Unbounded title,
// meta line, actions on the right), an optional KPI row in the kit's `.g4`, and the body as a column of
// sections, each with the kit's section head. Under it the page's own forms and tables are untouched; the
// frame's sheet (admin-pages.css, `.adp-frame`, loaded by the admin shell, not here, so the templates barrel
// that re-exports AdminTemplate carries no stylesheet) gives their tables the kit's `.tbl` lines and their
// cards the glass panel, by class and token only. Outside the admin shell the head still reads in the
// members kit, which app/(main)/layout.tsx loads.
//
// WHO WEARS IT. The DAWN page templates hand over to it under SITE_DESIGN=frequency: AdminTemplate and
// AdminSection (every /admin page), and the console page templates the Space settings, CRM and manage pages
// use (ConsoleFocusTemplate, ConsoleDashboardTemplate in components/templates/console-templates.tsx). DAWN
// never renders this file. Server-safe and client-importable (no hooks, no server-only reads), because a few
// client components render AdminTemplate.

export interface AdminPageFrameProps {
  kicker?: ReactNode
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  /** A back link above the head, for a nested page. */
  back?: { href: string; label: string }
  /** Full-width media above the head (the operator header image). */
  banner?: ReactNode
  /** A row of KPI or stat cards, in the kit's four-up grid. */
  stats?: ReactNode
  /** 'h2' when the page already owns an h1 elsewhere. */
  level?: 'h1' | 'h2'
  /** 'focus' keeps a single-task page (a settings form) to a readable column; 'full' uses the console width. */
  measure?: 'full' | 'focus'
  children: ReactNode
}

export function AdminPageFrame({ kicker, title, meta, actions, back, banner, stats, level = 'h1', measure = 'full', children }: AdminPageFrameProps) {
  const Heading = level
  return (
    <div className="adp adp-frame" data-kit="members" data-measure={measure}>
      {back && (
        <Link className="adp-back" href={back.href}>
          <FqIcon name="chevron" size={16} className="adp-back-ic" />
          {back.label}
        </Link>
      )}
      {banner}
      <div className="head">
        <div>
          {kicker ? <span className="k">{kicker}</span> : null}
          <Heading className="h1">{title}</Heading>
          {meta ? <div className="meta">{meta}</div> : null}
        </div>
        {actions ? <div className="row wrap">{actions}</div> : null}
      </div>
      {stats ? <div className="g4 adp-stats">{stats}</div> : null}
      <div className="adp-frame-body">{children}</div>
    </div>
  )
}

/** One titled block of a framed page: the kit's section head (h3 title, muted description, actions on the
 *  right), then the page's own content. Renders the head only when there is something in it. */
export function AdminFrameSection({
  title,
  description,
  actions,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="adp-fsec">
      {(title || actions) && (
        <div className="sec-h">
          <div className="stack adp-tight">
            {title ? <h2 className="h3">{title}</h2> : null}
            {description ? <div className="t2">{description}</div> : null}
          </div>
          {actions ? <div className="row wrap">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  )
}
