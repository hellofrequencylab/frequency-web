// Meter — the freemium usage meter (DAWN 2026-08-03 §5; BRIEF-06 §3). One
// track+fill bar for every plan cap (200 contacts, 300 sends/mo, 3 QR codes,
// 1 journey, 1 seat). The color tells the state:
//   • success teal while there is comfortable room,
//   • warning amber from 80% of the cap,
//   • danger ONLY at the cap itself (100%), never before.
// A Meter NEVER shows a lock icon: a cap is a fact about the plan, not a
// punishment, and a Space never wears a padlock (see GateNotice for the
// dormant/gated vocabulary).
//
// Presentational + server-friendly (no hooks). Exposes the value as an
// accessible progressbar (aria-valuemin/max/now + a readable label).
//
//   <Meter used={241} cap={300} label="Sends" unit="this month" />

import { SITE_DESIGN } from '@/lib/theme/design'

// FREQUENCY (ADR-1737): the members kit's 4px `.meter` with its `<i>` fill; the 80%/cap law keeps its
// colours through `mu-warning` / `mu-danger` (app/themes/frequency/members-ui.css). Inlined at build.
const FREQUENCY = SITE_DESIGN === 'frequency'

const TONE = {
  ok: 'bg-success',
  near: 'bg-warning',
  cap: 'bg-danger',
} as const

export function Meter({
  used,
  cap,
  label,
  unit,
}: {
  used: number
  cap: number
  label: string
  /** Optional qualifier after the numbers (e.g. "this month"). */
  unit?: string
}) {
  const clamped = Math.min(Math.max(used, 0), cap)
  const pct = cap > 0 ? (clamped / cap) * 100 : 0
  const tone = pct >= 100 ? TONE.cap : pct >= 80 ? TONE.near : TONE.ok
  const reading = `${used.toLocaleString()} of ${cap.toLocaleString()}${unit ? ` ${unit}` : ''}`
  if (FREQUENCY) {
    const fqTone = pct >= 100 ? ' mu-danger' : pct >= 80 ? ' mu-warning' : ''
    return (
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={clamped}
        aria-label={`${label}: ${reading}`}
        className="stack"
        style={{ gap: 8 }}
      >
        <span className="row" style={{ justifyContent: 'space-between' }}>
          <span className="t2">{label}</span>
          <span className="mu-reading">{reading}</span>
        </span>
        <span className={`meter block${fqTone}`}>
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
    )
  }
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={cap}
      aria-valuenow={clamped}
      aria-label={`${label}: ${reading}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-meta font-medium text-muted">{label}</span>
        <span className="font-mono text-2xs font-semibold tabular-nums text-text">
          {reading}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-elevated">
        <div className={`h-full rounded-pill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
