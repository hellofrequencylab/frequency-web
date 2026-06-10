import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// One stat tile for KPI rows and dashboards (crew home, Studio, admin). The
// audits found stat strips static (no time-axis) and over-boxed; this tile is a
// soft surface (not a hard bordered box) and takes an optional **delta** so
// dashboards read as momentum, not a frozen snapshot (REDESIGN-INAPP defect #8;
// STUDIO-REVIEW #7). Pass `href` to make it a drill-down.
//
// Variants (PB.2a — the former bespoke stats fold in here, no new one-offs):
//   `bordered` — hard-bordered card on bg-surface (QR stats/analytics, practice
//   detail) for pages whose stat rows sit on the canvas, not inside a panel.
//   `detail`   — a small subtle line under the value (a qualifier, not a trend).
//   `size="sm"`— compact tile with a text-sm value, for phrase-valued stats
//   (e.g. a practice's "+20 zaps · streak +1" reward) where 2xl would wrap.
//
// Presentational + server-friendly (no hooks).
//
//   <StatCard label="Weekly active" value={142} icon={Users}
//             delta={{ label: '+8 this week', trend: 'up' }} href="/admin/marketing/analytics" />
//   <StatCard bordered label="Total scans" value="1,204" icon={ScanLine}
//             detail="across 12 codes" />

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
  detail,
  href,
  bordered = false,
  size = 'md',
}: {
  label: React.ReactNode
  value: React.ReactNode
  icon?: LucideIcon
  delta?: StatDelta
  /** Small subtle qualifier under the value (e.g. "across 12 codes"). */
  detail?: React.ReactNode
  href?: string
  /** Hard-bordered card on bg-surface (for stat rows sitting on the canvas). */
  bordered?: boolean
  /** 'sm' = compact tile (text-sm value) for phrase values that would wrap at 2xl. */
  size?: 'md' | 'sm'
}) {
  const t = delta ? TREND[delta.trend ?? 'flat'] : null
  const sm = size === 'sm'

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-subtle">{label}</p>
        {Icon && <Icon className={`shrink-0 text-subtle ${sm ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />}
      </div>
      <p
        className={`tabular-nums text-text ${
          sm ? 'mt-0.5 text-sm font-bold' : 'mt-1 text-2xl font-bold leading-none'
        }`}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-subtle">{detail}</p>}
      {delta && t && (
        <p className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${t.cls}`}>
          <t.Icon className="h-3.5 w-3.5 shrink-0" />
          {delta.label}
        </p>
      )}
    </>
  )

  const cls = `block rounded-2xl ${sm ? 'px-4 py-3' : 'p-4'} ${
    bordered ? 'border border-border bg-surface shadow-sm' : 'bg-surface-elevated/60'
  }`
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
