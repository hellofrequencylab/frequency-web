import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// The admin DASHBOARD language (ADR-228 addendum — the owner's redesign brief +
// dashboard best practice): ONE card grammar all the way down the page.
//
//   • DashSection — a compact WHITE card per section: title + one-line description
//     in the card header, an optional drill-down link on the right, content below.
//     Every section on a dashboard is one of these, stacked down the screen.
//   • StatRow / StatItem — the stats INSIDE a section card: VALUE-FIRST anatomy
//     (big number, quiet sentence-case label underneath — never uppercase, never
//     label-dominant), divided columns rather than boxes-in-boxes. Fixed rhythm so
//     a row never goes ragged.
//
// Presentational + server-friendly (no hooks). Semantic tokens only.

export function DashSection({
  title,
  description,
  href,
  hrefLabel,
  children,
}: {
  title: string
  /** One line: what this section tells the operator. */
  description?: string
  /** Drill-down — where the full surface lives. */
  href?: string
  hrefLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-5 py-4 sm:px-6 sm:py-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary-strong hover:underline"
          >
            {hrefLabel ?? 'Open'}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** A row of stats inside a DashSection — divided columns, not nested boxes. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-stretch lg:gap-y-4">
      {children}
    </div>
  )
}

/** One stat: VALUE first and biggest, label quiet beneath. Optional drill-down +
 *  delta line. Renders as a divided column inside a StatRow. */
export function StatItem({
  value,
  label,
  delta,
  deltaTone = 'neutral',
  href,
}: {
  value: React.ReactNode
  label: string
  /** Small context line under the label (e.g. "+12 this month", "needs attention"). */
  delta?: string
  deltaTone?: 'good' | 'bad' | 'neutral'
  href?: string
}) {
  const tone =
    deltaTone === 'good' ? 'text-success' : deltaTone === 'bad' ? 'text-danger' : 'text-subtle'
  const inner = (
    <>
      <p className="text-2xl font-extrabold leading-none tabular-nums text-text">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
      {delta && <p className={`mt-0.5 text-2xs font-semibold ${tone}`}>{delta}</p>}
    </>
  )
  const cell =
    'min-w-[7rem] flex-1 px-4 first:pl-0 last:pr-0 lg:border-l lg:border-border/60 lg:first:border-l-0'
  return href ? (
    <Link href={href} className={`${cell} group rounded-lg transition-opacity hover:opacity-80`}>
      {inner}
    </Link>
  ) : (
    <div className={cell}>{inner}</div>
  )
}

/** Severity chip for advice/insight lines (Vera's read). */
export function SeverityChip({ severity }: { severity: 'good' | 'watch' | 'risk' }) {
  const cls =
    severity === 'risk'
      ? 'bg-danger-bg text-danger'
      : severity === 'watch'
        ? 'bg-warning-bg text-warning'
        : 'bg-success-bg text-success'
  const label = severity === 'risk' ? 'Needs attention' : severity === 'watch' ? 'Watch' : 'Healthy'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}
