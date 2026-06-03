import type { LucideIcon } from 'lucide-react'

// The one admin page shell. Every /admin/* page wraps its content in <AdminPage>
// so the header, max-width, and vertical rhythm are identical everywhere — no
// more per-page hand-rolled `max-w-3xl px-4 py-8` blocks (they varied page to
// page). Content sits inside <AdminSection> blocks for consistent grouping.
//
//   <AdminPage title="Engagement" icon={Activity} eyebrow="Insights"
//              description="Live first-party signal over the last 30 days."
//              actions={<Button>Export</Button>}>
//     <AdminSection title="Activation funnel">…</AdminSection>
//   </AdminPage>

const WIDTHS = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
} as const

export function AdminPage({
  title,
  icon: Icon,
  eyebrow,
  description,
  actions,
  width = 'default',
  children,
}: {
  title: string
  icon?: LucideIcon
  /** Small kicker above the title — usually the section group (e.g. "Insights"). */
  eyebrow?: string
  description?: React.ReactNode
  /** Right-aligned controls in the header (buttons, links). */
  actions?: React.ReactNode
  width?: keyof typeof WIDTHS
  children: React.ReactNode
}) {
  return (
    <div className={`mx-auto w-full ${WIDTHS[width]} space-y-6`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{eyebrow}</p>
          )}
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-primary-strong" />}
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
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
