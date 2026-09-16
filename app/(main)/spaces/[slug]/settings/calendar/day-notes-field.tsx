'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { WEEKDAY_NAMES, describeDayNote, type DayNote, type DayNoteInput } from '@/lib/calendar/day-notes'
import { removeDayNote, saveDayNote } from './entry-actions'

// DAY NOTES FIELD (ADR-1386). The small settings field behind the quiet labels on the calendar's day
// cards: "Quiet hours" on Mondays, "Retreat & rental" Friday and Saturday, or a note on a few dates.

const EMPTY: DayNoteInput = { label: '', mode: 'weekly', weekdays: [], startsOn: '', endsOn: '' }

export function DayNotesField({ slug, notes, canEdit }: { slug: string; notes: DayNote[]; canEdit: boolean }) {
  const router = useRouter()
  const [input, setInput] = useState<DayNoteInput>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await saveDayNote(slug, null, input)
      if (isError(res)) setError(res.error)
      else {
        setInput(EMPTY)
        router.refresh()
      }
    })
  }

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await removeDayNote(slug, id)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h3 className="text-body font-semibold text-text">Day notes</h3>
        <p className="text-body-sm text-muted">A few quiet words on a day of the calendar, like Quiet hours on Mondays. Only your team sees them.</p>
      </div>

      {notes.length > 0 && (
        <ul className="divide-y divide-border rounded-control border border-border">
          {notes.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-medium text-text">{n.label}</span>
                <span className="block text-meta text-muted">
                  {describeDayNote(n)}
                </span>
              </span>
              {canEdit && (
                <IconButton label={`Delete ${n.label}`} onClick={() => remove(n.id)} disabled={pending}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-1">
            <label htmlFor="day-note-label" className={labelClasses}>Note</label>
            <Input
              id="day-note-label"
              maxLength={40}
              placeholder="Quiet hours"
              value={input.label}
              onChange={(e) => setInput({ ...input, label: e.target.value })}
            />
          </div>

          <div className="inline-flex rounded-control border border-border p-0.5" role="group" aria-label="Applies to">
            {(['weekly', 'dates'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={input.mode === m}
                onClick={() => setInput({ ...input, mode: m })}
                className={buttonClasses(input.mode === m ? 'primary' : 'ghost', 'sm')}
              >
                {m === 'weekly' ? 'Every week' : 'Specific dates'}
              </button>
            ))}
          </div>

          {input.mode === 'weekly' && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Days of the week">
              {WEEKDAY_NAMES.map((name, d) => {
                const on = input.weekdays.includes(d)
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    aria-label={name}
                    onClick={() =>
                      setInput({ ...input, weekdays: on ? input.weekdays.filter((x) => x !== d) : [...input.weekdays, d] })
                    }
                    className={buttonClasses(on ? 'primary' : 'secondary', 'sm')}
                  >
                    {name.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label htmlFor="day-note-from" className={labelClasses}>{input.mode === 'weekly' ? 'From (optional)' : 'Date'}</label>
              <Input id="day-note-from" type="date" value={input.startsOn} onChange={(e) => setInput({ ...input, startsOn: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <label htmlFor="day-note-to" className={labelClasses}>{input.mode === 'weekly' ? 'Until (optional)' : 'Through (optional)'}</label>
              <Input id="day-note-to" type="date" min={input.startsOn || undefined} value={input.endsOn} onChange={(e) => setInput({ ...input, endsOn: e.target.value })} />
            </div>
          </div>


          {error && (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving' : 'Add note'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
