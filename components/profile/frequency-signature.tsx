// Personal recorded practice rhythm, with a factual recent-day summary and organic shape.
// Existing Pillar accents and layout primitives stay; no health score or perfect-shape target.

import { Compass } from 'lucide-react'
import type { AccentKey } from '@/lib/studio/accents'
import type { FrequencySignature, PillarKey } from '@/lib/frequency-signature'
import { PILLAR_KEYS } from '@/lib/frequency-signature'

// Pillar → accent key (matches components/journey/v2/journey-builder.tsx) and the
// axis position on the dial. Mind left, Body top, Spirit right, Expression bottom —
// a compass of the four Pillars.
const PILLARS: Record<PillarKey, { label: string; accent: AccentKey; angle: number }> = {
  mind: { label: 'Mind', accent: 'indigo', angle: 180 }, // left
  body: { label: 'Body', accent: 'jade', angle: -90 }, // top
  spirit: { label: 'Spirit', accent: 'plum', angle: 0 }, // right
  expression: { label: 'Expression', accent: 'gold', angle: 90 }, // bottom
}

// Axis order matched to the four cardinal points (top → right → bottom → left), so the
// polygon is drawn in a consistent winding.
const AXIS_ORDER: PillarKey[] = ['body', 'spirit', 'expression', 'mind']

// Tailwind's inline @theme aliases need not be emitted as CSS custom properties.
// The underlying semantic rank ramps are always present on the real app root.
const pillarColor = (key: PillarKey) => `var(--color-rank-${PILLARS[key].accent}, var(--rank-${PILLARS[key].accent}))`

/** Point on a circle of `radius` at `angleDeg`, centred at (cx, cy). */
function point(cx: number, cy: number, radius: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
}

/** A smooth CLOSED path through points (closed Catmull-Rom → cubic béziers). Turns the four
 *  axis tips into one organic blob instead of a hard four-point kite, so the signature reads
 *  as a living shape that bulges toward whatever Pillar is practiced most and rounds toward a
 *  recent mix without assigning a preferred shape. */
function smoothClosedPath(pts: [number, number][]): string {
  const n = pts.length
  if (n < 3) return ''
  const f = (v: number) => v.toFixed(2)
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`
  }
  return d + ' Z'
}

interface Props {
  signature: FrequencySignature
  variant?: 'full' | 'compact'
  layout?: 'auto' | 'stack'
  name?: string
  className?: string
  framed?: boolean
}

/** Recorded activity only. Shape and legend use the same nonexclusive recent day counts. */
export function FrequencySignature({ signature, variant = 'full', layout = 'auto', className, framed = true }: Props) {
  const rhythm = signature.rhythm
  const compact = variant === 'compact'
  const stacked = layout === 'stack'
  if (rhythm?.state === 'restricted') return null
  const shell = `${framed ? 'rounded-card border border-border bg-surface p-5 lift-1' : ''} ${className ?? ''}`
  if (!rhythm || rhythm.state === 'unavailable') {
    if (compact) return <span role="status" className={`text-meta text-muted ${className ?? ''}`}>Practice details unavailable</span>
    return <div className={shell} role="status"><p className="text-body-sm font-semibold text-text">Your recent practice rhythm</p><p className="mt-1 text-body-sm text-muted">Your recent practice details couldn’t be loaded. Try again later.</p></div>
  }
  const dateLine = rhythm.window ? `${rhythm.window.start} to ${rhythm.window.end} · ${rhythm.window.timezone}${rhythm.window.timezoneSource === 'utc_fallback' ? ' (timezone fallback)' : ''}` : ''
  if (rhythm.state === 'empty') {
    if (compact) return <span className={`text-meta text-muted ${className ?? ''}`} title={dateLine}>No recent practice recorded</span>
    return <div className={shell}><Compass className="mb-3 h-6 w-6 text-subtle" aria-hidden="true" /><p className="text-body-sm font-semibold text-text">Your recent practice rhythm</p><p className="mt-1 text-body-sm text-muted">No practice is recorded in this window. Keep what’s working, rest, or try something when you’re ready.</p><p className="mt-2 text-meta text-subtle">{dateLine}</p></div>
  }
  const partial = rhythm.state === 'partial'
  const peak = Math.max(...PILLAR_KEYS.map((key) => rhythm.days[key]))
  const total = rhythm.activeDays
  const summary = PILLAR_KEYS.map((key) => `${PILLARS[key].label}: ${partial ? 'at least ' : ''}${rhythm.days[key]} recorded ${rhythm.days[key] === 1 ? 'day' : 'days'}`).join('; ')
  const size = compact ? 56 : stacked ? 210 : 240
  const cx = size / 2
  const maxR = cx - (compact ? 6 : stacked ? 40 : 46)
  const vertices = AXIS_ORDER.map((key) => point(cx, cx, maxR * (0.08 + (peak ? rhythm.days[key] / peak : 0) * 0.92), PILLARS[key].angle))
  const svg = !partial && peak > 0 ? (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Recent recorded practice days, ${dateLine}. ${summary}. Support areas overlap.`} className={compact ? '' : 'h-full w-full'} style={{ color: 'var(--color-primary)' }}>
      {[0.36, 0.68, 1].map((level) => <circle key={level} cx={cx} cy={cx} r={maxR * level} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.16} />)}
      {AXIS_ORDER.map((key) => { const [x, y] = point(cx, cx, maxR, PILLARS[key].angle); return <line key={key} x1={cx} y1={cx} x2={x} y2={y} stroke="currentColor" strokeWidth={1} opacity={0.12} /> })}
      <path d={smoothClosedPath(vertices)} fill="currentColor" fillOpacity={0.24} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      {AXIS_ORDER.map((key, index) => rhythm.days[key] > 0 ? <circle key={key} cx={vertices[index][0]} cy={vertices[index][1]} r={compact ? 2 : 3.5} style={{ fill: pillarColor(key) }} /> : null)}
    </svg>
  ) : null
  if (compact) return <span className={`inline-flex ${className ?? ''}`} title={summary}>{svg ?? <span className="text-meta text-muted">Practice details incomplete</span>}</span>
  return (
    <div className={shell}>
      <p className="text-body font-bold text-text">Your recent practice rhythm</p>
      <p className="mt-1 text-meta text-subtle">{dateLine}</p>
      <p className="mt-2 text-body-sm text-muted">A picture of the practices you’ve logged. It won’t capture everything that supports you.</p>
      {partial && <p role="status" className="mt-3 text-body-sm font-medium text-muted">Some practice records couldn’t be loaded. These are partial counts.</p>}
      <div className={`mt-4 flex flex-col items-center gap-5 ${stacked ? '' : 'sm:flex-row sm:items-center sm:gap-6'}`}>
        {svg && <div className="relative mx-auto aspect-square w-full max-w-60 shrink-0">{svg}{AXIS_ORDER.map((key) => <AxisLabel key={key} pillar={key} pos={key === 'mind' ? 'left' : key === 'body' ? 'top' : key === 'spirit' ? 'right' : 'bottom'} />)}</div>}
        <div className="min-w-0 w-full flex-1">
          <p className="text-body-sm text-text">{partial ? 'At least ' : ''}{total} recorded {total === 1 ? 'practice day' : 'practice days'}</p>
          <dl className="mt-3 space-y-2">
            {PILLAR_KEYS.map((key) => <div key={key} className="flex items-baseline justify-between gap-3"><dt className="flex items-center gap-2 text-meta font-medium text-text"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-pill" style={{ backgroundColor: pillarColor(key) }} />{PILLARS[key].label}</dt><dd className="text-meta tabular-nums text-muted">{partial ? 'At least ' : ''}{rhythm.days[key]} {rhythm.days[key] === 1 ? 'day' : 'days'}</dd></div>)}
          </dl>
          <p className="mt-3 text-meta text-muted">One day can support several areas. These counts overlap.</p>
        </div>
      </div>
      {rhythm.coverage.estimatedLogs > 0 && <p className="mt-3 text-meta text-muted">{rhythm.coverage.estimatedLogs} older {rhythm.coverage.estimatedLogs === 1 ? 'record uses' : 'records use'} a current-category estimate. Those details may change if a practice is edited.</p>}
      {rhythm.coverage.unmappedLogs > 0 && <p className="mt-2 text-meta text-muted">Support details are missing for {rhythm.coverage.unmappedLogs} {rhythm.coverage.unmappedLogs === 1 ? 'record' : 'records'}.</p>}
      <p className="mt-3 text-meta text-subtle">Only you can see these practice details.</p>
    </div>
  )
}

function AxisLabel({ pillar, pos }: { pillar: PillarKey; pos: 'top' | 'right' | 'bottom' | 'left' }) {
  const place = pos === 'top' ? 'left-1/2 top-0 -translate-x-1/2' : pos === 'bottom' ? 'left-1/2 bottom-0 -translate-x-1/2' : pos === 'left' ? 'left-0 top-1/2 -translate-y-1/2' : 'right-0 top-1/2 -translate-y-1/2'
  return <span className={`pointer-events-none absolute text-2xs font-semibold tracking-tight text-muted ${place}`}>{PILLARS[pillar].label}</span>
}
