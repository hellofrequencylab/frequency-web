// Header / Page / Sidebar template (PAGE-FRAMEWORK §3). A title band over a two-column body: a wide
// main content column beside a narrower in-body **sidebar** (filters, a summary card, related links,
// a table of contents). Use it when one page has a primary flow AND a persistent secondary panel
// that belongs in-body, not in the shell rail.
//
// The header is the shared <PageHeading>, so this reads like every other template. The columns stack
// on mobile (sidebar below the content by default) and sit side by side from `lg`.
//
// Rail note: a page with its OWN in-body sidebar should usually register as 'scoped' in
// lib/layout/page-chrome.ts so the global community right rail is suppressed (avoids the
// double-rail trap, PAGE-FRAMEWORK §3). The template renders the layout; page-chrome owns the rail.
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'

export function HeaderSidebarTemplate({
  eyebrow,
  title,
  description,
  actions,
  back,
  sidebar,
  sidebarSide = 'right',
  children,
}: {
  /** Small contextual line above the title. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action(s). */
  actions?: React.ReactNode
  /** Back-link for a nested page. */
  back?: { href: string; label: string }
  /** The in-body sidebar column (filters / summary / related). */
  sidebar: React.ReactNode
  /** Which side the sidebar sits on from `lg` up. Default 'right'. */
  sidebarSide?: 'left' | 'right'
  /** The main content column. */
  children: React.ReactNode
}) {
  // The sidebar orders BELOW the content on mobile (content first) regardless of side; from `lg`
  // it takes its place via the flex order. A fixed-ish width keeps the main column dominant.
  const aside = (
    <aside className={`lg:w-72 lg:shrink-0 ${sidebarSide === 'left' ? 'lg:order-first' : ''}`}>
      {sidebar}
    </aside>
  )

  return (
    <div>
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={actions} back={back} />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">{children}</div>
        {aside}
      </div>
    </div>
  )
}
