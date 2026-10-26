import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TrendArea } from '@/components/admin/spark-charts'

// The members kit's stat panel (templates/members/The Vault.html, ADR-1737): a `.panel`
// with the `.k` label over the `.num` reading and a `.t2` qualifier; `sm` / `xs` are the denser tiles
// (`mu-stat`, app/themes/frequency/members-ui.css). A linked stat is an `a.panel`, which the kit lifts
// on hover.

// One stat tile for KPI rows and dashboards (crew home, Studio, admin). The
// audits found stat strips static (no time-axis) and over-boxed; this tile is a
// soft surface (not a hard bordered box) and takes an optional **delta** so
// dashboards read as momentum, not a frozen snapshot (REDESIGN-INAPP defect #8;
// STUDIO-REVIEW #7). Pass `href` to make it a drill-down.
//
// Variants (PB.2a — the former bespoke stats fold in here, no new one-offs):
//   `bordered` — kept for callers (QR stats/analytics, practice detail); the `.panel` surface is
//   the same either way.
//   `detail`   — a small subtle line under the value (a qualifier, not a trend).
//   `size="sm"`— compact tile with a text-body-sm value, for phrase-valued stats
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
  up: { Icon: ArrowUpRight },
  down: { Icon: ArrowDownRight },
  flat: { Icon: Minus },
} as const

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  detail,
  href,
  bordered: _bordered = false,
  size = 'md',
  sparkline,
  title,
}: {
  label: React.ReactNode
  value: React.ReactNode
  icon?: LucideIcon
  delta?: StatDelta
  /** Small subtle qualifier under the value (e.g. "across 12 codes"). */
  detail?: React.ReactNode
  href?: string
  /** Accepted for existing callers; the kit's `.panel` is the one tile surface, so it changes nothing. */
  bordered?: boolean
  /** 'sm' = compact tile (text-body-sm value) for phrase values that would wrap at 2xl.
   *  'xs' = HALF-height dense tile (text-body value, tight padding) for metric-dense dashboards
   *  where many tiles share a row (email performance, KPI strips). */
  size?: 'md' | 'sm' | 'xs'
  /** Optional trend series rendered as a sparkline under the stat (ADR-233: value +
   *  delta + context visual — never a bare number). */
  sparkline?: number[]
  /** Hover/assistive text for the whole tile. A stat tile is three terse fragments (value, label,
   *  detail) and, when it links, the destination is implied by none of them: "Circles / 3 / Hosting"
   *  pointing at the Circles directory reads as "3 Circles are in there". Pass this wherever the
   *  number's scope or the link's destination is not recoverable from the visible text. Optional, so
   *  every existing caller is unchanged. */
  title?: string
}) {
  const t = delta ? TREND[delta.trend ?? 'flat'] : null
  const sm = size === 'sm'
  const xs = size === 'xs'

  const fq = (
    <>
      <span className="row">
        <span className="k grow">{label}</span>
        {Icon && <Icon aria-hidden />}
      </span>
      <span className="num">{value}</span>
      {detail && <span className="t2">{detail}</span>}
      {delta && t && (
        <span className={`t2 row ${delta.trend === 'up' ? 'mu-up' : delta.trend === 'down' ? 'mu-down' : ''}`}>
          <t.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {delta.label}
        </span>
      )}
      {sparkline && sparkline.length > 1 && (
        <span className="block h-8">
          <TrendArea points={sparkline} height={32} />
        </span>
      )}
    </>
  )
  const fqCls = `panel mu-stat${sm ? ' mu-sm' : xs ? ' mu-xs' : ''}`
  return href ? (
    <Link href={href} title={title} className={fqCls}>
      {fq}
    </Link>
  ) : (
    <div className={fqCls} title={title}>
      {fq}
    </div>
  )
}
