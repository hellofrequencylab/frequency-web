// Stream template — the "feed" shell (PAGE-FRAMEWORK §3, Template A).
//
// One grammar for chronological/ranked streams (the home Feed, Broadcast, a
// Circle's discussion, a profile timeline): a title + description, an optional
// composer slot at the top, an optional sort/filter control, over the stream body.
//
// The header is the shared <PageHeading>, so streams read like every other page.
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'

export function StreamTemplate({
  eyebrow,
  title,
  description,
  action,
  back,
  composer,
  sort,
  children,
}: {
  /** Small contextual line above the title (e.g. today's date). Adds weight to thin headers. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action, e.g. a create menu. */
  action?: React.ReactNode
  /** Back-link for a nested stream (e.g. a sub-page under a dashboard). */
  back?: { href: string; label: string }
  /** Composer / create-post slot rendered above the stream. */
  composer?: React.ReactNode
  /** Sort/filter control shown on the header row (right side). Use when there's no `action`. */
  sort?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={action ?? sort}
        back={back}
      />
      {composer && <div className="mb-6">{composer}</div>}
      {children}
    </div>
  )
}
