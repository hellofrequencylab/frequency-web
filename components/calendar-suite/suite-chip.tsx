import type { CSSProperties } from 'react'
import type { ChipModel } from '@/lib/calendar/planner/chip'
import { KINDS } from '@/lib/calendar/planner/kinds'

// THE CHIP (README 1.3, section 6). One look for an item on the month grid: the kind's fill, border
// and text from the presentation table, the title over a line of option, short word, short time and
// flags. A run of days draws as a band that is rounded only where it truly starts and ends, and
// reaches across the cell gutters so it reads as one line. Server-safe: the click is the caller's.

/** A partner Space's mark: its initial in a ring. */
export function PartnerRing({ name }: { name: string }) {
  return (
    <span className="cal-ring" title={name} aria-label={name}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function SuiteChip({
  model,
  selected,
  partner,
  onSelect,
}: {
  model: ChipModel
  selected: boolean
  /** The name of the other Space on the Plan, when there is one. */
  partner?: string | null
  onSelect: (ref: ChipModel['ref']) => void
}) {
  const look = KINDS[model.kind]
  const done = model.kind === 'todo' && model.struck
  const style: CSSProperties = {
    background: done ? 'var(--bg-sunken)' : look.bg,
    border: look.bd,
    color: done ? 'var(--text-faint)' : look.fg,
  }
  if (model.band) {
    const r = (on: boolean) => (on ? '10px' : '3px')
    style.borderRadius = `${r(model.startsHere)} ${r(model.endsHere)} ${r(model.endsHere)} ${r(model.startsHere)}`
    style.marginInline = `${model.startsHere ? 0 : -5}px ${model.endsHere ? 0 : -5}px`
  }
  const meta = [model.option, model.word.toUpperCase(), model.time, ...model.flags].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      className="cal-chip"
      style={style}
      data-kind={model.kind}
      data-band={model.band || undefined}
      data-selected={selected || undefined}
      data-struck={model.struck || undefined}
      aria-pressed={selected}
      title={model.label}
      aria-label={model.label}
      onClick={() => onSelect(model.ref)}
    >
      <span className="cal-chip-text">
        <span className="cal-chip-t">{model.title || ' '}</span>
        <span className="cal-chip-m">{meta || ' '}</span>
      </span>
      {partner ? <PartnerRing name={partner} /> : null}
    </button>
  )
}
