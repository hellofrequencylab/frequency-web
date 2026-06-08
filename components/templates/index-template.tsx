// Index template — the "list / discovery" shell (PAGE-FRAMEWORK §3, Template B).
//
// One grammar for browse pages (Circles, Channels, Events, Partners, Directory):
// a title + description, an optional header action (create/new), an optional
// toolbar (filters/search), over the list body. The body and any right rail are
// the page's own; this is the consistent chrome around them.
//
// The header is the shared <PageHeading> — the same title block Stream / Dashboard
// / Focus use, so every page reads the same.
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'

export function IndexTemplate({
  eyebrow,
  title,
  description,
  action,
  back,
  toolbar,
  children,
}: {
  /** Small contextual line above the title. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action, e.g. a "New circle" button. */
  action?: React.ReactNode
  /** Back-link for a nested index (e.g. a sub-page under a dashboard). */
  back?: { href: string; label: string }
  /** Optional filter/search row under the header. */
  toolbar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={action} back={back} />
      {toolbar && <div className="mb-4">{toolbar}</div>}
      {children}
    </div>
  )
}
