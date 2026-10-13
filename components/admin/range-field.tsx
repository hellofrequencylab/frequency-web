'use client'

import { useId } from 'react'

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
  bare = false,
  className,
  'aria-label': ariaLabel,
}: {
  label?: React.ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
  /** Unit appended to the readout (e.g. ' mi', '%'). */
  suffix?: string
  disabled?: boolean
  /** The input alone, no label or readout: a scrubber laid over a drawn track (the Wildheart sky track),
   *  where the caller's stylesheet draws the thumb and the track and `aria-label` names the control. */
  bare?: boolean
  /** With `bare`: the caller's class on the input. */
  className?: string
  'aria-label'?: string
}) {
  // The one range element in this file, in both modes, so the adoption ratchet counts one site. The
  // labelled mode names it by id (the label contract wants an explicit or a literal association).
  const id = useId()
  const input = (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={bare ? className : 'w-full accent-primary disabled:cursor-not-allowed disabled:opacity-50'}
      aria-label={bare ? ariaLabel : undefined}
    />
  )
  if (bare) return input
  return (
    <label htmlFor={id} className="block text-meta text-muted">
      <span className="mb-1 flex justify-between gap-2">
        <span>{label}</span>
        <b className="tabular-nums text-text">
          {value}
          {suffix}
        </b>
      </span>
      {input}
    </label>
  )
}
