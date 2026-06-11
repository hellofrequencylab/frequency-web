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

/** A HOME-dashboard area block. The HEADER, subtext, and instructional copy are
 *  printed on the CANVAS (no card); the body is a grid of white tiles (stats, graphs,
 *  lists). A hairline rule separates one area from the next. The owner brief: headers
 *  and instructional text on the canvas, everything else in white tiles. */
export function DashArea({
  icon: Icon,
  label,
  blurb,
  href,
  hrefLabel,
  footnote,
  children,
}: {
  icon?: LucideIcon
  label: string
  /** Instructional copy: what this area is and what the operator does here. */
  blurb?: React.ReactNode
  /** Drill-down to the area's own dashboard. */
  href?: string
  hrefLabel?: string
  /** A quiet footer note under the tiles: provenance / cadence / a pointer. */
  footnote?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-0 sm:pt-9">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-text">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />}
            {label}
          </h2>
          {blurb && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{blurb}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary-strong hover:underline"
          >
            {hrefLabel ?? 'Open'}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
      {footnote && <p className="mt-4 text-xs leading-relaxed text-subtle">{footnote}</p>}
    </section>
  )
}

/** The tile grid that fills an area body — varied white tiles, responsive. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-3">{children}</div>
}

const SPAN = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-2 lg:col-span-3',
} as const

/** A white content tile — the only white surface in the area grammar. Optional
 *  uppercase label + axis caption; `span` sets how many grid columns it covers (of 4
 *  on lg, 2 on mobile). Holds graphs, stat clusters, ranked lists, narrative. */
export function Tile({
  label,
  caption,
  span = 1,
  children,
}: {
  label?: string
  caption?: string
  span?: keyof typeof SPAN
  children: React.ReactNode
}) {
  return (
    <div className={`flex h-full flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5 ${SPAN[span]}`}>
      {label && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>}
      <div className={`${label ? 'mt-3 ' : ''}min-h-12 flex-1`}>{children}</div>
      {caption && <p className="mt-2 text-xs text-subtle">{caption}</p>}
    </div>
  )
}

/** A white graph tile — label, optional headline value, the plot, an axis caption. */
export function GraphTile({
  label,
  value,
  caption,
  span = 1,
  children,
}: {
  label: string
  value?: React.ReactNode
  caption?: string
  span?: keyof typeof SPAN
  children: React.ReactNode
}) {
  return (
    <div className={`flex h-full flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5 ${SPAN[span]}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {value !== undefined && <p className="text-base font-bold tabular-nums text-text">{value}</p>}
      </div>
      <div className="mt-3 min-h-12 flex-1">{children}</div>
      {caption && <p className="mt-2 text-xs text-subtle">{caption}</p>}
    </div>
  )
}

/** A compact metric for a stat-cluster tile — big value, quiet label, optional tone.
 *  Numbers are bold (not extrabold) so the warm near-black reads softer at a glance. */
export function MiniStat({
  value,
  label,
  tone = 'neutral',
}: {
  value: React.ReactNode
  label: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const valueTone = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-text'
  return (
    <div className="min-w-0">
      <p className={`text-[1.625rem] font-bold leading-none tabular-nums ${valueTone}`}>{value}</p>
      <p className="mt-1.5 truncate text-xs font-medium text-muted">{label}</p>
    </div>
  )
}

/** A 2×2 (or 2×N) grid of MiniStats inside a Tile. */
export function MiniGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-5">{children}</div>
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
