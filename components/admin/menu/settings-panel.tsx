'use client'

import { useState, useTransition } from 'react'
import { Timer } from 'lucide-react'
import type { MenuSettings } from '@/lib/menus/types'
import { setMenuSettings } from '@/lib/menus/actions'

// The global Open & Dwell speed panel (requirement 2). Numeric sliders + inputs for
// the three mega-menu timings, saved via setMenuSettings. Ranges mirror the DB CHECK
// clamps: openDelayMs 0..2000, dwellMs 0..10000, fadeMs 0..3000. Optimistic with
// rollback and an aria-live status line.
type Field = { key: keyof MenuSettings; label: string; help: string; min: number; max: number; step: number }

const FIELDS: Field[] = [
  {
    key: 'openDelayMs',
    label: 'Open delay',
    help: 'How long to hover before a panel opens. Range 0 to 2000 ms.',
    min: 0,
    max: 2000,
    step: 50,
  },
  {
    key: 'dwellMs',
    label: 'Dwell',
    help: 'How long an open panel stays after the pointer leaves. Range 0 to 10000 ms.',
    min: 0,
    max: 10000,
    step: 100,
  },
  {
    key: 'fadeMs',
    label: 'Fade',
    help: 'The open and close fade duration. Range 0 to 3000 ms.',
    min: 0,
    max: 3000,
    step: 20,
  },
]

export function SettingsPanel({ initial }: { initial: MenuSettings }) {
  const [values, setValues] = useState<MenuSettings>(initial)
  const [saved, setSaved] = useState<MenuSettings>(initial)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dirty =
    values.openDelayMs !== saved.openDelayMs ||
    values.dwellMs !== saved.dwellMs ||
    values.fadeMs !== saved.fadeMs

  function set(key: keyof MenuSettings, raw: number, field: Field) {
    const clamped = Math.max(field.min, Math.min(field.max, Math.round(raw)))
    setValues((v) => ({ ...v, [key]: Number.isFinite(clamped) ? clamped : v[key] }))
  }

  function save() {
    const next = values
    const prevSaved = saved
    setError(null)
    setStatus('Saving speed settings')
    setSaved(next) // optimistic
    startTransition(async () => {
      const res = await setMenuSettings(next)
      if (res.ok) {
        setStatus('Speed settings saved')
      } else {
        setSaved(prevSaved) // rollback
        setError(res.error)
        setStatus('Could not save speed settings')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          <p className="text-sm text-muted">
            Tune how mega-menu panels open, linger, and fade. These timings apply to every
            surface.
          </p>
        </div>
        <span className="shrink-0 text-xs text-subtle" aria-live="polite">
          {isPending ? 'Saving…' : status}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="min-w-0">
            <label
              htmlFor={`setting-${f.key}`}
              className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-subtle"
            >
              <span>{f.label}</span>
              <span className="tabular-nums text-muted">{values[f.key]} ms</span>
            </label>
            <input
              id={`setting-${f.key}`}
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={values[f.key]}
              disabled={isPending}
              onChange={(e) => set(f.key, Number(e.target.value), f)}
              className="w-full cursor-pointer accent-primary disabled:opacity-50"
            />
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                aria-label={`${f.label} in milliseconds`}
                min={f.min}
                max={f.max}
                step={f.step}
                value={values[f.key]}
                disabled={isPending}
                onChange={(e) => set(f.key, Number(e.target.value), f)}
                className="w-24 rounded-lg border border-border bg-canvas/40 px-2 py-1 text-sm tabular-nums text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <span className="text-xs text-subtle">
                {f.min} to {f.max}
              </span>
            </div>
            <p className="mt-1 text-xs text-subtle">{f.help}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save speed settings'}
        </button>
        {dirty && !isPending && <span className="text-xs text-subtle">Unsaved changes</span>}
      </div>
    </div>
  )
}
