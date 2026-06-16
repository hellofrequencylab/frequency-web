// Header / 2 Column template (PAGE-FRAMEWORK §3). A title band over two EQUAL columns. Use it when a
// page presents two peer areas of comparable weight (e.g. "yours" vs "the community", a form beside a
// live preview, two related lists) — unlike Header/Page/Sidebar, neither column is subordinate.
//
// The header is the shared <PageHeading>. The columns stack on mobile and split evenly from `md` up.
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'

export function TwoColumnTemplate({
  eyebrow,
  title,
  description,
  actions,
  back,
  left,
  right,
}: {
  /** Small contextual line above the title. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action(s). */
  actions?: React.ReactNode
  /** Back-link for a nested page. */
  back?: { href: string; label: string }
  /** The first (left) column. */
  left: React.ReactNode
  /** The second (right) column. */
  right: React.ReactNode
}) {
  return (
    <div>
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={actions} back={back} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="min-w-0">{left}</div>
        <div className="min-w-0">{right}</div>
      </div>
    </div>
  )
}
