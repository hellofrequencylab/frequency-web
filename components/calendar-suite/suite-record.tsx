'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/field'
import { agoLabel } from '@/lib/calendar/planner/details'
import type { DetailsActions, RecordLoad, RecordSubject } from './suite-details-actions'

// THE EDIT HISTORY AND THE THREAD (README 1.3). What the team did to this Plan or date, and what they
// said about it, in one list, newest first: three rows and "Show all N edits", then a line to leave a
// note. A Plan speaks for every date on it; a date that is on no Plan keeps a record of its own
// (space_plan_activity and space_plan_comments, entry_id arm). A comment is a record: it can be taken
// back by its author elsewhere, never edited, so there is nothing to edit here.

/** The rows shown before "Show all". */
const SHOWN = 3

interface RecordRow {
  id: string
  who: string
  text: string
  at: string
  note: boolean
}

function rowsOf(load: RecordLoad): RecordRow[] {
  const edits: RecordRow[] = load.activity
    // A note is shown as the note itself, not twice.
    .filter((a) => a.kind !== 'comment')
    .map((a) => ({ id: `a-${a.id}`, who: a.actorName ?? a.spaceName ?? 'Someone', text: a.summary, at: a.createdAt, note: false }))
  const notes: RecordRow[] = load.comments
    .filter((c) => !c.removed)
    .map((c) => ({ id: `c-${c.id}`, who: c.authorName ?? c.spaceName ?? 'Someone', text: `“${c.body}”`, at: c.createdAt, note: true }))
  return [...edits, ...notes].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
}

export interface RecordState {
  rows: RecordRow[] | null
  error: string | null
  /** "Dana Reyes · 2 h ago": the latest row, for the panel's header. */
  last: string
  reload: () => Promise<void>
}

/** Loads the record of one subject, and again whenever asked. Null subject loads nothing. */
export function useRecord(subject: RecordSubject | null, actions: DetailsActions, nowMs: number): RecordState {
  const key = subject ? `${subject.kind}:${subject.id}` : ''
  const [state, setState] = useState<{ key: string; load: RecordLoad | null; error: string | null }>({ key: '', load: null, error: null })
  const reload = useCallback(async () => {
    if (!subject) return
    const res = await actions.loadRecord(subject)
    setState({ key, load: 'error' in res ? null : res, error: 'error' in res ? res.error : null })
    // `subject` is read through `key`, which changes exactly when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, key])
  useEffect(() => {
    // The record loads from the server once the panel is open on this subject.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])
  const current = state.key === key ? state : { key, load: null, error: null }
  const rows = useMemo(() => (current.load ? rowsOf(current.load) : null), [current.load])
  const last = rows?.[0] ? `${rows[0].who} · ${agoLabel(rows[0].at, nowMs)}` : ''
  return { rows, error: current.error, last, reload }
}

export function SuiteRecord({
  subject,
  actions,
  record,
  nowMs,
  canPost,
}: {
  subject: RecordSubject
  actions: DetailsActions
  record: RecordState
  nowMs: number
  canPost: boolean
}) {
  const [all, setAll] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rows = record.rows ?? []
  const shown = all ? rows : rows.slice(0, SHOWN)

  const post = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await actions.postComment(subject, body)
      if ('error' in res) setError(res.error)
      else {
        setDraft('')
        await record.reload()
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cal-rec" aria-label="Edit history">
      <p className="cal-caps">Edit history</p>
      {record.error ? (
        <p role="alert" className="cal-err">
          {record.error}
        </p>
      ) : null}
      {record.rows === null && !record.error ? <p className="cal-as">Loading the history.</p> : null}
      {record.rows !== null && rows.length === 0 ? <p className="cal-serif">No edits yet. Leave the first note.</p> : null}
      {shown.length > 0 ? (
        <ul className="cal-plain cal-log">
          {shown.map((r) => (
            <li key={r.id} className="cal-logrow" data-note={r.note || undefined}>
              <span className="cal-logtext">{r.text}</span>
              <span className="cal-as">
                {r.who} {'·'} {agoLabel(r.at, nowMs)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length > SHOWN ? (
        <button type="button" className="cal-link cal-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${rows.length} edits`}
        </button>
      ) : null}
      {canPost ? (
        <div className="cal-compose">
          <Input
            aria-label="Leave a note for both teams"
            placeholder="Leave a note for both teams"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void post()
              }
            }}
          />
          <IconButton label="Post comment" variant="tinted" disabled={busy || !draft.trim()} onClick={() => void post()}>
            <FqIcon name="send" size={16} />
          </IconButton>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="cal-err">
          {error}
        </p>
      ) : null}
    </section>
  )
}
