// Meter — the freemium usage meter (BRIEF-06 §3). One
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

// The members kit's 4px `.meter` with its `<i>` fill (ADR-1737); the 80%/cap law keeps its
// colours through `mu-warning` / `mu-danger` (app/themes/frequency/members-ui.css).

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
  const reading = `${used.toLocaleString()} of ${cap.toLocaleString()}${unit ? ` ${unit}` : ''}`
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
