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
import { Breadcrumbs } from '@/components/layout/breadcrumbs'

/** One crumb in the standard index breadcrumb (`/network` -> this section). */
export type Crumb = { href: string; label: string }

export function IndexTemplate({
  eyebrow,
  title,
  description,
  action,
  back,
  toolbar,
  trail,
  heroImage,
  banner,
  adminBar = true,
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
  /** Standard breadcrumb trail, rendered at the very top of the header (the standardized
   *  index lockup: breadcrumb -> hero -> title). Pass it instead of hand-building a banner. */
  trail?: Crumb[]
  /** Operator hero image URL. Rendered as the STANDARD cropped header banner below the
   *  breadcrumb (16:9-ish, object-cover) so every index reads the same. Renders only when set. */
  heroImage?: string | null
  /** Escape hatch for a fully custom header media node (rendered after trail + heroImage).
   *  Prefer `trail` + `heroImage` — `banner` is for the rare bespoke header. */
  banner?: React.ReactNode
  /** Render the operator on-page "Settings" admin bar (default on). Set false on a page that has
   *  its own customizer so the old operator page-layout control doesn't double up. */
  adminBar?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      {(trail || heroImage || banner) && (
        <div>
          {trail && <Breadcrumbs trail={trail} />}
          {heroImage && (
            // The standardized header banner: cropped (object-cover) to a consistent height so
            // every index reads the same, regardless of the uploaded image's aspect ratio.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage}
              alt=""
              className="mb-6 mt-3 h-44 w-full rounded-2xl border border-border object-cover sm:h-56"
            />
          )}
          {banner}
        </div>
      )}
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={action} back={back} adminBar={adminBar} />
      {toolbar && <div className="mb-4">{toolbar}</div>}
      {children}
    </div>
  )
}
