// Tiny pure-SVG chart kit for the admin dashboard (ADR-228 home redesign).
// Server-friendly (no hooks, no client JS, no chart library): each chart is a
// single inline SVG styled with semantic Tailwind tokens (PRESENTATION.md — no
// hardcoded hex). Built for at-a-glance optics, not analysis — the deep
// dashboards (/admin/engagement, /admin/intel) own the drill-downs.

const W = 100 // viewBox width — charts scale to their container

/** Cumulative trend as a filled area + line (e.g. total members over time). */
export function TrendArea({ points, height = 72 }: { points: number[]; height?: number }) {
  if (points.length < 2) return <EmptyChart height={height} />
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const step = W / (points.length - 1)
  const y = (v: number) => 4 + (1 - (v - min) / span) * (height - 8)
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${W},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      <path d={area} className="fill-primary/10" />
      <path d={line} className="fill-none stroke-primary" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={y(points[points.length - 1])} r="2" className="fill-primary" />
    </svg>
  )
}

/** Weekly volume bars (e.g. practices / events per week). Current week pops. */
export function WeekBars({ values, height = 72 }: { values: number[]; height?: number }) {
  if (values.length === 0) return <EmptyChart height={height} />
  const max = Math.max(...values, 1)
  const gap = 2
  const bw = (W - gap * (values.length - 1)) / values.length
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      {values.map((v, i) => {
        const h = Math.max((v / max) * (height - 6), v > 0 ? 2 : 0.75)
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx="1"
            className={i === values.length - 1 ? 'fill-primary' : 'fill-primary/45'}
          />
        )
      })}
    </svg>
  )
}

/** A 0..1 progress ring (e.g. 7-day activation). */
export function RingGauge({ pct, label, sub }: { pct: number; label: string; sub?: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, pct))
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" aria-hidden>
        <circle cx="40" cy="40" r={r} className="fill-none stroke-border" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="fill-none stroke-primary"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(clamped * c).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="45" textAnchor="middle" className="fill-text text-[17px] font-bold">
          {Math.round(clamped * 100)}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{label}</p>
        {sub && <p className="mt-0.5 text-xs leading-snug text-muted">{sub}</p>}
      </div>
    </div>
  )
}

/** Chart card chrome — title, headline value, the plot, and an axis caption. */
export function ChartCard({
  title,
  value,
  delta,
  caption,
  children,
}: {
  title: string
  value?: string
  /** Small highlight beside the value (e.g. "+12 this month"). */
  delta?: string
  /** Axis caption under the plot (e.g. "12 weeks ago → now"). */
  caption?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{title}</p>
        {delta && <p className="text-xs font-semibold text-success">{delta}</p>}
      </div>
      {value && <p className="mt-1 text-2xl font-bold text-text">{value}</p>}
      <div className="mt-3 min-h-16 flex-1">{children}</div>
      {caption && <p className="mt-1.5 text-2xs text-subtle">{caption}</p>}
    </div>
  )
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center text-xs text-subtle">
      Not enough data yet
    </div>
  )
}

/** Bucket timestamps into trailing whole weeks (oldest → current). */
export function weeklyBuckets(timestamps: Date[], weeks: number, now = new Date()): number[] {
  const WEEK = 7 * 24 * 60 * 60 * 1000
  const out = new Array<number>(weeks).fill(0)
  for (const t of timestamps) {
    const age = now.getTime() - t.getTime()
    if (age < 0 || age >= weeks * WEEK) continue
    out[weeks - 1 - Math.floor(age / WEEK)] += 1
  }
  return out
}

/** Cumulative series from a base count + weekly adds (for the growth trend). */
export function cumulative(base: number, weekly: number[]): number[] {
  const out: number[] = []
  let total = base
  for (const w of weekly) {
    total += w
    out.push(total)
  }
  return out
}
