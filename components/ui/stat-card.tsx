import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// One stat tile for KPI rows and dashboards (crew home, Studio, admin). The
// audits found stat strips static (no time-axis) and over-boxed; this tile is a
// soft surface (not a hard bordered box) and takes an optional **delta** so
// dashboards read as momentum, not a frozen snapshot (REDESIGN-INAPP defect #8;
// STUDIO-REVIEW #7). Pass `href` to make it a drill-down.
//
// Presentational + server-friendly (no hooks).
//
//   <StatCard label="Weekly active" value={142} icon={Users}
//             delta={{ label: '+8 this week', trend: 'up' }} href="/marketing/analytics" />

export type StatDelta = {
  label: string
  /** up = good/green, down = bad/red, flat = subtle. Use `trend` for the meaning,
   *  not the raw direction — pass 'up' for "good" even if the number fell. */
  trend?: 'up' | 'down' | 'flat'
}

const TREND = {
  up: { Icon: ArrowUpRight, cls: 'text-success' },
  down: { Icon: ArrowDownRight, cls: 'text-danger' },
  flat: { Icon: Minus, cls: 'text-subtle' },
} as const

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  href,
}: {
  label: React.ReactNode
  value: React.ReactNode
  icon?: LucideIcon
  delta?: StatDelta
  href?: string
}) {
  const t = delta ? TREND[delta.trend ?? 'flat'] : null

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-subtle">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-subtle" />}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums leading-none text-text">{value}</p>
      {delta && t && (
        <p className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${t.cls}`}>
          <t.Icon className="h-3.5 w-3.5 shrink-0" />
          {delta.label}
        </p>
      )}
    </>
  )

  const cls = 'block rounded-2xl bg-surface-elevated/60 p-4'
  return href ? (
    <Link
      href={href}
      className={`${cls} transition-colors hover:bg-surface-elevated motion-reduce:transition-none`}
    >
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
