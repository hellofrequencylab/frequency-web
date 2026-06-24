'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Wand2, ChevronDown } from 'lucide-react'
import type { CircleComposeSection } from '@/lib/ai/circle-compose'

// The Vera panel in the Circle builder, mirroring the Journey composer (ADR-302):
// a collapsible section with two moves. "Fill this section" buttons ask Vera to
// compose ONE section grounded in the draft so far; the parent merges the partial
// into the form and autosaves. The "tell Vera what to change" box applies a
// plain-language edit across the whole draft. The parent owns the form + the saves;
// this panel just collects intent and reports the outcome.

const SECTIONS: { key: CircleComposeSection; label: string }[] = [
  { key: 'card', label: 'About' },
  { key: 'pillars', label: 'Pillars inside' },
  { key: 'rhythm', label: 'Rhythm' },
  { key: 'thread', label: 'Thread' },
  { key: 'agreements', label: 'Agreements' },
  { key: 'remix', label: 'Remix ideas' },
]

export function CircleVeraPanel({
  onCompose,
  onEdit,
}: {
  /** Ask Vera to fill one section. Resolves to a short note (or null if nothing came back). */
  onCompose: (section: CircleComposeSection) => Promise<string | null>
  /** Apply a plain-language change. Resolves to a short note (or null if nothing changed). */
  onEdit: (request: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [change, setChange] = useState('')
  const [busySection, setBusySection] = useState<CircleComposeSection | null>(null)
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const compose = (section: CircleComposeSection) => {
    setNote(null)
    setBusySection(section)
    start(async () => {
      const result = await onCompose(section)
      setBusySection(null)
      setNote(result ?? 'Vera is offline right now. Fill this one in yourself and try again later.')
    })
  }

  const apply = () => {
    if (!change.trim()) return
    setNote(null)
    start(async () => {
      const result = await onEdit(change.trim())
      if (result) {
        setChange('')
        setNote(result)
      } else {
        setNote('Nothing to change there, or Vera is offline. Edit any field by hand instead.')
      }
    })
  }

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary-bg/20 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
        <h2 className="flex-1 text-base font-bold text-text">Build with Vera</h2>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {!open && (
        <p className="mt-1 text-sm text-muted">
          Have Vera fill a section, or tell her what to change in plain words.
        </p>
      )}

      {open && (
        <>
          <p className="mt-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Fill a section</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={pending}
                onClick={() => compose(s.key)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
              >
                <Wand2 className="h-3.5 w-3.5 text-primary-strong" aria-hidden />
                {busySection === s.key ? 'Filling…' : s.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-2xs font-semibold uppercase tracking-wide text-subtle">Tell Vera what to change</p>
          <textarea
            value={change}
            disabled={pending}
            onChange={(e) => setChange(e.target.value)}
            rows={2}
            placeholder="e.g. Make the Meetup biweekly. Or: more beginner-friendly. Or: shorten the about."
            className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
          />
          <div className="mt-2">
            <button
              type="button"
              disabled={pending || !change.trim()}
              onClick={apply}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
            >
              <Wand2 className="h-4 w-4" aria-hidden /> {pending && !busySection ? 'Applying…' : 'Apply with Vera'}
            </button>
          </div>

          {note && <p className="mt-2 text-xs text-muted">{note}</p>}
        </>
      )}
    </section>
  )
}
