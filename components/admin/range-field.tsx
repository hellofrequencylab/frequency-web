'use client'

// Tokenized range slider with a labeled value readout (ADR-233 §4 forms). One
// accessible `<input type="range">` so wizards / generators stop hand-rolling the
// label + readout + `accent-primary` markup. The caller owns the value and the
// onChange; pass `suffix` for a unit (mi, %, …). Server-friendly contract, but it
// needs interaction so it carries `'use client'` — use it inside a Client surface.
//
//   <RangeField label="Radius" value={radius} min={1} max={50} suffix=" mi"
//     onChange={setRadius} />

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
  disabled = false,
}: {
  label: React.ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
  /** Unit appended to the readout (e.g. ' mi', '%'). */
  suffix?: string
  disabled?: boolean
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-1 flex justify-between gap-2">
        <span>{label}</span>
        <b className="tabular-nums text-text">
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  )
}
