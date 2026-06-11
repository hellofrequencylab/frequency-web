// Admin template — the operator shell for /admin/* (PAGE-FRAMEWORK §3 + §8.1). The
// admin-nav sibling of Dashboard: it composes the SAME shared <PageHeading> grammar as
// every other template (so admin pages read identically to the rest of the app), adds
// an optional title icon + admin widths, and groups its body in <AdminSection> blocks.
//
// This promotes the old standalone `AdminPage` component into the first-class template
// kit — admin pages now live inside the framework like everything else. `AdminPage` is
// re-exported as an alias from @/components/admin/admin-page for back-compat.
//
//   <AdminTemplate title="Engagement" icon={Activity} eyebrow="Insights"
//                  description="Live first-party signal." actions={<Button>Export</Button>}>
//     <AdminSection title="Activation funnel">…</AdminSection>
//   </AdminTemplate>
//
// Presentational + server-friendly (no hooks).

import type { LucideIcon } from 'lucide-react'
import { PageHeading } from './page-heading'

const WIDTHS = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
} as const

export function AdminTemplate({
  title,
  icon: Icon,
  eyebrow,
  description,
  actions,
  back,
  width = 'default',
  children,
}: {
  title: string
  /** Optional title icon (the admin section glyph). */
  icon?: LucideIcon
  /** Small kicker above the title — usually the section group (e.g. "Insights"). */
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned header controls (buttons, links). */
  actions?: React.ReactNode
  /** Back-link above the header — the single back affordance on an entity-detail page. */
  back?: { href: string; label: string }
  width?: keyof typeof WIDTHS
  children: React.ReactNode
}) {
  return (
    <div className={`mx-auto w-full ${WIDTHS[width]}`}>
      <PageHeading
        back={back}
        eyebrow={eyebrow}
        title={
          Icon ? (
            <span className="inline-flex items-center gap-2">
              <Icon className="h-5 w-5 shrink-0 text-primary-strong" />
              {title}
            </span>
          ) : (
            title
          )
        }
        description={description}
        actions={actions}
      />
      <div className="space-y-6">{children}</div>
    </div>
  )
}

/** A titled content block within an admin page. Optional description + right-side
 *  actions; renders a header row only when something is passed. */
export function AdminSection({
  title,
  description,
  actions,
  children,
}: {
  title?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
