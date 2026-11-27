'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import type { TodoProposal } from '@/lib/calendar/meeting-notes'
import { acceptMeetingTodos, proposeMeetingTodos } from './meeting-actions'

// MEETING NOTES TO TO-DOS (LIVE-2533), in the calendar drawer of a saved meeting. Vera reads the
// saved notes and lists the to-dos in them; each line can be unticked, given another owner or another
// day, and Accept files only the ticked ones. Nothing is written until Accept. Save the notes first:
// Vera reads what is stored, not what is being typed.

interface Line extends TodoProposal {
  keep: boolean
}

export function MeetingTodosPanel({ slug, entryId }: { slug: string; entryId: string }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [people, setPeople] = useState<{ value: string; label: string }[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const ask = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await proposeMeetingTodos(slug, entryId)
      if (isError(res)) return setError(res.error)
      setPeople(res.data.people.map((p) => ({ value: p.id, label: p.name })))
      setLines(res.data.todos.map((t) => ({ ...t, keep: true })))
      if (res.data.todos.length === 0) setNote('Vera found no to-dos in these notes. Start a line with "TODO", "- [ ]" or a name and "to".')
    })
  }

  const edit = (i: number, patch: Partial<Line>) => setLines((cur) => (cur ? cur.map((l, j) => (j === i ? { ...l, ...patch } : l)) : cur))

  const accept = () => {
    if (!lines) return
    const kept = lines.filter((l) => l.keep)
    setError(null)
    start(async () => {
      const res = await acceptMeetingTodos(slug, entryId, kept)
      if (isError(res)) return setError(res.error)
      setLines(null)
      setNote(`Added ${res.data.added} ${res.data.added === 1 ? 'to-do' : 'to-dos'} to your list.`)
    })
  }

  return (
    <div className="grid gap-2" data-meeting-todos>
      <div>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={ask}>
          Turn notes into to-dos
        </Button>
        <p className="text-meta text-muted">Vera reads the saved notes and proposes to-dos. Nothing is added until you accept.</p>
      </div>
      {lines && lines.length > 0 && (
        <div className="rounded-control border border-border px-3 py-2 text-body-sm">
          <p className="font-medium">Proposal. Untick anything that is not a to-do.</p>
          <ul className="mt-1 grid gap-2">
            {lines.map((l, i) => (
              <li key={`${l.source}-${i}`} className="grid gap-1">
                <Checkbox checked={l.keep} disabled={pending} onChange={(e) => edit(i, { keep: e.target.checked })} label={l.title} />
                <div className="flex flex-wrap gap-2 pl-6">
                  <Select
                    aria-label={`Who does "${l.title}"`}
                    value={l.assigneeProfileId ?? ''}
                    emptyLabel="Nobody yet"
                    options={people}
                    wrapperClassName="w-auto"
                    onChange={(e) => edit(i, { assigneeProfileId: e.target.value || null })}
                  />
                  <Input
                    type="date"
                    aria-label={`When "${l.title}" is due`}
                    className="w-40"
                    value={l.dueDay ?? ''}
                    onChange={(e) => edit(i, { dueDay: e.target.value || null })}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" className="mt-2" disabled={pending || !lines.some((l) => l.keep)} onClick={accept}>
            Add these to-dos
          </Button>
        </div>
      )}
      {note && (
        <p className="text-meta text-muted" role="status">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
