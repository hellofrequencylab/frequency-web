'use client'

// The Mindless door's control vocabulary (LIVE-2245, the Claude Design handoff of 2026-11-10):
// a segmented track whose chosen segment lifts as a card, a tile grid of the same family, a
// stepper, a slider row, a switch row, the mobile disclosure row (icon, name, value, chevron;
// one open at a time) and the web section (a label row over its controls). Every colour is a
// semantic token (docs/THEME.md); the selected look is the design's lifted card, never a brand fill,
// because a choice is a state and the one action fill on the door is the Go button.

import { useId, type ReactNode } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

export type SegmentOption<V extends string | number | null> = { value: V; label: ReactNode; aria?: string; disabled?: boolean }

const TRACK = 'rounded-control bg-surface-elevated'
const SEG_ON = 'bg-surface text-text lift-1'
const SEG_OFF = 'bg-transparent text-muted hover:text-text'

/** One row of equal segments on a track. `size` sm is the mobile sub-menu row (38px), md the web
 *  row (40px), lg the mobile preset bar (44px). */
export function Segmented<V extends string | number | null>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className = '',
}: {
  label: string
  value: V
  options: readonly SegmentOption<V>[]
  onChange: (v: V) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const h = size === 'sm' ? 'h-9.5 rounded-[9px] text-body-sm' : size === 'lg' ? 'h-11 rounded-[10px] text-body' : 'h-10 rounded-[10px] text-body-sm'
  const pad = size === 'sm' ? 'gap-0.75 p-0.75 rounded-[12px]' : 'gap-1 p-1'
  return (
    <div role="group" aria-label={label} className={`grid ${TRACK} ${pad} ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.aria}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`min-w-0 truncate border-0 px-1 font-semibold tabular-nums transition-colors ${h} ${o.value === value ? SEG_ON : SEG_OFF} disabled:opacity-40`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A grid of taller segments with an icon (or a second line) over the label: the Style and Breath
 *  pattern pickers. */
export function Tiles<V extends string>({
  label,
  value,
  options,
  onChange,
  columns,
  height = 'h-15',
  className = '',
}: {
  label: string
  value: V
  options: readonly { value: V; icon?: ReactNode; label: string; sub?: string; disabled?: boolean }[]
  onChange: (v: V) => void
  columns: number
  height?: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`grid gap-1 p-1 ${TRACK} ${className}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border-0 px-1 text-body-sm font-semibold transition-colors ${height} ${on ? SEG_ON : SEG_OFF} disabled:opacity-40`}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
            {o.sub && <span className="text-2xs font-normal tabular-nums text-muted">{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** A labelled minus / value / plus row. `field` draws the web card around it. */
export function Stepper({
  label,
  value,
  onLess,
  onMore,
  lessDisabled,
  moreDisabled,
  field = false,
}: {
  label: string
  value: string
  onLess: () => void
  onMore: () => void
  lessDisabled?: boolean
  moreDisabled?: boolean
  field?: boolean
}) {
  const btn = field
    ? 'flex h-11 w-9 items-center justify-center text-text disabled:opacity-35'
    : 'flex h-9 w-11 items-center justify-center rounded-pill bg-surface-elevated text-text disabled:opacity-35'
  return (
    <div className={field ? 'flex h-13 items-center rounded-control bg-surface pl-3.5 pr-1 ring-1 ring-inset ring-border-strong' : 'flex h-11 items-center'}>
      <span className={`flex-1 text-body-sm font-medium ${field ? 'text-muted' : 'text-text'}`}>{label}</span>
      <button type="button" aria-label={`${label} down`} disabled={lessDisabled} onClick={onLess} className={btn}>
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className={`text-center text-body font-semibold tabular-nums text-text ${field ? 'min-w-11' : 'min-w-14'}`}>{value}</span>
      <button type="button" aria-label={`${label} up`} disabled={moreDisabled} onClick={onMore} className={btn}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

/** A labelled range with its value written out beside it. `inline` is the web's right-aligned
 *  110px slider; the default is the mobile 64px / 1fr / 44px grid row. */
export function Slider({
  label,
  min,
  max,
  value,
  text,
  onChange,
  onCommit,
  accent,
  inline = false,
  stacked = false,
}: {
  label: string
  min: number
  max: number
  value: number
  text: string
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  accent: 'still' | 'move'
  inline?: boolean
  /** The web custom-count field: the label over the slider, the value at the label's right. */
  stacked?: boolean
}) {
  const color = accent === 'move' ? 'accent-move' : 'accent-text'
  const input = (
    <Input
      variant="seamless"
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number(e.currentTarget.value))}
      onKeyUp={(e) => onCommit?.(Number(e.currentTarget.value))}
      className={`m-0 h-7 ${inline ? 'w-27.5' : 'w-full'} ${color}`}
    />
  )
  if (stacked) {
    return (
      <div className="flex flex-col gap-1.5 text-body-sm font-medium text-text">
        <span className="flex justify-between">
          {label}
          <span className="tabular-nums text-muted">{text}</span>
        </span>
        {input}
      </div>
    )
  }
  if (inline) {
    return (
      <div className="flex items-center gap-2.5 text-body-sm font-medium text-muted">
        {label}
        {input}
        <span className="w-9 text-right tabular-nums text-text">{text}</span>
      </div>
    )
  }
  return (
    <div className="grid h-10 grid-cols-[64px_1fr_44px] items-center gap-2.5 text-body-sm font-medium text-text">
      {label}
      {input}
      <span className="text-right tabular-nums text-muted">{text}</span>
    </div>
  )
}

/** A label with the kit switch. The web lays several in one line (`inline`); the mobile row is
 *  label left, switch right. */
export function SwitchRow({ label, checked, onChange, inline = false }: { label: string; checked: boolean; onChange: (v: boolean) => void; inline?: boolean }) {
  const id = useId()
  return (
    <div className={inline ? 'flex h-10 items-center gap-2.5' : 'flex h-11 items-center justify-between'}>
      {inline && <Switch id={id} checked={checked} onCheckedChange={onChange} aria-labelledby={`${id}-l`} />}
      <span id={`${id}-l`} className="text-body-sm font-medium text-text">{label}</span>
      {!inline && <Switch id={id} checked={checked} onCheckedChange={onChange} aria-labelledby={`${id}-l`} />}
    </div>
  )
}

/** The mobile disclosure row: icon, name, the value in one line, a chevron; the body expands in
 *  place. The caller opens one row at a time. */
export function MenuRow({
  icon,
  name,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode
  name: string
  summary: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const panelId = useId()
  return (
    <div className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-border">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="flex h-13 w-full items-center gap-3 pl-4 pr-3.5 text-left">
        <span className="shrink-0 text-muted" aria-hidden>{icon}</span>
        <span className="shrink-0 text-body-sm font-semibold text-text">{name}</span>
        <span className="min-w-0 flex-1 truncate text-right text-body-sm text-muted">{summary}</span>
        <ChevronDown className={`h-3.75 w-3.75 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-2.5 px-4 pb-3.5">
          {children}
        </div>
      )}
    </div>
  )
}

/** A small caption over a control inside a mobile row. */
export function RowLabel({ children }: { children: ReactNode }) {
  return <span className="text-meta font-medium text-muted">{children}</span>
}

/** A web section: a bold label, an optional right-hand aside, then the controls. */
export function WebSection({ label, aside, children, className = '' }: { label: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-2.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-sm font-semibold text-text">{label}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** The web dialog's keyboard hint (Esc, Enter). */
export function Keycap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`rounded-[6px] px-1.5 py-1 text-2xs font-semibold ring-1 ring-inset ring-current ${className}`}>{children}</span>
}
