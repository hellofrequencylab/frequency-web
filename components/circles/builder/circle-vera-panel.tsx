'use client'

import { capsLabel } from '@/components/ui/caps-label'
import { useState, useTransition } from 'react'
import { Sparkles, Wand2, ChevronDown } from 'lucide-react'
import type { CircleComposeSection } from '@/lib/ai/circle-compose'
import { Textarea } from '@/components/ui/field'
import { Button } from '@/components/ui/button'

// Section and change requests return coaching notes only. The parent owns human edits.

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
  /** Ask Vera questions about one section. Resolves to a short note (or null if nothing came back). */
  onCompose: (section: CircleComposeSection) => Promise<string | null>
  /** Coach a requested change. Resolves to a short note (or null if nothing changed). */
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
    <section className="rounded-card border border-primary/30 bg-primary-bg/20 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
        <h2 className="flex-1 text-body font-bold text-text">Writing coach</h2>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {!open && (
        <p className="mt-1 text-body-sm text-muted">
          Get questions to help you write a section or think through a change.
        </p>
      )}

      {open && (
        <>
          <p className={capsLabel('mt-2 text-2xs font-semibold text-muted')}>Think through a section</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={pending}
                onClick={() => compose(s.key)}
                className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-body-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
              >
                <Wand2 className="h-3.5 w-3.5 text-primary-strong" aria-hidden />
                {busySection === s.key ? 'Thinking…' : s.label}
              </button>
            ))}
          </div>

          <p className={capsLabel('mt-4 text-2xs font-semibold text-muted')}>What would you like to improve?</p>
          <Textarea
            value={change}
            disabled={pending}
            onChange={(e) => setChange(e.target.value)}
            rows={2}
            aria-label="Tell Vera what to change"
            placeholder="e.g. Make the Meetup biweekly. Or: more beginner-friendly. Or: shorten the about."
            className="mt-2 resize-y"
          />
          <div className="mt-2">
            <Button
              type="button"
              disabled={pending || !change.trim()}
              onClick={apply}
            >
              <Wand2 className="h-4 w-4" aria-hidden /> {pending && !busySection ? 'Thinking…' : 'Get writing prompts'}
            </Button>
          </div>

          {note && <p className="mt-2 text-meta text-muted">{note}</p>}
        </>
      )}
    </section>
  )
}
