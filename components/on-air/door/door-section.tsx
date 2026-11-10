'use client'

// A sub-menu row on the Mindless door (LIVE-2241): icon, name, the current value in one line, a
// chevron; tap to expand in place. Several may be open at once and the open set is remembered per
// viewer (a convenience, so localStorage), never anything the member chose about their practice.
// The design (/mnt/project-files/mindless-timer/02-INTERFACE-PLAN.md) has no second screen: every
// setting the engines own is reachable from this one door.

import { useCallback, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

const OPEN_KEY = 'fq_timer_door_sections'

function readOpen(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(OPEN_KEY)
    const v: unknown = raw ? JSON.parse(raw) : null
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** Which sub-menus are open, remembered per viewer. */
export function useDoorSections(): { isOpen: (id: string) => boolean; toggle: (id: string) => void } {
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen)
  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify(next))
      } catch {
        // remembering an open row is a nicety, never a blocker
      }
      return next
    })
  }, [])
  return { isOpen: (id) => !!open[id], toggle }
}

export function DoorSection({
  icon,
  name,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  name: string
  /** The current value, written out, so the member never has to open the row to know the state. */
  summary: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const panelId = useId()
  return (
    <div className="rounded-control border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className="shrink-0 text-muted" aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-semibold text-text">{name}</span>
          <span className="block truncate text-meta text-muted">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 border-t border-border px-3 py-3">
          {children}
        </div>
      )}
    </div>
  )
}

/** A row of small choice buttons inside a section (a pattern, a voice, an interval). */
export function OptionRow<V extends string | number | null>({
  label,
  value,
  options,
  onChange,
  columns = 4,
}: {
  label: string
  value: V
  options: readonly { value: V; label: string }[]
  onChange: (v: V) => void
  columns?: 3 | 4 | 5
}) {
  const id = useId()
  const cols = columns === 3 ? 'grid-cols-3' : columns === 5 ? 'grid-cols-5' : 'grid-cols-4'
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="text-meta font-medium text-muted">{label}</p>
      <div className={`mt-1.5 grid ${cols} gap-2`}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-control border px-2 py-1.5 text-meta tabular-nums transition-colors ${
              o.value === value ? 'border-primary bg-primary-bg/40 font-semibold text-text' : 'border-border text-muted hover:bg-surface-elevated'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A labelled 0 to 100 slider for a volume. */
export function VolumeRange({ label, value, onChange, onCommit }: { label: string; value: number; onChange: (v: number) => void; onCommit?: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-meta font-medium text-muted">{label}</span>
        <span className="text-meta font-medium tabular-nums text-muted">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={(e) => onCommit?.(Number((e.currentTarget as HTMLInputElement).value) / 100)}
        aria-label={label}
        className="mt-1.5 w-full accent-primary"
      />
    </div>
  )
}

/** An on/off row with the kit's switch semantics (role=switch). */
export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full items-center justify-between rounded-control border px-3 py-2 text-left text-meta transition-colors ${
        checked ? 'border-primary bg-primary-bg/40 text-text' : 'border-border text-muted hover:bg-surface-elevated'
      }`}
    >
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-meta text-muted">{hint}</span>}
      </span>
      <span className={checked ? 'font-semibold text-primary-strong' : 'text-subtle'}>{checked ? 'on' : 'off'}</span>
    </button>
  )
}
