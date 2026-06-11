import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// The admin DASHBOARD language (ADR-228 addendum — the owner's redesign brief +
// dashboard best practice). TWO section grammars share the same stat/graph parts:
//
//   • DashSection — a compact WHITE card per section (the domain dashboards). Title +
//     one-line description in the card header, optional drill-down link, content below.
//   • DashArea — the HOME exec dashboard grammar (owner brief): the section is printed
//     ON THE CANVAS (no card), separated by a hairline rule. Header (area glyph + label
//     + instructional blurb + drill link), a row of Quick Links into the area's surfaces,
//     then stats and GRAPHS. Only the graphs carry a white background (GraphTile /
//     spark-charts' ChartCard) — everything else sits on the warm canvas.
//   • StatRow / StatItem — the stats inside either grammar: VALUE-FIRST anatomy (big
//     number, quiet sentence-case label underneath), divided columns, not nested boxes.
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

/** A HOME-dashboard area block, printed on the canvas (no card). The area glyph +
 *  label + instructional blurb head it, an optional drill link sits on the right, a
 *  row of Quick Links into the area's surfaces sits under it, and stats + graphs fill
 *  the body. A hairline rule separates one area from the next. */
export function DashArea({
  icon: Icon,
  label,
  blurb,
  href,
  hrefLabel,
  links,
  children,
}: {
  icon?: LucideIcon
  label: string
  /** Instructional one-liner: what the operator does in this area. */
  blurb?: string
  /** Drill-down to the area's own dashboard. */
  href?: string
  hrefLabel?: string
  /** Quick links into the area's key surfaces (from the admin IA). */
  links?: { href: string; label: string; Icon: LucideIcon }[]
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-border/70 pt-7 first:border-t-0 first:pt-0 sm:pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-text">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />}
            {label}
          </h2>
          {blurb && <p className="mt-1 max-w-2xl text-sm text-muted">{blurb}</p>}
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
      {links && links.length > 0 && <QuickLinks links={links} />}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

/** A wrapped row of pill links into an area's surfaces. Printed on the canvas
 *  (transparent, hairline border) — never a filled card. */
export function QuickLinks({ links }: { links: { href: string; label: string; Icon: LucideIcon }[] }) {
  return (
    <div className="mt-3.5 flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:bg-surface/60 hover:text-text"
        >
          <l.Icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          {l.label}
        </Link>
      ))}
    </div>
  )
}

/** A white graph tile for the on-canvas areas — a label, the plot, an axis caption.
 *  The ONLY white surface in the area grammar (the owner brief: graphs on white,
 *  everything else on the canvas). For richer headline-value tiles use ChartCard. */
export function GraphTile({
  label,
  value,
  caption,
  children,
}: {
  label: string
  value?: React.ReactNode
  caption?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{label}</p>
        {value !== undefined && (
          <p className="text-sm font-bold tabular-nums text-text">{value}</p>
        )}
      </div>
      <div className="mt-2 min-h-12 flex-1">{children}</div>
      {caption && <p className="mt-1.5 text-2xs text-subtle">{caption}</p>}
    </div>
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
