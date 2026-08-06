'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveSeriesDisplay } from './series-actions'
import { Input } from '@/components/ui/field'
import {
  MIN_CARDS_PER_SERIES,
  MAX_CARDS_PER_SERIES,
  MIN_RAIL_DATES,
  MAX_RAIL_DATES,
  MIN_INDEXED_OCCURRENCES,
  MAX_INDEXED_OCCURRENCES,
  type SeriesDisplayConfig,
} from '@/lib/events/series-config.shared'

// The operator form for the repeating-events knobs (ADR-897 §7.4): three integers, one save, no
// deploy. Models app/(main)/admin/ai/autonomy-controls.tsx (local editable copy, save on the
// button, an inline confirmation). The section title and description live on the page's
// <AdminSection> wrapper, so this component is only the control surface.
//
// The saved line echoes the STORED value, not what was typed: the action clamps, so an operator who
// asks for 99 cards sees 60 come back and learns the range from the product rather than from a doc.
//
// The bounds on each input come from the settings module's exported constants, so the browser's own
// validation and the server's clamp can never disagree. The server clamps regardless: an input's
// min/max is a hint, not a gate.
//
// 🔴 THEY COME FROM `series-config.shared`, NOT `series-config`. The latter is `server-only`, and
// importing it from here is a `pnpm build` failure that tsc and vitest both wave through (vitest
// stubs `server-only`). That is not hypothetical: it is how this file first shipped. The shared
// module is pure and re-exported by the server one, so the two can never drift.

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-body-sm font-semibold text-text">{label}</span>
      <span className="mt-0.5 block text-meta text-muted">{hint}</span>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-24 px-2.5 py-1.5 tabular-nums"
      />
    </label>
  )
}

export function SeriesDisplaySection({ config }: { config: SeriesDisplayConfig }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [cards, setCards] = useState(config.cardsPerSeries)
  const [rail, setRail] = useState(config.railDates)
  const [indexed, setIndexed] = useState(config.indexedOccurrences)
  const [stored, setStored] = useState<SeriesDisplayConfig | null>(null)

  function save() {
    setStored(null)
    start(async () => {
      const next = await saveSeriesDisplay({
        cardsPerSeries: cards,
        railDates: rail,
        indexedOccurrences: indexed,
      })
      // Snap the inputs back to what was actually stored, so the form never shows a number the
      // product is not using.
      setCards(next.cardsPerSeries)
      setRail(next.railDates)
      setIndexed(next.indexedOccurrences)
      setStored(next)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Cards in listings"
            hint={`${MIN_CARDS_PER_SERIES} to ${MAX_CARDS_PER_SERIES}`}
            value={cards}
            min={MIN_CARDS_PER_SERIES}
            max={MAX_CARDS_PER_SERIES}
            onChange={setCards}
            disabled={pending}
          />
          <NumberField
            label="Dates on the event page"
            hint={`${MIN_RAIL_DATES} to ${MAX_RAIL_DATES}`}
            value={rail}
            min={MIN_RAIL_DATES}
            max={MAX_RAIL_DATES}
            onChange={setRail}
            disabled={pending}
          />
          <NumberField
            label="Occurrences search engines index"
            hint={`${MIN_INDEXED_OCCURRENCES} to ${MAX_INDEXED_OCCURRENCES}`}
            value={indexed}
            min={MIN_INDEXED_OCCURRENCES}
            max={MAX_INDEXED_OCCURRENCES}
            onChange={setIndexed}
            disabled={pending}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {pending ? 'Saving' : 'Save'}
          </button>
          {stored && (
            <p role="status" className="text-body-sm text-muted">
              Saved. Listings show {stored.cardsPerSeries} {stored.cardsPerSeries === 1 ? 'card' : 'cards'} per
              repeating event, the event page offers {stored.railDates}{' '}
              {stored.railDates === 1 ? 'date' : 'dates'}, and search engines index{' '}
              {stored.indexedOccurrences} beyond the first.
            </p>
          )}
        </div>

        <p className="text-meta text-subtle">
          Listings pick the new numbers up on their next render. Saving here refreshes them for you.
        </p>
      </div>
    </div>
  )
}
